# Deployment Notes

- Build Electron assets first with `pnpm run build:electron`.
- For ordinary Intel/AMD Windows machines, package the Beijing tool with `pnpm exec electron-builder -c electron-builder.yml --win --x64`.
- `pnpm run dist:win` on an Apple Silicon Mac defaults to `win-arm64`; use the explicit `--x64` command when preparing a Windows installer for the remote desktop.
- The NSIS installer is emitted under `release/发票解析上传工具 Setup 1.0.0.exe`; copy/rename it for delivery as needed.
- Before delivering a Windows installer, verify `release/win-unpacked/resources/app.asar` contains `/dist-electron/renderer/index.html`. Missing renderer files cause a blank white Electron window.
- Use `pnpm dlx @electron/asar list release/win-unpacked/resources/app.asar | rg 'dist-electron/renderer/index.html'` as the packaging smoke check.
- Keep `electron-builder.yml` output at `release/` and keep `files` narrowed to `dist-electron/main.js`, `dist-electron/preload/**/*`, and `dist-electron/renderer/**/*`; otherwise generated Windows output can be bundled back into the installer.
