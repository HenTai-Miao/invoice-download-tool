import { app, BrowserWindow, ipcMain, Menu, dialog, globalShortcut } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'fs/promises'
import fsSync from 'node:fs'
import axios from 'axios'
import FormData from 'form-data'
import os from 'node:os'
import { spawn } from 'node:child_process'
import net from 'node:net'
import {
  FileStatus,
  mergeUploadStatus,
  selectUploadCandidates
} from './upload-state.js'
import {
  UploadBusinessError,
  normalizeUploadError
} from './upload-errors.js'
import { createUploadLogger } from './upload-logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ===================== 配置 ===================== */

const BASE_DIR = path.join(os.tmpdir(), 'invoice')
const PENDING_UPLOAD_DIR = path.join(BASE_DIR, 'pending-upload')
const UPLOADED_DIR = path.join(BASE_DIR, 'uploaded')
const STATE_FILE = path.join(BASE_DIR, 'upload-state.json')
const SCRIPT_CONFIG_FILE = path.join(app.getPath('userData'), 'script-config.json')
const UPLOAD_LOG_DIR = path.join(app.getPath('userData'), 'logs')

const UPLOAD_API_URL =
  'http://10.141.24.63:8083/zz-resource/oss/endpoint/invoice-put-file'

const MAX_CONCURRENT = 3
const CHECK_INTERVAL = 5000
const UPLOAD_TIMEOUT = 30000
const STUCK_TIMEOUT = 40000
const RETRY_INTERVAL = 60_000
const MAX_HISTORY = 200

/* ===================== 运行态 ===================== */

let mainWindow
let scriptProcess = null // 脚本进程引用
const fileStatusMap = new Map()
const processingFiles = new Set()
const uploadControllers = new Map()
const uploadHistory = []
const uploadLogger = createUploadLogger({ directory: UPLOAD_LOG_DIR })

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

function getStatusList() {
  return Array.from(fileStatusMap.values())
}

function notifyStatusUpdate() {
  mainWindow?.webContents.send('file-status-update', getStatusList())
}

function updateStatus(name, status, progress = 0, size = 0, extra = {}) {
  const prev = fileStatusMap.get(name) || {}
  const next = mergeUploadStatus(prev, {
    name,
    status,
    progress,
    size,
    now: Date.now(),
    extra
  })

  fileStatusMap.set(name, next)
  persistStateDebounced()
  notifyStatusUpdate()
}

async function recordUploadEvent(event, details) {
  try {
    await uploadLogger.log(event, details)
  } catch (error) {
    console.error('写入上传日志失败:', error)
  }
}

function pruneMissingFileStatuses(files) {
  const existingFiles = new Set(files)
  const now = Date.now()
  let changed = false

  fileStatusMap.forEach((meta, name) => {
    if (existingFiles.has(name) || processingFiles.has(name)) return
    if (
      meta.status === FileStatus.SUCCESS &&
      now - (meta.lastUpdate || 0) < 2000
    ) return

    fileStatusMap.delete(name)
    changed = true
  })

  if (changed) {
    persistStateDebounced()
    notifyStatusUpdate()
  }
}

/* ===================== 状态恢复 ===================== */

async function restoreState() {
  if (!fsSync.existsSync(STATE_FILE)) return

  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8')
    const saved = JSON.parse(raw)
    let repaired = false

    Object.entries(saved).forEach(([name, meta]) => {
      // uploading 一律视为失败
      if (meta.status === FileStatus.UPLOADING) {
        meta.status = FileStatus.FAILED
        meta.lastFailedTime = Date.now()
        meta.nextRetryAt = meta.lastFailedTime + RETRY_INTERVAL
        meta.lastError = '应用上次上传时意外退出'
        meta.retryable = true
        repaired = true
      }
      fileStatusMap.set(name, meta)
    })
    if (repaired) persistStateDebounced()
  } catch {
    console.error('恢复上传状态失败')
  }
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

  const uploadStartedAt = Date.now()
  const uploadController = new AbortController()
  uploadControllers.set(fileName, uploadController)
  updateStatus(fileName, FileStatus.UPLOADING, 0, stats.size, {
    lastError: null,
    httpStatus: null,
    businessCode: null,
    nextRetryAt: null,
    retryable: null
  })
  await recordUploadEvent('upload_started', {
    fileName,
    size: stats.size
  })

  try {
    const formData = new FormData()
    formData.append(
      'file',
      fsSync.createReadStream(filePath),
      { filename: fileName, contentType: 'application/zip' }
    )

    const res = await axios.post(UPLOAD_API_URL, formData, {
      headers: formData.getHeaders(),
      timeout: UPLOAD_TIMEOUT,
      signal: uploadController.signal
    })

    if (res.data?.code !== 200) {
      throw new UploadBusinessError(res.data, res.status)
    }

    await fs.mkdir(UPLOADED_DIR, { recursive: true })
    await fs.rename(filePath, path.join(UPLOADED_DIR, fileName))

    uploadHistory.unshift({
      name: fileName,
      size: stats.size,
      uploadTime: new Date().toLocaleString()
    })
    if (uploadHistory.length > MAX_HISTORY) uploadHistory.pop()

    mainWindow?.webContents.send(
      'upload-history-update',
      uploadHistory
    )

    updateStatus(fileName, FileStatus.SUCCESS, 100, stats.size)
    await recordUploadEvent('upload_succeeded', {
      fileName,
      size: stats.size,
      durationMs: Date.now() - uploadStartedAt
    })

    setTimeout(() => {
      // 成功：从 map 删除（也就不会再落盘）
      fileStatusMap.delete(fileName)
      persistStateDebounced()
      notifyStatusUpdate()
      checkQueue()
    }, 2000)

  } catch (error) {
    // 上传失败：保留失败状态（会落盘），等待下一次重试
    const failedAt = Date.now()
    const normalizedError = normalizeUploadError(error)
    const previousAttempts = fileStatusMap.get(fileName)?.attemptCount || 0
    const nextRetryAt = normalizedError.retryable
      ? failedAt + RETRY_INTERVAL
      : null
    updateStatus(
      fileName,
      FileStatus.FAILED,
      0,
      stats.size,
      {
        attemptCount: previousAttempts + 1,
        lastFailedTime: failedAt,
        nextRetryAt,
        retryable: normalizedError.retryable,
        lastError: normalizedError.message,
        httpStatus: normalizedError.httpStatus,
        businessCode: normalizedError.businessCode
      }
    )
    await recordUploadEvent('upload_failed', {
      fileName,
      size: stats.size,
      durationMs: failedAt - uploadStartedAt,
      attemptCount: previousAttempts + 1,
      ...normalizedError
    })
    console.error(
      `[上传失败] ${fileName}: ${normalizedError.message}`
    )
  } finally {
    if (uploadControllers.get(fileName) === uploadController) {
      uploadControllers.delete(fileName)
      processingFiles.delete(fileName)
    }
  }
}

/* ===================== 并发调度 ===================== */

async function checkQueue() {
  try {
    await fs.mkdir(PENDING_UPLOAD_DIR, { recursive: true })
    const files = (await fs.readdir(PENDING_UPLOAD_DIR))
    .filter(f => f.toLowerCase().endsWith('.zip'))

    pruneMissingFileStatuses(files)

    // 新文件标记为 pending
    for (const f of files) {
      if (!fileStatusMap.has(f)) {
        const s = await fs.stat(path.join(PENDING_UPLOAD_DIR, f))
        updateStatus(f, FileStatus.PENDING, 0, s.size)
      }
    }

    const candidates = selectUploadCandidates(
      files,
      fileStatusMap,
      processingFiles,
      MAX_CONCURRENT,
      Date.now(),
      RETRY_INTERVAL
    )
    candidates.forEach(startUpload)
  } catch (error) {
    console.error('检查上传队列失败:', error)
  }
}

/* ===================== Electron ===================== */

app.whenReady().then(async () => {
  await uploadLogger.prune().catch((error) => {
    console.error('清理过期上传日志失败:', error)
  })
  await restoreState()

  setInterval(() => {
    uploadLogger.prune().catch((error) => {
      console.error('清理过期上传日志失败:', error)
    })
  }, 24 * 60 * 60 * 1000)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload/index.js')
    }
  })

  Menu.setApplicationMenu(null)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, './renderer/index.html'))
  }

  // 注册快捷键：Ctrl+Shift+I 打开/关闭开发者工具
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools()
      }
    }
  })

  // 注册快捷键：F5 刷新页面
  globalShortcut.register('F5', () => {
    if (mainWindow) {
      mainWindow.webContents.reload()
    }
  })

  // 立即执行一次队列检查
  checkQueue()

  setInterval(() => {
    const now = Date.now()
    fileStatusMap.forEach((v, k) => {
      if (
        v.status === FileStatus.UPLOADING &&
        now - v.lastUpdate > STUCK_TIMEOUT
      ) {
        // 真正取消原请求；失败状态由该请求自己的 catch 统一更新。
        const controller = uploadControllers.get(k)
        if (controller && !controller.signal.aborted) controller.abort()
      }
    })
    checkQueue()
  }, CHECK_INTERVAL)
})

ipcMain.handle('get-upload-status', async () => {
  await checkQueue()
  return getStatusList()
})

ipcMain.handle('get-upload-history', () => uploadHistory)

ipcMain.handle('retry-upload', async (event, fileName) => {
  if (
    typeof fileName !== 'string' ||
    path.basename(fileName) !== fileName ||
    !fileName.toLowerCase().endsWith('.zip')
  ) {
    return { success: false, message: '文件名无效' }
  }

  const metadata = fileStatusMap.get(fileName)
  if (!metadata || metadata.status !== FileStatus.FAILED) {
    return { success: false, message: '文件当前不可重试' }
  }

  try {
    const filePath = path.join(PENDING_UPLOAD_DIR, fileName)
    const stats = await fs.stat(filePath)
    updateStatus(fileName, FileStatus.PENDING, 0, stats.size, {
      lastError: null,
      httpStatus: null,
      businessCode: null,
      nextRetryAt: null,
      retryable: null
    })
    await recordUploadEvent('manual_retry_requested', {
      fileName,
      size: stats.size
    })
    await checkQueue()
    return { success: true }
  } catch {
    return { success: false, message: '待上传文件不存在或无法读取' }
  }
})

// 显示文件选择对话框
ipcMain.handle('show-open-dialog', async (event, options) => {
  return await dialog.showOpenDialog(options)
})

// 获取脚本配置
ipcMain.handle('get-script-config', async () => {
  try {
    const data = await fs.readFile(SCRIPT_CONFIG_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { scriptPath: '' }
  }
})

// 保存脚本配置
ipcMain.handle('save-script-config', async (event, config) => {
  try {
    await fs.mkdir(path.dirname(SCRIPT_CONFIG_FILE), { recursive: true })
    await fs.writeFile(SCRIPT_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存脚本配置失败:', error)
    throw error
  }
})

// 执行脚本
ipcMain.handle('execute-script', async (event, options) => {
  const { command } = options

  try {
    // 获取脚本路径
    const config = await fs.readFile(SCRIPT_CONFIG_FILE, 'utf-8').then(JSON.parse).catch(() => ({ scriptPath: '' }))

    if (!config.scriptPath) {
      throw new Error('请先配置脚本文件路径')
    }

    // 检查脚本文件是否存在
    if (!fsSync.existsSync(config.scriptPath)) {
      throw new Error('脚本文件不存在：' + config.scriptPath)
    }

    console.log(`[脚本执行] 命令: ${command}, 脚本路径: ${config.scriptPath}`)

    if (command === 'stop') {
      // 调用脚本的 stop 命令
      return new Promise((resolve, reject) => {
        const stopProcess = spawn(config.scriptPath, ['stop'], {
          shell: true,
          cwd: path.dirname(config.scriptPath),
          stdio: ['ignore', 'pipe', 'pipe']
        })

        let output = ''
        stopProcess.stdout?.on('data', (data) => {
          output += data.toString()
          console.log('[脚本输出-stop]', data.toString())
        })

        stopProcess.stderr?.on('data', (data) => {
          console.error('[脚本错误-stop]', data.toString())
        })

        stopProcess.on('close', (code) => {
          console.log(`[脚本执行] stop 命令完成，退出码: ${code}`)
          // 清理可能存在的 scriptProcess
          if (scriptProcess) {
            scriptProcess.kill()
            scriptProcess = null
          }
          resolve({ success: true, message: '脚本已停止', output })
        })

        stopProcess.on('error', (err) => {
          console.error('[脚本执行] stop 命令失败:', err)
          reject(err)
        })
      })
    }

    if (command === 'restart') {
      // 先停止旧进程
      if (scriptProcess) {
        scriptProcess.kill()
        scriptProcess = null
      }

      // 使用脚本的 restart 命令
      scriptProcess = spawn(config.scriptPath, ['restart'], {
        shell: true,
        cwd: path.dirname(config.scriptPath),
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      scriptProcess.stdout?.on('data', (data) => {
        console.log('[脚本输出-restart]', data.toString())
      })

      scriptProcess.stderr?.on('data', (data) => {
        console.error('[脚本错误-restart]', data.toString())
      })

      scriptProcess.on('error', (err) => {
        console.error('[脚本执行] restart 命令错误:', err)
      })

      scriptProcess.on('exit', (code) => {
        console.log(`[脚本执行] restart 命令退出，退出码: ${code}`)
        scriptProcess = null
      })

      return { success: true, message: '脚本已启动' }
    }

    throw new Error('未知命令：' + command)
  } catch (error) {
    console.error('[脚本执行] 失败:', error)
    throw error
  }
})

// 检查端口
ipcMain.handle('check-port', async (event, port) => {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const timeout = 2000

    socket.setTimeout(timeout)

    socket.on('connect', () => {
      socket.destroy()
      resolve({ isListening: true })
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve({ isListening: false })
    })

    socket.on('error', () => {
      resolve({ isListening: false })
    })

    socket.connect(port, '127.0.0.1')
  })
})

// 应用退出前注销所有快捷键并清理脚本进程
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  // 清理脚本进程
  if (scriptProcess) {
    scriptProcess.kill()
    scriptProcess = null
  }
})
