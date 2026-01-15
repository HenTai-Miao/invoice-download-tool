const { contextBridge, ipcRenderer } = require('electron');

const IPC_CHANNELS = {
  GET_DOWNLOADED_COUNT: 'get-downloaded-count',
  ZIP_LIST: 'zip-list',
  UPLOAD_STATUS: 'upload-status',
  GET_UPLOAD_STATUS: 'get-upload-status',
  GET_SCRIPT_CONFIG: 'get-script-config',
  SAVE_SCRIPT_CONFIG: 'save-script-config',
  EXECUTE_SCRIPT: 'execute-script'
};

const electronAPI = {
  getDownloadedInvoiceCount: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_DOWNLOADED_COUNT),

  requestZipList: () => ipcRenderer.invoke(IPC_CHANNELS.ZIP_LIST),

  getUploadStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_UPLOAD_STATUS),

  getUploadHistory: () => ipcRenderer.invoke('get-upload-history'),

  onZipList: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.ZIP_LIST, (_, data) => callback(data)),

  onUploadStatus: (callback) =>
    ipcRenderer.on(IPC_CHANNELS.UPLOAD_STATUS, (_, data) => callback(data)),

  onFileStatusUpdate: (callback) =>
    ipcRenderer.on('file-status-update', (_, data) => callback(data)),

  onUploadHistoryUpdate: (callback) =>
    ipcRenderer.on('upload-history-update', (_, data) => callback(data)),

  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

  // 脚本配置和执行API
  getScriptConfig: () => ipcRenderer.invoke('get-script-config'),
  saveScriptConfig: (config) => ipcRenderer.invoke('save-script-config', config),
  executeScript: (command) => ipcRenderer.invoke('execute-script', command),

  checkPort: (port) => ipcRenderer.invoke('check-port', port)
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
