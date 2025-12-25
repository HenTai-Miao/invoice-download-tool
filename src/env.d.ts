interface ElectronAPI {
  getDownloadedInvoiceCount: () => Promise<number>
  requestZipList: () => Promise<string[]>
  getUploadStatus: () => Promise<any>
  getUploadHistory: () => Promise<any[]>
  onZipList: (callback: (data: string[]) => void) => void
  onUploadStatus: (callback: (data: any) => void) => void
  onFileStatusUpdate: (callback: (data: any[]) => void) => void
  onUploadHistoryUpdate: (callback: (data: any[]) => void) => void
  showOpenDialog: (options: any) => Promise<any>
  
  // 脚本配置和执行相关API
  getScriptConfig: () => Promise<{ scriptPath: string }>
  saveScriptConfig: (config: { scriptPath: string; scriptName?: string }) => Promise<{ success: boolean }>
  executeScript: (command?: { command: string }) => Promise<{ success: boolean; output: string }>
}