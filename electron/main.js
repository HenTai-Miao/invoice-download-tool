import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'fs/promises'
import fsSync from 'node:fs'
import axios from 'axios'
import FormData from 'form-data'
import os from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ===================== 配置 ===================== */

const BASE_DIR = path.join(os.tmpdir(), 'invoice')
const PENDING_UPLOAD_DIR = path.join(BASE_DIR, 'pending-upload')
const UPLOADED_DIR = path.join(BASE_DIR, 'uploaded')
const STATE_FILE = path.join(BASE_DIR, 'upload-state.json')

const UPLOAD_API_URL =
  'http://192.168.111.105:8083/zz-resource/oss/endpoint/invoice-put-file'

const MAX_CONCURRENT = 3
const CHECK_INTERVAL = 5000
const UPLOAD_TIMEOUT = 30000
const STUCK_TIMEOUT = 40000
const RETRY_INTERVAL = 60_000
const MAX_HISTORY = 200

/* ===================== 运行态 ===================== */

let mainWindow
const fileStatusMap = new Map()
const processingFiles = new Set()
const uploadHistory = []

const FileStatus = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  FAILED: 'failed'
}

/* ===================== 状态落盘（防抖） ===================== */

let saveTimer = null

function persistStateDebounced() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      const obj = Object.fromEntries(fileStatusMap)
      await fs.mkdir(BASE_DIR, { recursive: true })
      await fs.writeFile(STATE_FILE, JSON.stringify(obj, null, 2))
    } catch {}
  }, 1000)
}

function updateStatus(name, status, progress = 0, size = 0, extra = {}) {
  const prev = fileStatusMap.get(name) || {}
  const next = {
    name,
    status,
    progress,
    size,
    lastUpdate: Date.now(),
    ...prev,
    ...extra
  }

  fileStatusMap.set(name, next)
  persistStateDebounced()

  mainWindow?.webContents.send(
    'file-status-update',
    Array.from(fileStatusMap.values())
  )
}

/* ===================== 状态恢复 ===================== */

async function restoreState() {
  if (!fsSync.existsSync(STATE_FILE)) return

  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8')
    const saved = JSON.parse(raw)

    Object.entries(saved).forEach(([name, meta]) => {
      // uploading 一律视为失败
      if (meta.status === FileStatus.UPLOADING) {
        meta.status = FileStatus.FAILED
        meta.lastFailedTime = Date.now()
      }
      fileStatusMap.set(name, meta)
    })
  } catch {}
}

/* ===================== 上传核心 ===================== */

async function startUpload(fileName) {
  if (processingFiles.has(fileName)) return
  processingFiles.add(fileName)

  const filePath = path.join(PENDING_UPLOAD_DIR, fileName)

  let stats
  try {
    stats = await fs.stat(filePath)
  } catch {
    processingFiles.delete(fileName)
    return
  }

  updateStatus(fileName, FileStatus.UPLOADING, 0, stats.size)

  try {
    const formData = new FormData()
    formData.append(
      'file',
      fsSync.createReadStream(filePath),
      { filename: fileName, contentType: 'application/zip' }
    )

    const res = await axios.post(UPLOAD_API_URL, formData, {
      headers: formData.getHeaders(),
      timeout: UPLOAD_TIMEOUT
    })

    if (res.data?.code !== 200) throw new Error()

    await fs.mkdir(UPLOADED_DIR, { recursive: true })
    await fs.rename(filePath, path.join(UPLOADED_DIR, fileName))

    uploadHistory.unshift({
      name: fileName,
      size: stats.size,
      uploadTime: new Date().toLocaleString()
    })
    uploadHistory.length > MAX_HISTORY && uploadHistory.pop()

    mainWindow?.webContents.send(
      'upload-history-update',
      uploadHistory
    )

    updateStatus(fileName, FileStatus.SUCCESS, 100, stats.size)

    setTimeout(() => {
      // 成功：从 map 删除（也就不会再落盘）
      fileStatusMap.delete(fileName)
      persistStateDebounced()

      mainWindow?.webContents.send(
        'file-status-update',
        Array.from(fileStatusMap.values())
      )
      checkQueue()
    }, 2000)

  } catch {
    // 上传失败：保留失败状态（会落盘），等待下一次重试
    updateStatus(
      fileName,
      FileStatus.FAILED,
      0,
      stats.size,
      { lastFailedTime: Date.now() }
    )
  } finally {
    processingFiles.delete(fileName)
  }
}

/* ===================== 并发调度 ===================== */

async function checkQueue() {
  try {
    await fs.mkdir(PENDING_UPLOAD_DIR, { recursive: true })
    const files = (await fs.readdir(PENDING_UPLOAD_DIR))
    .filter(f => f.endsWith('.zip'))

    // 新文件标记为 pending
    for (const f of files) {
      if (!fileStatusMap.has(f)) {
        const s = await fs.stat(path.join(PENDING_UPLOAD_DIR, f))
        updateStatus(f, FileStatus.PENDING, 0, s.size)
      }
    }

    const pending = files.filter(f => {
      const m = fileStatusMap.get(f)
      if (!m || processingFiles.has(f)) return false

      // pending 直接上传
      if (m.status === FileStatus.PENDING) return true

      // failed 超过 RETRY_INTERVAL 再重试
      if (
        m.status === FileStatus.FAILED &&
        Date.now() - (m.lastFailedTime || 0) > RETRY_INTERVAL
      ) return true

      return false
    })

    const canRun = MAX_CONCURRENT - processingFiles.size
    pending.slice(0, canRun).forEach(startUpload)
  } catch {}
}

/* ===================== Electron ===================== */

app.whenReady().then(async () => {
  await restoreState()

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload/index.js')
    }
  })

  Menu.setApplicationMenu(null)

  process.env.VITE_DEV_SERVER_URL
    ? mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    : mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))

  // 立即执行一次队列检查
  checkQueue()

  setInterval(() => {
    const now = Date.now()
    fileStatusMap.forEach((v, k) => {
      if (
        v.status === FileStatus.UPLOADING &&
        now - v.lastUpdate > STUCK_TIMEOUT
      ) {
        // 卡住了：标记失败
        updateStatus(
          k,
          FileStatus.FAILED,
          0,
          v.size,
          { lastFailedTime: Date.now() }
        )
        processingFiles.delete(k)
      }
    })
    checkQueue()
  }, CHECK_INTERVAL)
})

ipcMain.handle('get-upload-history', () => uploadHistory)
