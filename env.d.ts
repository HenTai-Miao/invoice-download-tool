/// <reference types="vite/client" />

interface UploadFileStatus {
  name: string;
  status: 'pending' | 'uploading' | 'success' | 'failed';
  progress?: number;
  size?: number;
  lastError?: string;
  businessCode?: number;
  nextRetryAt?: number;
  retryable?: boolean;
}

interface UploadHistoryItem {
  name: string;
  size: number;
  uploadTime: string;
}

interface OpenDialogOptions {
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
  filters?: Array<{ name: string; extensions: string[] }>;
  title?: string;
}

interface ElectronAPI {
  getDownloadedInvoiceCount: () => Promise<number>;
  requestZipList: () => Promise<string[]>;
  getUploadStatus: () => Promise<UploadFileStatus[]>;
  getUploadHistory: () => Promise<UploadHistoryItem[]>;
  retryUpload: (fileName: string) => Promise<{ success: boolean; message?: string }>;
  onZipList: (callback: (list: string[]) => void) => void;
  onUploadStatus: (callback: (data: { file: string; status: string }) => void) => void;
  onFileStatusUpdate: (callback: (data: UploadFileStatus[]) => void) => void;
  onUploadHistoryUpdate: (callback: (data: UploadHistoryItem[]) => void) => void;
  showOpenDialog: (options: OpenDialogOptions) => Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
  getScriptConfig: () => Promise<{ scriptPath: string }>;
  saveScriptConfig: (config: {
    scriptPath: string;
    scriptName?: string;
  }) => Promise<{ success: boolean }>;
  executeScript: (command: { command: string }) => Promise<{
    success: boolean;
    output?: string;
    message?: string;
  }>;
  checkPort: (port: number) => Promise<{ isListening: boolean }>;
}

interface Window {
  electronAPI: ElectronAPI;
}
