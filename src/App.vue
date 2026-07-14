<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">
        <h3>发票解析上传工具（北京）</h3>
      </div>

      <nav class="menu">
        <RouterLink to="/invoice-upload" class="menu-item">
          <span class="menu-icon">📤</span>
          <span class="menu-text">发票解析上传</span>
        </RouterLink>
      </nav>

      <div class="sidebar-button-container">
        <!-- 启动/停止按钮：只在 idle 或 running 状态显示 -->
        <el-button
          v-if="robotState !== 'restarting'"
          class="start-robot-btn"
          :type="robotState === 'running' ? 'danger' : 'primary'"
          @click="handleOpenRobotBrowser"
        >
          {{ robotState === 'running' ? '停止监控' : '启动机器人下载发票' }}
        </el-button>

        <div class="interval-setting">
          <label>重启间隔(分钟):</label>
          <input
            v-model.number="restartIntervalMinutes"
            type="number"
            min="1"
          />
        </div>

        <div class="port-status">
          <span
            class="status-indicator"
            :class="portStatus"
          >
            端口 8082：{{ portStatus === 'online' ? '在线' : '离线' }}
          </span>
        </div>

        <!-- 重启倒计时：只在 restarting 状态显示 -->
        <div v-if="robotState === 'restarting' && remainingSeconds > 0" class="countdown">
          <div class="countdown-info">
            <span class="countdown-text">
              重启倒计时：{{ formatTime(remainingSeconds) }}
            </span>
          </div>
          <el-button
            size="small"
            type="danger"
            plain
            @click="cancelRestart"
            style="width: 100%; margin-top: 5px;"
          >
            取消重启并停止
          </el-button>
        </div>
      </div>

      <div class="settings-container">
        <el-button type="text" @click="openSettingsDialog">
          ⚙️ 设置
        </el-button>
      </div>
    </aside>

    <main class="main-content">
      <RouterView />
      <!-- 操作过程中的透明遮罩层 -->
      <div v-if="operationLoading" class="operation-overlay">
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p class="loading-text">{{ loadingText }}</p>
        </div>
      </div>
    </main>

    <el-dialog v-model="settingsDialogVisible" title="脚本配置" width="500px">
      <el-form :model="scriptConfig" label-width="100px">
        <el-form-item label="脚本文件">
          <el-input
            v-model="scriptConfig.scriptPath"
            disabled
            readonly
            style="width: 300px"
          />
          <el-button
            type="primary"
            style="margin-left: 10px"
            @click="selectScriptPath"
          >
            选择文件
          </el-button>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="settingsDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveScriptConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'

/* -------------------- 基础状态 -------------------- */
type RobotState = 'idle' | 'running' | 'restarting'

const robotState = ref<RobotState>('idle')
const portStatus = ref<'online' | 'offline'>('offline')
const restartIntervalMinutes = ref(1)
const remainingSeconds = ref(0)
const operationLoading = ref(false) // 操作中的loading状态
const loadingText = ref('') // loading提示文本
const serviceStartCount = ref(0) // 启动服务计数：0=未启动，1=已启动过

/* -------------------- 定时器句柄 -------------------- */
const checkTimer = ref<ReturnType<typeof setInterval> | null>(null)
const restartTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const countdownTimer = ref<ReturnType<typeof setInterval> | null>(null)
let justStartedTimestamp = 0 // 记录刚启动的时间戳，避免立即触发重启

/* -------------------- 设置相关 -------------------- */
const settingsDialogVisible = ref(false)
const scriptConfig = ref({ scriptPath: '' })

/* -------------------- 工具函数 -------------------- */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}分${secs}秒`
}

function openSettingsDialog() {
  settingsDialogVisible.value = true
}

// 清除所有计时器
function clearTimers() {
  if (checkTimer.value) clearInterval(checkTimer.value)
  if (restartTimer.value) clearTimeout(restartTimer.value)
  if (countdownTimer.value) clearInterval(countdownTimer.value)
  checkTimer.value = null
  restartTimer.value = null
  countdownTimer.value = null
}

/* -------------------- 核心业务逻辑 -------------------- */

// 1. 启动/停止主入口
async function handleOpenRobotBrowser() {
  if (robotState.value === 'running') {
    await stopRobotService()
    return
  }

  operationLoading.value = true
  loadingText.value = '正在启动服务...'
  const startTime = Date.now()

  try {
    // 先检测 8082 端口是否已在运行
    const result = await window.electronAPI.checkPort(8082)

    if (result?.isListening) {
      // 端口已在运行，直接转换为 running 状态
      robotState.value = 'running'
      portStatus.value = 'online'

      // 确保遮罩至少显示800毫秒
      const elapsed = Date.now() - startTime
      const delay = Math.max(0, 800 - elapsed)
      await new Promise(resolve => setTimeout(resolve, delay))

      operationLoading.value = false
      // 启动成功，计数设为 1
      serviceStartCount.value = 1
      console.log('服务启动成功，启动计数:', serviceStartCount.value)
      ElMessage.success('服务启动成功')
      // 启动端口监控，以便在应用离线时触发重启倒计时
      startIndependentPortMonitoring()
    } else {
      // 端口未运行，执行启动脚本
      await window.electronAPI.executeScript({ command: 'restart' })

      // 记录启动时间，避免立即触发重启倒计时
      justStartedTimestamp = Date.now()

      robotState.value = 'running'
      portStatus.value = 'offline' // 初始状态设为离线，等待脚本启动

      // 确保遮罩至少显示800毫秒
      const elapsed = Date.now() - startTime
      const delay = Math.max(0, 800 - elapsed)
      await new Promise(resolve => setTimeout(resolve, delay))

      operationLoading.value = false
      // 启动成功，计数设为 1
      serviceStartCount.value = 1
      console.log('服务启动成功，启动计数:', serviceStartCount.value)
      ElMessage.success('服务启动成功')
      // 启动端口监控
      startIndependentPortMonitoring()
    }
  } catch (error: unknown) {
    console.error('启动异常:', error)
    operationLoading.value = false
    ElMessage.error('启动失败，请检查脚本配置')
  }
}

// 2. 停止机器人服务（通用停止逻辑）
async function stopRobotService() {
  operationLoading.value = true
  loadingText.value = '正在停止服务...'
  const startTime = Date.now()

  try {
    // 清除所有定时器
    clearTimers()
    remainingSeconds.value = 0

    // 重置启动时间戳
    justStartedTimestamp = 0

    await window.electronAPI.executeScript({ command: 'stop' })

    robotState.value = 'idle'
    portStatus.value = 'offline'

    // 确保遮罩至少显示800毫秒
    const elapsed = Date.now() - startTime
    const delay = Math.max(0, 800 - elapsed)
    await new Promise(resolve => setTimeout(resolve, delay))

    operationLoading.value = false
    // 停止服务，计数重置为 0
    serviceStartCount.value = 0
    console.log('服务停止，启动计数重置为:', serviceStartCount.value)
    ElMessage.success('服务停止成功')
  } catch (error: unknown) {
    console.error('停止服务异常:', error)
    operationLoading.value = false
    ElMessage.error('停止服务失败，请检查脚本配置')
    robotState.value = 'idle'
    // 即使停止失败，也重置计数
    serviceStartCount.value = 0
  }
}

// 3. 取消重启按钮逻辑
async function cancelRestart() {
  console.log('用户手动取消重启')
  // 清除倒计时相关定时器
  if (countdownTimer.value) {
    clearInterval(countdownTimer.value)
    countdownTimer.value = null
  }
  if (restartTimer.value) {
    clearTimeout(restartTimer.value)
    restartTimer.value = null
  }
  remainingSeconds.value = 0

  // 重置启动时间戳
  justStartedTimestamp = 0

  // 调用停止服务
  await stopRobotService()
}

// 4. 端口监控逻辑
function startIndependentPortMonitoring() {
  if (checkTimer.value) clearInterval(checkTimer.value)

  checkTimer.value = setInterval(async () => {
    try {
      const result = await window.electronAPI.checkPort(8082)
      const isOnline = result?.isListening ?? false

      if (isOnline) {
        portStatus.value = 'online'
        // 端口上线后，清除刚启动标志
        if (justStartedTimestamp > 0) {
          console.log('服务启动成功，端口已上线')
          justStartedTimestamp = 0
        }
      } else {
        portStatus.value = 'offline'
      }

      // 只有在 running 状态下，且发现离线时，才触发重启倒计时
      if (robotState.value === 'running' && !isOnline) {
        // 检查是否刚启动（30秒内），避免立即触发重启
        const timeSinceStart = Date.now() - justStartedTimestamp
        if (justStartedTimestamp > 0 && timeSinceStart < 30000) {
          console.log(`刚启动 ${Math.floor(timeSinceStart / 1000)} 秒，等待服务启动...`)
          return
        }
        console.log('检测到端口离线，准备触发重启倒计时')
        scheduleRestart()
      }
    } catch (e) {
      console.error('端口检测异常:', e)
      portStatus.value = 'offline'
    }
  }, 1000)
}

// 5. 触发重启倒计时（添加随机时间）
function scheduleRestart() {
  if (robotState.value !== 'running') return

  // 避免重复触发倒计时
  if (restartTimer.value || countdownTimer.value) {
    console.log('重启倒计时已在进行中，跳过')
    return
  }

  robotState.value = 'restarting'

  // 添加1-59秒的随机时间
  const randomSeconds = Math.floor(Math.random() * 59) + 1
  const totalSeconds = restartIntervalMinutes.value * 60 + randomSeconds

  remainingSeconds.value = totalSeconds

  console.log(`启动重启倒计时: ${totalSeconds}秒`)

  // 倒计时显示
  countdownTimer.value = setInterval(() => {
    if (remainingSeconds.value > 0) {
      remainingSeconds.value--
    }
  }, 1000)

  // 到点执行重启
  restartTimer.value = setTimeout(async () => {
    if (robotState.value === 'restarting') {
      try {
        console.log('倒计时结束，执行自动重启')
        operationLoading.value = true
        loadingText.value = '正在重启服务...'
        const startTime = Date.now()

        await window.electronAPI.executeScript({ command: 'restart' })

        // 记录重启时间，避免立即再次触发重启倒计时
        justStartedTimestamp = Date.now()

        robotState.value = 'running'
        clearInterval(countdownTimer.value!)
        countdownTimer.value = null
        restartTimer.value = null

        // 确保遮罩至少显示800毫秒
        const elapsed = Date.now() - startTime
        const delay = Math.max(0, 800 - elapsed)
        await new Promise(resolve => setTimeout(resolve, delay))

        operationLoading.value = false
        ElMessage.success('服务重启成功')
        console.log('自动重启成功，启动计数保持为:', serviceStartCount.value)
      } catch (e) {
        console.error('自动重启失败', e)
        operationLoading.value = false
        ElMessage.error('自动重启失败')
        robotState.value = 'idle'
        // 自动重启失败，重置计数
        serviceStartCount.value = 0
        console.log('自动重启失败，启动计数重置为:', serviceStartCount.value)
      }
    }
  }, totalSeconds * 1000)
}

/* -------------------- Electron 文件操作 -------------------- */
function selectScriptPath() {
  window.electronAPI.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '批处理文件', extensions: ['bat'] }],
    title: '选择脚本文件'
  }).then((res) => {
    const selectedPath = res.filePaths[0]
    if (!res.canceled && selectedPath) {
      scriptConfig.value.scriptPath = selectedPath
    }
  })
}

async function saveScriptConfig() {
  if (!scriptConfig.value.scriptPath) {
    ElMessage.warning('请选择脚本文件')
    return
  }
  try {
    await window.electronAPI.saveScriptConfig({ scriptPath: scriptConfig.value.scriptPath })
    ElMessage.success('配置保存成功')
    settingsDialogVisible.value = false
  } catch {
    ElMessage.error('保存失败')
  }
}

/* -------------------- 生命周期 -------------------- */
onMounted(async () => {
  const cfg = await window.electronAPI.getScriptConfig()
  scriptConfig.value.scriptPath = cfg?.scriptPath || ''
  // 注意：不在初始化时启动端口监控，只在点击启动按钮后才启动
})

onUnmounted(() => {
  clearTimers()
})
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  margin: 0;
  padding: 0;
}

.sidebar {
  width: 250px;
  background: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
  padding: 20px 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  margin: 0;
}

.logo {
  padding: 0 20px 20px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 20px;
  margin-top: 0;
}

.logo h2 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.5rem;
}

.menu {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  margin: 0;
  padding: 0;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  text-decoration: none;
  color: var(--color-text);
  transition: background-color 0.2s;
  border-left: 3px solid transparent;
  margin: 0;
}

.menu-item:hover {
  background-color: var(--color-background-mute);
}

.menu-item.router-link-exact-active {
  background-color: var(--color-background-mute);
  border-left: 3px solid #42b883;
  color: #42b883;
  font-weight: 500;
}

.menu-icon {
  margin-right: 12px;
  font-size: 1.2rem;
}

.main-content {
  flex: 1;
  overflow: hidden;
  background: var(--color-background);
  margin: 0;
  padding: 0;
  position: relative;
}

/* 操作过程中的遮罩层 */
.operation-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  animation: fadeIn 0.3s ease-in-out;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #f0f0f0;
  border-top: 4px solid #42b883;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.loading-text {
  color: #333;
  font-size: 16px;
  margin: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }

  .menu {
    flex-direction: row;
    overflow-x: auto;
  }

  .menu-item {
    border-left: none;
    border-bottom: 3px solid transparent;
    white-space: nowrap;
  }

  .menu-item.router-link-exact-active {
    border-left: none;
    border-bottom: 3px solid #42b883;
  }

  .main-content {
    overflow-y: auto;
  }
}

/* 侧边栏按钮容器 - 绿色主题 */
.sidebar-button-container {
  padding: 16px 20px;
  margin-bottom: 40%;
  margin-left: 10px;
  margin-right: 10px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  background: linear-gradient(135deg, #e8f5f0 0%, #d4ebe3 100%);
  border-radius: 8px;
  border: 1px solid #42b88333;
}

/* 启动机器人按钮样式 */
.start-robot-btn,
.el-button.start-robot-btn {
  background-color: #42b883 !important;
  color: white !important;
  border: none !important;
  padding: 8px 16px !important;
  border-radius: 4px !important;
  font-size: 14px !important;
  line-height: 1.5 !important;
  cursor: pointer !important;
  transition: background-color 0.3s ease !important;
  box-shadow: none !important;
  width: 100% !important;
  margin: 0 !important;
}

.start-robot-btn:hover,
.el-button.start-robot-btn:hover {
  background-color: #369970 !important;
}

/* 重启间隔设置 */
.interval-setting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #42b88366;
}

.interval-setting label {
  color: #2c3e50;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.interval-setting input {
  width: 50px;
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: all 0.3s;
  background: transparent;
  text-align: center;
}

/* 隐藏数字输入框的上下箭头 */
.interval-setting input[type="number"]::-webkit-inner-spin-button,
.interval-setting input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.interval-setting input[type="number"] {
  -moz-appearance: textfield;
}

.interval-setting input:focus {
  background: rgba(66, 184, 131, 0.05);
}

/* 端口状态 */
.port-status {
  padding: 10px 12px;
  background: white;
  border-radius: 6px;
  text-align: center;
  border: 1px solid #42b88366;
}

.status-indicator {
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-indicator::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.status-indicator.online {
  color: #42b883;
}

.status-indicator.online::before {
  background: #42b883;
  box-shadow: 0 0 8px rgba(66, 184, 131, 0.6);
  animation: pulse 2s infinite;
}

.status-indicator.offline {
  color: #e74c3c;
}

.status-indicator.offline::before {
  background: #e74c3c;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 设置容器 */
.settings-container {
  padding: 0 20px;
  margin-top: auto;
}

.settings-container .el-button {
  color: #42b883;
  font-size: 14px;
}

.settings-container .el-button:hover {
  color: #369970;
}

/* 倒计时 */
.countdown {
  padding: 10px 12px;
  background: white;
  border-radius: 6px;
  text-align: center;
  border: 1px solid #42b88366;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.countdown-text {
  font-size: 13px;
  font-weight: 500;
  color: #f39c12;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.countdown-text::before {
  content: '⏱️';
  font-size: 14px;
}

.countdown .el-button {
  padding: 4px 12px !important;
  font-size: 12px !important;
}
</style>
