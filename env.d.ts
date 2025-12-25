/// <reference types="vite/client" />

interface ElectronAPI {
  getDownloadedInvoiceCount: () => Promise<number>;
  requestZipList: () => Promise<string[]>;
  getUploadStatus: () => Promise<unknown>;
  getUploadHistory: () => Promise<unknown>;
  // 脚本配置相关方法
  getScriptConfig: () => Promise<{ scriptPath: string; scriptName: string }>;
  saveScriptConfig: (config: { scriptPath: string; scriptName: string }) => Promise<{ success: boolean }>;
  executeScript: (command?: { command: string }) => Promise<{ success: boolean; output: string }>;
  onZipList: (callback: (list: string[]) => void) => void;
  onUploadStatus: (callback: (data: { file: string; status: string }) => void) => void;
  onFileStatusUpdate: (callback: (data: unknown[]) => void) => void;
  onUploadHistoryUpdate: (callback: (data: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
