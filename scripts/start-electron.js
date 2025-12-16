import { spawn } from 'child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 启动 Vite 开发服务器
const viteProcess = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true
})

let viteServerUrl = 'http://localhost:5173'

console.log('Starting Vite development server...')

// 监听 Vite 输出以获取实际端口
viteProcess.stdout.on('data', (data) => {
  const output = data.toString()
  console.log(output)
  
  // 检查是否包含本地地址
  const urlMatch = output.match(/Local:\s+(http:\/\/localhost:(\d+))/) || output.match(/http:\/\/localhost:(\d+)/)
  if (urlMatch) {
    viteServerUrl = urlMatch[1]
    console.log('Detected Vite server URL:', viteServerUrl)
  }
})

viteProcess.stderr.on('data', (data) => {
  console.error('Vite stderr:', data.toString())
})

viteProcess.on('spawn', () => {
  console.log('Vite server started, now starting Electron...')
  
  // 等待几秒让 Vite 服务器启动
  setTimeout(() => {
    // 启动 Electron，使用正确的入口文件
    const electronProcess = spawn('npx', ['electron', '.'], {
      stdio: 'inherit',
      shell: true,
      cwd: __dirname,
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: viteServerUrl
      }
    })
    
    electronProcess.on('error', (err) => {
      console.error('Failed to start Electron:', err)
    })
    
    electronProcess.on('exit', (code) => {
      console.log(`Electron process exited with code ${code}`)
      // 如果 Electron 退出，也停止 Vite 服务器
      viteProcess.kill()
    })
  }, 5000) // 增加等待时间到5秒
})

viteProcess.on('error', (err) => {
  console.error('Failed to start Vite server:', err)
})

viteProcess.on('exit', (code) => {
  console.log(`Vite server exited with code ${code}`)
})