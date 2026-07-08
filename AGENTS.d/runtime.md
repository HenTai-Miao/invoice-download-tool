# Runtime Notes

- Project type: Electron + Vue + Vite, ESM Node project.
- Package manager: `pnpm@9.15.0`.
- Node requirement from `package.json`: `^20.19.0 || >=22.12.0`.
- Main process entry: `electron/main.js`; packaged entry points at `dist-electron/main.js`.
- Development launch: `pnpm run electron:start` starts Vite first and then Electron with `VITE_DEV_SERVER_URL`.
- Build/package: `pnpm run electron:build`.
