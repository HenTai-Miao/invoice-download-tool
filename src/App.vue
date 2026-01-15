<template>
  <div class="layout">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="logo">
        <h3>发票解析上传工具（河北）</h3>
      </div>

      <nav class="menu">
        <RouterLink to="/invoice-upload" class="menu-item">
          <span class="menu-icon">📤</span>
          <span class="menu-text">发票解析上传</span>
        </RouterLink>
      </nav>

      <!-- 启动机器人 -->
      <div class="sidebar-button-container">
        <el-button
          class="start-robot-btn"
          type="primary"
          @click="handleOpenRobotBrowser"
        >
          {{ robotState === 'running' ? '停止监控' : '启动机器人下载发票' }}
        </el-button>

        <!-- 重启间隔 -->
        <div class="interval-setting">
          <label>重启间隔(分钟):</label>
          <input
            v-model.number="restartIntervalMinutes"
            type="number"
          />
        </div>

        <!-- 端口状态 -->
        <div class="port-status">
          <span
            class="status-indicator"
            :class="portStatus"
          >
            端口 8082：{{ portStatus === 'online' ? '在线' : '离线' }}
          </span>
        </div>

        <!-- 倒计时 -->
        <div v-if="robotState === 'restarting' && remainingSeconds > 0" class="countdown">
          <span class="countdown-text">
            重启倒计时：{{ formatTime(remainingSeconds) }}
          </span>
          <el-button
            size="small"
            type="danger"
            @click="cancelRestart"
            style="margin-left: 10px;"
          >
            取消重启
          </el-button>
        </div>
      </div>

      <!-- 设置 -->
      <div class="settings-container">
        <el-button type="text" @click="openSettingsDialog">
          ⚙️ 设置
        </el-button>
      </div>
    </aside>

    <!-- 主内容 -->
    <main class="main-content">
      <RouterView />
    </main>

    <!-- 设置弹窗 -->
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
import { ElMessage, ElLoading } from 'element-plus'

/* -------------------- 基础状态 -------------------- */

type RobotState = 'idle' | 'running' | 'restarting'

const robotState = ref<RobotState>('idle')
const portStatus = ref<'online' | 'offline'>('offline')

const restartIntervalMinutes = ref(1)
const remainingSeconds = ref(0)

/* -------------------- 定时器 -------------------- */

const checkTimer = ref<NodeJS.Timeout | null>(null)
const restartTimer = ref<NodeJS.Timeout | null>(null)
const countdownTimer = ref<NodeJS.Timeout | null>(null)

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

function selectScriptPath() {
  // @ts-expect-error Electron
  window.electronAPI.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '批处理文件', extensions: ['bat'] }],
    title: '选择脚本文件'
  }).then((res: any) => {
    if (!res.canceled && res.filePaths?.length) {
      scriptConfig.value.scriptPath = res.filePaths[0]
      console.log('已选择脚本:', scriptConfig.value.scriptPath)
    }
  }).catch((error: any) => {
    console.error('选择文件失败:', error)
    ElMessage.error('选择文件失败')
  })
}

async function saveScriptConfig() {
  if (!scriptConfig.value.scriptPath) {
    ElMessage.warning('请选择脚本文件')
    return
  }

  const loading = ElLoading.service({
    text: '正在保存配置...',
    background: 'rgba(0,0,0,0.7)'
  })

  try {
    console.log('开始保存配置:', scriptConfig.value)

    // 检查 API 是否存在
    // @ts-expect-error Electron
    if (!window.electronAPI?.saveScriptConfig) {
      throw new Error('保存配置接口不存在')
    }

    // 创建纯净的配置对象（只包含可序列化的数据）
    const configToSave = {
      scriptPath: scriptConfig.value.scriptPath
    }

    // @ts-expect-error Electron
    const result = await Promise.race([
      window.electronAPI.saveScriptConfig(configToSave),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('保存超时')), 5000)
      )
    ])

    console.log('保存结果:', result)
    ElMessage.success('配置保存成功')
    settingsDialogVisible.value = false
  } catch (error: any) {
    console.error('保存配置失败:', error)
    ElMessage.error(error.message || '配置保存失败，请重试')
  } finally {
    loading.close()
  }
}

/* -------------------- 启动 / 停止 -------------------- */

async function handleOpenRobotBrowser() {
  if (robotState.value === 'running') {
    // 停止监控时调用脚本的 stop 命令
    const loading = ElLoading.service({
      text: '正在停止机器人...',
      background: 'rgba(0,0,0,0.7)'
    })

    try {
      console.log('调用脚本 stop 命令...')
      // @ts-expect-error Electron
      await window.electronAPI.executeScript({ command: 'stop' })
      console.log('脚本 stop 命令执行完成')
      ElMessage.success('机器人已停止')
    } catch (error: any) {
      console.error('停止机器人异常:', error)
      ElMessage.warning('机器人停止命令已发送')
    } finally {
      loading.close()
      stopAll()
    }
    return
  }

  const loading = ElLoading.service({
    text: '正在启动机器人浏览器',
    background: 'rgba(0,0,0,0.7)'
  })

  try {
    console.log('开始启动机器人...')
    await restartRobot(false)
    console.log('机器人启动完成')
    ElMessage.success('机器人启动成功')
  } catch (error: any) {
    console.error('机器人启动异常:', error)
    console.error('错误详情:', error.message, error.stack)

    // 即使有错误，如果浏览器已经打开，也认为是成功的
    ElMessage.warning('机器人已启动，但可能有警告信息')

    // 仍然启动监控
    robotState.value = 'running'
    setTimeout(() => {
      startPortMonitoring()
    }, 3000)
  } finally {
    loading.close()
  }
}

// 独立的端口监控函数 - 不依赖机器人状态
function startIndependentPortMonitoring() {
  console.log('启动独立端口监控')

  // 立即检测一次
  checkPortIndependently()

  // 每1秒检测一次
  checkTimer.value = setInterval(checkPortIndependently, 1000)
}

async function checkPortIndependently() {
  try {
    // @ts-expect-error Electron
    if (!window.electronAPI?.checkPort) {
      console.error('checkPort 方法不存在')
      return
    }

    // @ts-expect-error Electron
    const result = await window.electronAPI.checkPort(8082)

    if (result && result.isListening) {
      portStatus.value = 'online'
    } else {
      portStatus.value = 'offline'

      // 只有在机器人运行状态下才触发重启
      if (robotState.value === 'running') {
        scheduleRestart()
      }
    }
  } catch (error) {
    console.log('独立端口检测失败:', error)
    portStatus.value = 'offline'
  }
}

/* -------------------- 核心逻辑 -------------------- */

async function restartRobot(showMessage = true) {
  robotState.value = 'restarting'
  clearTimers()

  // @ts-expect-error Electron
  await window.electronAPI.executeScript({ command: 'restart' })

  robotState.value = 'running'

  setTimeout(startPortMonitoring, 3000)
  showMessage && ElMessage.success('机器人已重启')
}

function startPortMonitoring() {
  clearTimers()
  checkPortOnce()
  checkTimer.value = setInterval(checkPortOnce, 1000) // 1秒检测一次
}

async function checkPortOnce() {
  if (robotState.value !== 'running') return

  try {
    // 使用 netstat 命令检查端口
    // @ts-expect-error Electron
    const result = await window.electronAPI.checkPort(8082)

    console.log('端口检测结果:', result)

    if (result && result.isListening) {
      portStatus.value = 'online'
    } else {
      portStatus.value = 'offline'
      scheduleRestart()
    }
  } catch (error) {
    console.log('端口检测失败:', error)
    portStatus.value = 'offline'
    scheduleRestart()
  }
}

function scheduleRestart() {
  if (robotState.value !== 'running') return

  robotState.value = 'restarting'
  clearTimers()

  // 设置倒计时（转换为秒）
  remainingSeconds.value = restartIntervalMinutes.value * 60

  // 启动倒计时定时器
  countdownTimer.value = setInterval(() => {
    remainingSeconds.value--
    if (remainingSeconds.value <= 0) {
      clearInterval(countdownTimer.value!)
      countdownTimer.value = null
    }
  }, 1000)

  restartTimer.value = setTimeout(() => {
    restartRobot()
  }, restartIntervalMinutes.value * 60 * 1000)
}

/* -------------------- 清理 -------------------- */

function clearTimers() {
  checkTimer.value && clearInterval(checkTimer.value)
  restartTimer.value && clearTimeout(restartTimer.value)
  countdownTimer.value && clearInterval(countdownTimer.value)
  checkTimer.value = null
  restartTimer.value = null
  countdownTimer.value = null
}

function stopAll() {
  robotState.value = 'idle'
  portStatus.value = 'offline'
  remainingSeconds.value = 0
  clearTimers()
}

onMounted(async () => {
  // @ts-expect-error Electron
  const cfg = await window.electronAPI.getScriptConfig()
  scriptConfig.value.scriptPath = cfg?.scriptPath || ''

  // 启动独立的端口监控
  console.log('页面加载完成，启动端口监控')
  startIndependentPortMonitoring()
})

onUnmounted(() => {
  stopAll()
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
