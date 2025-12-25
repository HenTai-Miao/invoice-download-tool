import { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'fs/promises'
import fsSync from 'node:fs'
import { exec, execSync } from 'node:child_process'
import axios from 'axios'
import FormData from 'form-data'
import os from 'node:os'

// 获取 __dirname 的 ES 模块等效方式
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 日志系统配置
const LOGS_DIR = path.join(path.dirname(app.getAppPath()), 'logs')
let LOG_FILE = path.join(LOGS_DIR, `${new Date().toISOString().split('T')[0]}.log`)

// 配置文件路径
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json')
// 确保日志目录存在
function ensureLogsDirExists() {
  try {
    if (!fsSync.existsSync(LOGS_DIR)) {
      fsSync.mkdirSync(LOGS_DIR, { recursive: true })
    }
  } catch (error) {
    console.error('创建日志目录失败:', error)
  }
}

// 更新日志文件路径为当天日期
function updateLogFile() {
  const today = new Date().toISOString().split('T')[0]
  const expectedLogFile = path.join(LOGS_DIR, `${today}.log`)
  
  // 如果不是同一天，则更新日志文件路径
  if (LOG_FILE !== expectedLogFile) {
    LOG_FILE = expectedLogFile
  }
}

// 初始化日志系统
ensureLogsDirExists()

// 自定义日志函数
function logToFile(message) {
  try {
    // 检查并更新日志文件路径
    updateLogFile()
    
    const timestamp = new Date().toISOString()
    const logEntry = `${timestamp} - ${message}\n`
    fsSync.appendFileSync(LOG_FILE, logEntry, 'utf8')
  } catch (error) {
    console.error('写入日志文件失败:', error)
  }
}

// 重定向 console.log 和 console.error
const originalConsoleLog = console.log
const originalConsoleError = console.error

console.log = function(...args) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
  originalConsoleLog(...args)
  logToFile(message)
}

console.error = function(...args) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
  originalConsoleError(...args)
  logToFile(`[ERROR] ${message}`)
}

console.log('=== Electron 主进程启动 ===')

// 设置环境变量
process.env.DIST_ELECTRON = path.join(__dirname, '..')

// 首先确保在生产环境中VITE_DEV_SERVER_URL为undefined
// 直接设置它，避免任何其他地方的干扰
// process.env.VITE_DEV_SERVER_URL = undefined
console.log('[环境调试] VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL)

// 更可靠的路径获取方式，确保在 ASAR 打包环境中也能正确工作
if (process.env.VITE_DEV_SERVER_URL) {
  // 开发环境
  process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist-electron', 'renderer')
  console.log('[路径调试] 开发环境 - DIST (renderer):', process.env.DIST)
} else {
  // 生产环境 - 处理 ASAR 打包情况
  const appPath = app.getAppPath()
  console.log('[路径调试] 生产环境 - appPath:', appPath)

  // 检查是否在 ASAR 打包中
  if (appPath.endsWith('.asar')) {
    // ASAR 打包环境：appPath 是 resources/app.asar
    // 我们需要找到 resources/app.asar.unpacked/dist-electron/renderer
    const resourcesPath = path.dirname(appPath) // 获取 resources 目录
    console.log('[路径调试] 生产环境 - resourcesPath:', resourcesPath)
    process.env.DIST = path.join(resourcesPath, 'app.asar.unpacked', 'dist-electron', 'renderer')
    console.log('[路径调试] 生产环境 - DIST (ASAR renderer):', process.env.DIST)
    // 检查文件是否存在
    fs.access(path.join(process.env.DIST, 'index.html'))
      .then(() => console.log('[路径调试] index.html 存在'))
      .catch(err => console.error('[路径调试] index.html 不存在:', err))
  } else {
    // 非 ASAR 环境：直接使用相对路径
    process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist-electron', 'renderer')
    console.log('[路径调试] 生产环境 - DIST (非ASAR renderer):', process.env.DIST)
  }
}

// 设置应用名称
app.setName('发票解析上传工具')

// 检查是否已经有一个实例在运行
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果获取锁失败，说明已经有一个实例在运行，直接退出
  console.log('另一个实例已在运行，当前实例即将退出')
  app.quit()
} else {
  // 当第二个实例启动时，聚焦到第一个实例
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 如果已经有窗口，将其前置
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // 更新文件状态并发送到前端
  function updateFileStatus(fileName, status, progress = 0, size = 0) {
    const fileStatus = {
      name: fileName,
      status,
      progress,
      size
    }

    // 更新全局状态
    fileStatusMap.set(fileName, fileStatus)

    // 发送完整的文件状态列表到前端
    const allFileStatus = Array.from(fileStatusMap.values())

    // 详细日志，检查mainWindow状态
    console.log(`[IPC] 准备发送文件状态更新 - mainWindow存在: ${!!mainWindow}`);
    console.log(`[IPC] 更新内容 - 文件名: ${fileName}, 状态: ${status}, 进度: ${progress}`);
    console.log(`[IPC] 完整文件状态列表: ${JSON.stringify(allFileStatus)}`);

    if (mainWindow) {
      try {
        // 检查窗口是否已销毁
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-status-update', allFileStatus);
          console.log(`[IPC] 状态更新已发送到前端`);
        } else {
          console.log(`[IPC] 无法发送状态更新 - 窗口已销毁`);
        }
      } catch (error) {
        console.error(`[IPC] 发送状态更新时出错:`, error);
      }
    } else {
      console.log(`[IPC] 无法发送状态更新 - mainWindow为null`);
    }
  }

  // 移除已上传的文件状态
  function removeFileStatus(fileName) {
    fileStatusMap.delete(fileName)

    // 发送更新后的文件状态列表到前端
    const allFileStatus = Array.from(fileStatusMap.values())

    // 详细日志，检查mainWindow状态
    console.log(`[IPC] 准备发送文件状态移除更新 - mainWindow存在: ${!!mainWindow}`);
    console.log(`[IPC] 移除内容 - 文件名: ${fileName}`);
    console.log(`[IPC] 更新后的完整文件状态列表: ${JSON.stringify(allFileStatus)}`);

    if (mainWindow) {
      try {
        // 检查窗口是否已销毁
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-status-update', allFileStatus);
          console.log(`[IPC] 状态移除更新已发送到前端`);
        } else {
          console.log(`[IPC] 无法发送状态移除更新 - 窗口已销毁`);
        }
      } catch (error) {
        console.error(`[IPC] 发送状态移除更新时出错:`, error);
      }
    } else {
      console.log(`[IPC] 无法发送状态移除更新 - mainWindow为null`);
    }
  }

  // 定义目录路径（使用 path.join 确保跨平台兼容性）
  const BASE_DIR = path.join(os.tmpdir(), 'invoice')
  const PENDING_UPLOAD_DIR = path.join(BASE_DIR, 'pending-upload')
  const UPLOADED_DIR = path.join(BASE_DIR, 'uploaded')
  // 定义后端 API 地址
  const UPLOAD_API_URL = 'http://10.8.0.34:8083/zz-resource/oss/endpoint/invoice-put-file'

  let mainWindow

  // 全局文件状态对象 - 维护所有文件的状态
  const fileStatusMap = new Map()

  // 正在处理的文件集合 - 用于避免重复处理
  const processingFiles = new Set()

  // 全局上传历史记录 - 最多保存50条记录
  const uploadHistory = []
  const MAX_HISTORY_ITEMS = 50

  // 互斥标志位 - 防止checkForNewFiles并发调用
  let isCheckingFiles = false

  // 文件状态类型
  const FileStatus = {
    PENDING: 'pending',
    UPLOADING: 'uploading',
    SUCCESS: 'success',
    FAILED: 'failed'
  }

  // 配置文件读写函数
  async function readConfig() {
    try {
      if (fsSync.existsSync(CONFIG_FILE)) {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8')
        return JSON.parse(data)
      }
      return {}
    } catch (error) {
      console.error('读取配置文件失败:', error)
      return {}
    }
  }

  async function writeConfig(config) {
    try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
      return true
    } catch (error) {
      console.error('写入配置文件失败:', error)
      return false
    }
  }

  // 脚本执行函数
  function executeScript(scriptPath, scriptName, command) {
    return new Promise((resolve, reject) => {
      // 现在直接使用完整的脚本路径
      const fullPath = scriptPath
      console.log('执行脚本路径:', fullPath)
      console.log('执行命令:', command)
      
      // 检查脚本文件是否存在
      if (!fsSync.existsSync(fullPath)) {
        console.error('脚本文件不存在:', fullPath)
        reject(new Error(`执行脚本失败: 脚本文件不存在 - ${fullPath}`))
        return
      }
      
      // 添加环境变量调试信息
      console.log('当前工作目录:', process.cwd())
      
      // 获取脚本所在目录
      const scriptDir = path.dirname(fullPath)
      console.log('脚本所在目录:', scriptDir)
      
      // Windows平台sh脚本执行方式
      const execCommand = `cmd.exe /c "cd \"${scriptDir}\" && sh \"${fullPath}\" ${command}"`
      console.log('执行命令:', execCommand)
      
      // 使用exec执行命令，捕获完整的错误信息
      exec(execCommand, { 
        // 设置环境变量，确保继承用户的PATH
        env: { ...process.env },
        // 设置超时时间为10秒
        timeout: 10000
      }, (error, stdout, stderr) => {
        console.log('执行结果:', {
          error: error,
          stdout: stdout,
          stderr: stderr
        })
        
        if (error) {
          console.error('执行脚本错误:', error)
          console.error('stderr:', stderr)
          console.error('stdout:', stdout)
          
          // 提供详细的错误信息
          let errorMsg = `执行脚本失败: `
          if (stderr) errorMsg += stderr.trim()
          else if (stdout) errorMsg += stdout.trim()
          else errorMsg += error.message
          
          reject(new Error(errorMsg))
        } else {
          // 执行成功
          console.log('脚本执行成功')
          console.log('stdout:', stdout)
          resolve({ success: true, output: stdout })
        }
      })
    })
  }

  // 添加文件到上传历史
  function addToUploadHistory(fileName, size) {
    const historyItem = {
      name: fileName,
      size,
      uploadTime: new Date().toLocaleString()
    }

    // 将新记录添加到历史记录开头
    uploadHistory.unshift(historyItem)

    // 如果超过最大数量，移除最早的记录
    if (uploadHistory.length > MAX_HISTORY_ITEMS) {
      uploadHistory.pop()
    }

    // 发送更新后的上传历史到前端
    if (mainWindow) {
      mainWindow.webContents.send('upload-history-update', uploadHistory)
    }
  }

  // 确保目录存在
  async function ensureDirectoriesExist() {
    try {
      console.log('检查目录是否存在:', PENDING_UPLOAD_DIR)
      await fs.access(PENDING_UPLOAD_DIR)
      console.log('待上传目录存在')
    } catch (error) {
      console.log('待上传目录不存在，创建目录:', PENDING_UPLOAD_DIR)
      await fs.mkdir(PENDING_UPLOAD_DIR, { recursive: true })
    }

    try {
      await fs.access(UPLOADED_DIR)
      console.log('已上传目录存在')
    } catch (error) {
      console.log('已上传目录不存在，创建目录:', UPLOADED_DIR)
      await fs.mkdir(UPLOADED_DIR, { recursive: true })
    }
  }

  // 监控目录中的 ZIP 文件
  async function monitorZipFiles() {
    try {
      await ensureDirectoriesExist()
      console.log('读取目录内容:', PENDING_UPLOAD_DIR)
      const files = await fs.readdir(PENDING_UPLOAD_DIR)
      console.log('目录中的所有文件:', files)

      // 修改过滤条件，确保正确识别zip文件
      const zipFiles = files.filter((file) => {
        const ext = path.extname(file).toLowerCase()
        console.log(`文件 ${file} 的扩展名: ${ext}`)
        const isZip = ext === '.zip'
        console.log(`文件 ${file} 是ZIP文件: ${isZip}`)
        return isZip
      })

      console.log('监控目录中的 ZIP 文件:', zipFiles)
      return zipFiles
    } catch (error) {
      console.error('读取目录失败:', error)
      return []
    }
  }

  // 检查新文件的函数
  async function checkForNewFiles() {
    // 检查互斥标志位，如果已经在检查中，直接返回
    if (isCheckingFiles) {
      console.log('已经有文件检查任务在运行，跳过本次调用');
      return;
    }

    // 设置互斥标志位
    isCheckingFiles = true;

    try {
      console.log('=== 开始检查新文件 ===');
      console.log(`当前processingFiles集合: ${Array.from(processingFiles).join(', ')}`);
      console.log(`当前fileStatusMap中的文件: ${Array.from(fileStatusMap.keys()).join(', ')}`);

      const zipFiles = await monitorZipFiles();
      console.log('发现 ZIP 文件:', zipFiles);

      // 如果没有找到zip文件，也记录一下
      if (zipFiles.length === 0) {
        console.log('未找到任何 ZIP 文件');
      } else {
        console.log(`找到 ${zipFiles.length} 个 ZIP 文件准备上传`);
      }

      // 首先将所有检测到的文件添加到状态映射中，设置为待上传状态
      for (const fileName of zipFiles) {
        // 检查文件是否已经在处理中或状态映射中
        if (processingFiles.has(fileName)) {
          console.log(`文件 ${fileName} 已在processingFiles中（正在处理），跳过添加`);
          continue;
        }
        if (fileStatusMap.has(fileName)) {
          console.log(`文件 ${fileName} 已在fileStatusMap中（已有状态记录），跳过添加`);
          continue;
        }

        // 构造完整的文件路径
        const filePath = path.join(PENDING_UPLOAD_DIR, fileName);

        // 获取文件大小
        let fileSize = 0;
        try {
          const stats = await fs.stat(filePath);
          fileSize = stats.size;
        } catch (error) {
          console.error('获取文件大小失败:', error);
        }

        // 添加文件到状态映射，设置初始状态为pending
        console.log(`文件 ${fileName} 添加到状态映射，状态设置为PENDING`);
        updateFileStatus(fileName, FileStatus.PENDING, 0, fileSize);
      }

      // 只处理一个文件，确保顺序上传
      for (const fileName of zipFiles) {
        // 获取文件当前状态
        const currentStatus = fileStatusMap.get(fileName)?.status;
        console.log(`文件 ${fileName} 当前状态: ${currentStatus}`);

        // 检查是否已经在处理中
        if (processingFiles.has(fileName)) {
          console.log(`文件 ${fileName} 正在处理中，跳过本次检查`);
          continue;
        }

        // 检查文件是否处于UPLOADING状态
        if (currentStatus === FileStatus.UPLOADING) {
          console.log(`文件 ${fileName} 已在上传中，跳过本次检查`);
          continue;
        }

        // 只有状态为PENDING的文件才会被处理
        if (currentStatus !== FileStatus.PENDING) {
          console.log(`文件 ${fileName} 状态不是待上传，跳过本次检查`);
          continue;
        }

        // 检查是否有其他文件正在上传
        const hasUploadingFile = Array.from(fileStatusMap.values()).some(file =>
          file.status === FileStatus.UPLOADING
        );

        if (hasUploadingFile) {
          console.log('已有文件正在上传中，等待上传完成后再处理其他文件');
          break;
        }

        console.log(`开始处理文件: ${fileName}`);
        // 将文件添加到正在处理集合
        processingFiles.add(fileName);
        console.log(`processingFiles 集合内容: ${Array.from(processingFiles).join(', ')}`);

        // 构造完整的文件路径
        const filePath = path.join(PENDING_UPLOAD_DIR, fileName);
        console.log('构造文件路径:', filePath);

        // 获取文件大小
        let fileSize = 0;
        try {
          const stats = await fs.stat(filePath);
          fileSize = stats.size;
        } catch (error) {
          console.error('获取文件大小失败:', error);
        }

        try {
          // 上传文件到后端
          console.log(`开始上传文件: ${fileName}`);
          const uploadResult = await uploadFileToBackend(filePath, fileName, fileSize);
          console.log(`文件 ${fileName} 上传结果:`, uploadResult);

          // 如果上传成功，移动文件到已上传目录
          if (uploadResult) {
            const moveResult = await moveFileToUploaded(fileName);
            console.log('文件移动结果:', moveResult ? '成功' : '失败');
            if (moveResult) {
              // 文件移动成功后，记录上传历史
              addToUploadHistory(fileName, fileSize);

              // 重新设计的可靠状态更新流程
              console.log(`文件${fileName}移动成功，开始可靠的SUCCESS状态更新流程`);

              // 关键步骤1：确保文件状态是UPLOADING，然后立即更新为SUCCESS
              const currentStatus = fileStatusMap.get(fileName)?.status;
              console.log(`文件${fileName}当前状态: ${currentStatus}`);

              // 强制更新为SUCCESS状态，确保覆盖任何中间状态
              console.log(`文件${fileName}强制更新为SUCCESS状态`);
              updateFileStatus(fileName, FileStatus.SUCCESS, 100, fileSize);

              // 关键步骤2：添加一个足够长的固定延迟，确保前端有足够时间处理和显示SUCCESS状态
              // 2秒是一个安全的延迟，可以确保即使在较慢的系统上也能正确更新UI
              setTimeout(() => {
                console.log(`文件${fileName}SUCCESS状态显示完成，准备移除状态`);

                // 最后一次SUCCESS状态确认
                console.log(`文件${fileName}最终SUCCESS状态确认`);
                updateFileStatus(fileName, FileStatus.SUCCESS, 100, fileSize);

                // 给前端最后500毫秒处理最终状态更新
                setTimeout(() => {
                  console.log(`文件${fileName}准备移除状态`);
                  // 移除文件状态
                  removeFileStatus(fileName);
                  // 移除状态后再检查下一个文件
                  console.log(`文件${fileName}状态移除后，立即检查下一个待处理文件`);
                  checkForNewFiles();
                }, 500);
              }, 500); // 固定延迟，确保前端有足够时间显示成功状态
            } else {
              // 文件移动失败，更新文件状态为失败
              updateFileStatus(fileName, FileStatus.FAILED, 0, fileSize);
              // 失败后立即检查下一个文件
              checkForNewFiles();
            }
          } else {
            // 上传失败，文件状态已在 uploadFileToBackend 中更新
            // 失败后立即检查下一个文件
            checkForNewFiles();
          }
        } catch (error) {
          // 发生异常，从正在处理集合中移除，允许下次重试
          console.error(`处理文件 ${fileName} 时发生异常:`, error);
          updateFileStatus(fileName, FileStatus.FAILED, 0, fileSize);
          // 异常后立即检查下一个文件
          checkForNewFiles();
        } finally {
          // 无论成功还是失败，最后都从正在处理集合中移除
          console.log(`文件 ${fileName} 处理完成，从处理集合中移除`);
          processingFiles.delete(fileName);
          console.log(`processingFiles 集合内容: ${Array.from(processingFiles).join(', ')}`);
        }

        // 处理完一个文件后，跳出循环，等待下一次检查
        break;
      }

      // 重新获取更新后的文件列表，仅用于日志
      const updatedZipFiles = await monitorZipFiles();
      console.log('更新后的 ZIP 文件列表:', updatedZipFiles);

      console.log('=== 文件检查完成 ===');
      return zipFiles;
    } catch (error) {
      console.error('检查文件时出错:', error);
    } finally {
      // 重置互斥标志位，允许下一次检查
      isCheckingFiles = false;
      console.log('文件检查完成，重置互斥标志位');
    }
  }

  // 移动文件到已上传目录
  async function moveFileToUploaded(fileName) {
    try {
      const sourcePath = path.join(PENDING_UPLOAD_DIR, fileName)
      const destPath = path.join(UPLOADED_DIR, fileName)
      await fs.rename(sourcePath, destPath)
      return true
    } catch (error) {
      console.error('移动文件失败:', error)
      return false
    }
  }

  // 读取文件内容
  async function readFileContent(filePath) {
    try {
      const buffer = await fs.readFile(filePath)
      return buffer
    } catch (error) {
      console.error('读取文件内容失败:', error)
      return null
    }
  }

  // 上传文件到后端
  async function uploadFileToBackend(filePath, fileName, fileSize) {
    console.log('开始上传文件:', fileName);

    // 设置文件初始上传状态
    updateFileStatus(fileName, FileStatus.UPLOADING, 0, fileSize);
    try {
      // 读取文件内容
      const fileBuffer = await readFileContent(filePath);
      if (!fileBuffer) {
        console.error('读取文件内容失败:', filePath);
        // 更新为失败状态
        updateFileStatus(fileName, FileStatus.FAILED, 0, fileSize);
        return false;
      }

      // 使用 form-data 包来正确处理文件上传
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: fileName,
        contentType: 'application/zip'
      });

      console.log('开始发送文件到服务器...');
      const response = await axios.post(UPLOAD_API_URL, formData, {
        headers: {
          ...formData.getHeaders()
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(`文件 ${fileName} 上传进度: ${progress}%`);
            // 更新上传进度
            updateFileStatus(fileName, FileStatus.UPLOADING, progress, fileSize);
          }
        },
        // 确保axios不会将非200响应视为异常，以便统一处理所有响应
        validateStatus: function (status) {
          return status >= 200 && status < 600; // 接受所有状态码
        }
      });

      console.log('文件上传结果:', fileName, response.data);
      console.log('HTTP状态码:', response.status);
      console.log('后端返回code:', response.data?.code);

      // 检查后端返回的code是否为200
      const isSuccess = response.data?.code === 200;
      console.log(`文件 ${fileName} 上传是否成功: ${isSuccess}`);

      if (isSuccess) {
        console.log('文件上传成功:', fileName);
        // 更新为成功状态
        updateFileStatus(fileName, FileStatus.SUCCESS, 100, fileSize);
      } else {
        console.error('文件上传失败，后端返回错误:', fileName, response.data);
        // 更新为失败状态
        updateFileStatus(fileName, FileStatus.FAILED, 0, fileSize);
      }

      return isSuccess;
    } catch (error) {
      console.error('文件上传失败:', error);
      // 更新为失败状态
      updateFileStatus(fileName, FileStatus.FAILED, 0, fileSize);
      return false;
    }
  }

  // IPC 事件处理
  ipcMain.handle('zip-list', async () => {
    try {
      const zipFiles = await monitorZipFiles(); // 你已有的方法
      return zipFiles;
    } catch (error) {
      console.error('获取 ZIP 文件列表失败:', error);
      return [];
    }
  });

  // 获取脚本配置
  ipcMain.handle('get-script-config', async () => {
    try {
      const config = await readConfig()
      return {
        scriptPath: config.scriptPath || ''
      }
    } catch (error) {
      console.error('获取脚本配置失败:', error)
      throw error
    }
  })

  // 保存脚本配置
  ipcMain.handle('save-script-config', async (event, { scriptPath, scriptName }) => {
    try {
      const config = await readConfig()
      config.scriptPath = scriptPath
      config.scriptName = scriptName || '' // 保留scriptName字段以兼容旧配置
      await writeConfig(config)
      return { success: true }
    } catch (error) {
      console.error('保存脚本配置失败:', error)
      throw error
    }
  })

  // 执行脚本
  ipcMain.handle('execute-script', async (event, { command = 'restart' }) => {
    try {
      const config = await readConfig()
      if (!config.scriptPath) {
        throw new Error('脚本配置未完成，请先配置脚本文件')
      }
      
      // 不再需要scriptName参数，传递完整路径即可
      return await executeScript(config.scriptPath, '', command)
    } catch (error) {
      console.error('执行脚本失败:', error)
      throw error
    }
  })

  // 显示文件选择对话框
  ipcMain.handle('show-open-dialog', async (event, options) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, options)
      return result
    } catch (error) {
      console.error('显示文件选择对话框失败:', error)
      throw error
    }
  })

  function createWindow() {
    // 创建浏览器窗口
    console.log( path.join(
          __dirname,
          process.env.VITE_DEV_SERVER_URL ? '../public/favicon.ico' : 'favicon.ico'
        ),"123");
    
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: '发票解析上传工具',
      icon: path.join(
          __dirname,
          process.env.VITE_DEV_SERVER_URL ? '../public/favicon.jpg' : 'favicon.ico'
        ),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.resolve(
          __dirname,
          process.env.VITE_DEV_SERVER_URL ? 'preload/index.js' : 'preload/index.js'
        )
      }
    })

    // 移除菜单栏以符合设计要求
    Menu.setApplicationMenu(null)

    // 根据环境加载内容
    if (process.env.VITE_DEV_SERVER_URL) {
      // 开发环境加载 Vite 开发服务器
      console.log('Loading Vite dev server:', process.env.VITE_DEV_SERVER_URL)
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
      // 生产环境加载本地文件
      const indexPath = path.join(process.env.DIST, 'index.html')
      console.log('Loading file:', indexPath)
      mainWindow.loadFile(indexPath)
    }

    // 窗口关闭事件
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  }

  // IPC 事件处理
  ipcMain.handle('get-downloaded-count', async () => {
    try {
      // 这里应该调用实际的 API 获取已下载发票数量
      // 暂时返回模拟数据
      // 在实际应用中，您可能需要在这里实现真正的发票计数逻辑
      const mockCount = Math.floor(Math.random() * 100)
      return mockCount
    } catch (error) {
      console.error('获取已下载发票数量失败:', error)
      return 0
    }
  })

  // 获取当前上传状态
  ipcMain.handle('get-upload-status', async () => {
    // 返回当前的上传状态
    // 在实际应用中，您可能需要维护一个状态映射
    return {
      // 示例数据结构
      files: []
    };
  })

  // 获取上传历史记录
  ipcMain.handle('get-upload-history', async () => {
    console.log('获取上传历史记录:', uploadHistory);
    return uploadHistory;
  })



  // 应用准备就绪时创建窗口并启动监控
  app.whenReady().then(() => {
    createWindow()

    // 注册全局快捷键
    globalShortcut.register('Ctrl+Shift+I', () => {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools()
      }
    })

    globalShortcut.register('F5', () => {
      if (mainWindow) {
        mainWindow.reload()
      }
    })

    // macOS 激活事件
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })

    // 应用启动后立即启动监控
    setTimeout(() => {
      // 发送一个测试事件到前端
      if (mainWindow) {
        console.log('发送测试事件到前端')
        mainWindow.webContents.send('test-event', 'Hello from main process!')
      }

      // 确保目录存在
      ensureDirectoriesExist().then(() => {
        // 立即执行一次检查
        console.log('立即执行一次文件检查')
        checkForNewFiles().then((files) => {
          console.log('检查结果:', files)

          // 设置定时检查
          console.log('设置定时检查，每10秒一次')
          setInterval(async () => {
            console.log('定时检查文件...')
            await checkForNewFiles()
            // checkForNewFiles 函数内部会处理文件列表的发送
          }, 10000) // 每10秒检查一次
          console.log('=== 监控启动完成 ===')
        })
      }).catch((error) => {
        console.error('启动监控失败:', error)
      })
    }, 2000)
  })

  // 所有窗口关闭时退出应用 (非 macOS)
  app.on('window-all-closed', () => {
    // 注销所有全局快捷键
    globalShortcut.unregisterAll()

    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

}
