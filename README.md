# 发票解析上传工具（Vue3 + Electron + Vite）

概述：监控本地 ZIP 文件并上传到后端，展示实时状态与上传历史。

主要功能

- 单实例应用，自动聚焦已运行实例。
- 监控目录 D:\develop\function-test\invoice-parse-upload-tool\pending-upload 中的 .zip。
- 顺序上传（互斥检查/去重），axios 上报进度，成功判定 response.data.code === 200。
- 上传成功后移动到 D:\develop\function-test\invoice-parse-upload-tool\uploaded。
- 通过 IPC 向渲染进程推送 file-status-update、upload-history-update。
- 维护最近上传历史（最多 20 条）。
- 10 秒轮询检查新文件；支持 Ctrl+Shift+I 打开调试、F5 刷新。
- 生产环境支持 ASAR 打包路径解析，加载 dist-frontend/index.html。

目录结构（精简）

- electron/
  - main.js（主进程：目录监控、上传、IPC、窗口管理）
  - preload/index.js（暴露 electronAPI：getUploadHistory/onFileStatusUpdate 等）
- src/
  - main.ts、App.vue
  - router/index.ts（hash 路由，/invoice-upload -> InvoiceDownloadView）
  - views/InvoiceDownloadView.vue（状态列表与历史 UI）
  - services/invoiceUploadService.ts（渲染侧上传封装，部分功能由主进程实际实现）
  - assets/、components/
- scripts/start-electron.js（先启 Vite，再以 VITE_DEV_SERVER_URL 启动 Electron）
- 配置：vite.config.ts、vite.electron.config.ts、electron-builder.yml、eslint.config.ts、tsconfig*.json

运行与构建

- 安装依赖：pnpm install
- Web 开发：pnpm dev（仅前端）
- Electron 开发：pnpm run electron:start（自动启 Vite 并打开 Electron）
- 构建前端：pnpm build
- 打包桌面应用：pnpm run electron:build（先清理 dist/，再构建前端与主进程，最后 electron-builder）

关键后端接口

- 上传：POST <http://localhost:8080/zz-resource/oss/endpoint/put-file>
  - 表单字段：file（zip），进度通过 onUploadProgress 上报
  - 成功判定：返回体 code === 200
- 发票数量（示例/待接入）：GET <http://localhost:8080/api/invoice/count>

事件与通道（预加载暴露）

- 调用：getUploadHistory()、getUploadStatus()、getDownloadedInvoiceCount()
- 订阅：onFileStatusUpdate(fn)、onUploadHistoryUpdate(fn)
- 其它：zip-list（获取监控到的 ZIP 列表）

注意

- 监控目录为硬编码的 Windows 路径，部署前请按需修改 electron/main.js 与相关常量。
- 渲染层的 services 中部分方法为占位实现，真实逻辑在主进程。
- Node 要求：^20.19 或 ≥22.12；包管理器：pnpm@9。
完
