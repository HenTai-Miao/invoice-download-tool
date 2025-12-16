const { contextBridge, ipcRenderer } = require('electron');

const IPC_CHANNELS = {
  GET_DOWNLOADED_COUNT: 'get-downloaded-count',
  ZIP_LIST: 'zip-list',
  UPLOAD_STATUS: 'upload-status',
  GET_UPLOAD_STATUS: 'get-upload-status'
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
    ipcRenderer.on('upload-history-update', (_, data) => callback(data))
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
