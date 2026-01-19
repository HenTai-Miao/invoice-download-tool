<template>
  <div class="upload-wrapper">
    <!-- 左右布局容器 -->
    <div class="main-content">
      <!-- 左侧：ZIP 文件上传状态 -->
      <div class="section-container">
        <div class="section-header">
          <h2>发票上传状态</h2>
        </div>
        <!-- 内部小框用于展示正在上传的文件 -->
        <div class="inner-container">
          <div v-if="files.length === 0" class="empty-container">
            <p class="no-content">暂无 ZIP 文件</p>
          </div>

          <div v-for="f in files" :key="f.name" class="item">
            <div class="content">
              <div class="header">
                <strong class="name">{{ f.name }}</strong>
                <span class="meta">
                  <span class="size">{{ formatFileSize(f.size) }}</span>
                </span>
              </div>

              <!-- 状态显示 -->
              <div class="status-container">
                <span v-if="f.status === 'pending'" class="status pending">
                  <span class="status-icon">⏳</span>
                  待上传
                </span>
                <span v-if="f.status === 'uploading'" class="status uploading">
                  <span class="status-icon spinning">🔄</span>
                  上传中...
                </span>
                <span v-if="f.status === 'success'" class="status success">
                  <span class="status-icon">✅</span>
                  已上传
                </span>
                <span v-if="f.status === 'failed'" class="status failed">
                  <span class="status-icon">❌</span>
                  上传失败
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：最近上传历史 -->
      <div class="section-container">
        <div class="section-header">
          <h2>最近上传历史</h2>
        </div>
        <!-- 内部小框用于展示上传历史 -->
        <div class="inner-container">
          <div v-if="uploadHistory.length === 0" class="empty-container">
            <p class="no-content">暂无上传历史记录</p>
          </div>

          <div v-else class="content-list">
            <div v-for="item in uploadHistory" :key="item.name" class="item">
              <div class="content">
                <div class="header">
                  <strong class="name">{{ item.name }}</strong>
                  <span class="size">{{ formatFileSize(item.size) }}</span>
                </div>
                <div class="time">
                  <span class="time-label">上传时间：</span>
                  <span class="time-value">{{ item.uploadTime }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

interface FileItem {
  name: string;
  status: 'pending' | 'uploading' | 'success' | 'failed';
  progress?: number;
  size?: number;
}

interface HistoryItem {
  name: string;
  size: number;
  uploadTime: string;
}

const files = ref<FileItem[]>([]);
const uploadHistory = ref<HistoryItem[]>([]);
const pollInterval: number | null = null;

// 格式化文件大小
function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

onMounted(async () => {
  // 使用类型断言来访问 electronAPI
  console.log('Window对象:', window);
  const { electronAPI } = window as any;
  console.log('ElectronAPI:', electronAPI);

  if (electronAPI) {
    // 接收文件状态更新
  electronAPI.onFileStatusUpdate((fileStatusList: FileItem[]) => {
    console.log('接收到文件状态更新:', fileStatusList);

    // 直接使用后端发送的完整文件状态列表，不保留已完成的文件
    // 因为已完成的文件会自动转移到历史记录中
    files.value = fileStatusList;
  });

    // 接收上传历史更新
    electronAPI.onUploadHistoryUpdate((historyList: HistoryItem[]) => {
      console.log('接收到上传历史更新:', historyList);
      uploadHistory.value = historyList;
    });

    // 主动获取上传历史记录，确保页面刷新后能立即显示
    try {
      const history = await electronAPI.getUploadHistory();
      console.log('主动获取到的上传历史:', history);
      if (history && Array.isArray(history)) {
        uploadHistory.value = history;
      }
    } catch (error) {
      console.error('获取上传历史失败:', error);
    }
  } else {
    console.warn('Electron API 未定义');
  }
});

onUnmounted(() => {
  // 清理轮询定时器
  if (pollInterval) {
    clearInterval(pollInterval);
  }
});
</script>

<style scoped>
.upload-wrapper {
  padding: 20px;
  margin: 0 auto;
}

/* 左右布局容器 */
.main-content {
  display: flex;
  gap: 20px;
  width: 100%;
}

/* 统一的区域容器样式（大框） */
.section-container {
  flex: 1;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.section-header {
  height: 45px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-container h2 {
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
}



/* 统一的内部容器样式（内部小框） */
.inner-container {
  height: calc(100vh - 130px);
  overflow-y: auto;
  padding: 15px;
  background: white;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* 空内容容器 */
.empty-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
}

/* 统一的空内容显示样式 */
.no-content {
  text-align: center;
  font-size: 16px;
  color: #888;
  padding: 20px;
  margin: 0;
}

/* 统一的自定义滚动条样式 */
.inner-container::-webkit-scrollbar {
  width: 8px;
}

.inner-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.inner-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.inner-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 统一的内容列表容器 */
.content-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 统一的项目样式 */
.item {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  border: 1px solid #e9ecef;
}

.item:hover {
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

/* 统一的内容容器 */
.content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 统一的头部样式 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

/* 统一的名称样式 */
.name {
  font-size: 14px;
  color: #333;
  word-break: break-all;
  flex: 1;
}

/* 统一的元数据样式 */
.meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 统一的大小样式 */
.size {
  font-size: 12px;
  color: #666;
  background: #e9ecef;
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid #dee2e6;
}

/* 统一的进度样式 */
.progress {
  font-size: 12px;
  color: #007bff;
}

/* 状态容器 */
.status-container {
  display: flex;
  align-items: center;
}

/* 状态样式 */
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: bold;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 4px;
}

.status-icon {
  font-size: 14px;
}

/* 旋转动画 */
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.spinning {
  animation: spin 1s linear infinite;
}

/* 统一的状态颜色 */
.pending {
  color: #888;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
}

.uploading {
  color: #007bff;
  background: #e7f3ff;
  border: 1px solid #b3d7ff;
}

.success {
  color: #28a745;
  background: #d4edda;
  border: 1px solid #c3e6cb;
}

.failed {
  color: #dc3545;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
}

/* 统一的时间样式 */
.time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #888;
}

.time-label {
  font-weight: 500;
}

.time-value {
  font-style: italic;
}
</style>
