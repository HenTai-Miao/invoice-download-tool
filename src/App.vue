<template>
  <div class="layout">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="logo">
        <h2>发票解析上传工具</h2>
      </div>
      <nav class="menu">
        <RouterLink to="/invoice-upload" class="menu-item">
          <span class="menu-icon">📤</span>
          <span class="menu-text">发票解析上传</span>
        </RouterLink>
      </nav>
      
      <!-- 启动机器人按钮 -->
      <div class="sidebar-button-container">
        <el-button
          class="start-robot-btn"
          type="primary"
          @click="handleOpenRobotBrowser"
        >
          1.打开机器人浏览器
        </el-button>
        2.在机器人浏览器打开并登录电子税务局
        <el-button
          class="start-robot-btn"
          type="primary"
          @click="copyAddress"
        >
          点击此处复制电子税务局地址
        </el-button>
        
        <el-button
          class="start-robot-btn"
          type="primary"
          @click="handleStartRobot"
        >
          3.我已登陆，开始执行机器人
        </el-button>
      </div>

      <!-- 设置图标 -->
      <div class="settings-container">
        <el-button
          class="settings-btn"
          type="text"
          @click="openSettingsDialog"
        >
          ⚙️ 设置
        </el-button>
      </div>
    </aside>

    <!-- 主内容区域 -->
    <main class="main-content">
      <RouterView />
    </main>

    <!-- 设置对话框 -->
    <el-dialog
      v-model="settingsDialogVisible"
      title="脚本配置"
      width="500px"
    >
      <el-form :model="scriptConfig" label-width="100px">
        <el-form-item label="脚本文件">
          <el-input
            v-model="scriptConfig.scriptPath"
            placeholder="请选择脚本文件"
            style="width: 300px;"
            readonly
            disabled
          />
          <el-button
            type="primary"
            @click="selectScriptPath"
            style="margin-left: 10px;"
          >
            选择文件
          </el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="settingsDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveScriptConfig">保存</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElButton, ElMessage, ElDialog, ElForm, ElFormItem, ElInput } from "element-plus";
import { robotApi } from "./api";
// // 河北电子税务局
// // 请求参数
// const params = 'hebei'
// // 电子税务局地址
// const taxOfficeAddress = 'http://hebei.chinatax.gov.cn/hbsw/index.html'

// 北京电子税务局
// 请求参数
const params = 'beijing'
// 电子税务局地址
const taxOfficeAddress = 'https://etax.beijing.chinatax.gov.cn:8443/'

// 设置对话框可见性
const settingsDialogVisible = ref(false)

// 脚本配置
const scriptConfig = ref({
  scriptPath: ''
})

// 打开设置对话框
function openSettingsDialog() {
  settingsDialogVisible.value = true
}

// 选择脚本路径
function selectScriptPath() {
  // 根据当前平台设置可用的脚本扩展名
  const isWindows = navigator.platform.includes('Win')
  // Windows平台也需要支持.sh脚本，因为用户安装了sh环境
  const extensions = isWindows ? ['bat', 'cmd', 'js', 'py', 'sh'] : ['sh', 'js', 'py']
  const filterName = isWindows ? 'Windows脚本文件' : 'Unix脚本文件'

  // @ts-expect-error 调用Electron的文件选择器
  window.electronAPI.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: filterName, extensions: extensions }],
    title: '选择脚本文件'
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      scriptConfig.value.scriptPath = result.filePaths[0]
    }
  }).catch(err => {
    console.error('选择文件失败:', err)
    ElMessage.error('选择文件失败')
  })
}

// 保存脚本配置
async function saveScriptConfig() {
  if (!scriptConfig.value.scriptPath) {
    ElMessage.warning('请选择脚本文件')
    return
  }

  try {
    // @ts-expect-error 调用Electron的API
    await window.electronAPI.saveScriptConfig({
      scriptPath: scriptConfig.value.scriptPath
    })
    ElMessage.success('配置保存成功')
    settingsDialogVisible.value = false
  } catch (error) {
    console.error('保存配置失败:', error)
    ElMessage.error(`保存配置失败: ${(error as Error).message}`)
  }
}

// 打开机器人浏览器（执行脚本）
async function handleOpenRobotBrowser() {
  try {
    // @ts-expect-error 调用Electron的API
    await window.electronAPI.executeScript({ command: 'restart' })
    ElMessage.success('正在打开机器人浏览器...')
  } catch (error) {
    console.error('执行脚本失败:', error)
    ElMessage.error(`执行失败: ${(error as Error).message}`)
  }
}

// 处理启动机器人按钮点击
async function handleStartRobot() {
  // 使用Element Plus的消息提示
  ElMessage({
      message: '机器人开始执行...',
      type: 'success',
      duration: 1500
  });
  
  const result = await robotApi({taxSite: params});
  console.log('机器人调用接口:', result);
}

// 复制地址功能
async function copyAddress() {
  await navigator.clipboard.writeText(taxOfficeAddress);
  ElMessage({
      message: '地址已成功复制！',
      type: 'success',
      duration: 2000
  });
}

// 初始化时加载配置
onMounted(async () => {
  try {
    // @ts-expect-error 调用Electron的API
    const config = await window.electronAPI.getScriptConfig()
    // 只需要设置scriptPath
    scriptConfig.value.scriptPath = config.scriptPath || ''
  } catch (error) {
    console.error('加载配置失败:', error)
    ElMessage.error(`加载配置失败: ${(error as Error).message}`)
  }
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
  overflow: hidden; /* 避免滚动条 */
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
    overflow-y: auto; /* 移动端允许垂直滚动 */
  }
}
/* 侧边栏按钮容器 */
.sidebar-button-container {
  padding: 0 20px;
  margin-bottom: 40%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
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
  
  /* 确保对齐 */
  width: 100% !important;
  margin: 0 !important;
}

</style>