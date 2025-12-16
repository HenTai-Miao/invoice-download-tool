/// <reference types="vite/client" />

interface ElectronAPI {
  getDownloadedInvoiceCount: () => Promise<number>;
  requestZipList: () => Promise<string[]>;
  onZipList: (callback: (list: string[]) => void) => void;
  onUploadStatus: (callback: (data: { file: string; status: string }) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
