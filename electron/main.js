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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ===================== 配置 ===================== */

const BASE_DIR = path.join(os.tmpdir(), 'invoice')
const PENDING_UPLOAD_DIR = path.join(BASE_DIR, 'pending-upload')
const UPLOADED_DIR = path.join(BASE_DIR, 'uploaded')
const STATE_FILE = path.join(BASE_DIR, 'upload-state.json')
const SCRIPT_CONFIG_FILE = path.join(app.getPath('userData'), 'script-config.json')

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
    : mainWindow.loadFile(path.join(__dirname, './renderer/index.html'))

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

// 显示文件选择对话框
ipcMain.handle('show-open-dialog', async (event, options) => {
  return await dialog.showOpenDialog(options)
})

// 获取脚本配置
ipcMain.handle('get-script-config', async () => {
  try {
    const data = await fs.readFile(SCRIPT_CONFIG_FILE, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
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
