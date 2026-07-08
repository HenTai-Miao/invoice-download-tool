# Troubleshooting Notes

- The Electron main process monitors `path.join(os.tmpdir(), "invoice", "pending-upload")`, which resolves on Windows to a path like `C:\Users\<user>\AppData\Local\Temp\invoice\pending-upload`.
- Every 5 seconds it scans top-level `.zip` files in that directory, uploads pending ZIPs to `http://10.141.24.63:8083/zz-resource/oss/endpoint/invoice-put-file`, and on `response.data.code === 200` moves them to `path.join(os.tmpdir(), "invoice", "uploaded")`.
- If the Spring downloader is also using `${java.io.tmpdir}/invoice/pending-upload` as its download and processing directory, this tool can race with Spring by moving ZIP files before Spring scans them. In Spring logs this can surface as `[下载入库闸门] ... 扫描ZIP=[]` and all submitted invoice numbers missing.
- To confirm on a Windows run, inspect the Electron log under the packaged app resources `logs/` directory for `开始检查新文件`, `文件上传成功`, and `文件移动结果: 成功` between the Spring Tab2 snapshot time and the Spring `[下载入库闸门]` failure time.
- If `pending-upload` is empty but the UI still shows pending files, inspect `${java.io.tmpdir}/invoice/upload-state.json`; stale entries can be restored into memory. The main process now prunes entries whose ZIP no longer exists in `pending-upload` during each queue scan.
- If the packaged Windows app opens a blank white window with only the title bar, inspect `resources/app.asar`; it must contain `/dist-electron/renderer/index.html`. Missing renderer files mean the installer was built from main/preload output without the Vite renderer bundle.
