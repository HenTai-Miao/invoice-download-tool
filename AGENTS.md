# AGENTS.md

## At A Glance
- Root: `/Users/zhongerbing/Documents/xm/invoice-download-hn/invoice-download-tool`
- Scope: this file applies to this directory tree unless a deeper `AGENTS.md` overrides it.
- Detected: Node/JavaScript project detected, pnpm lockfile detected.
- Created: 2026-07-07 by the Codex Engineering Core hook because this project did not have `AGENTS.md`.

## Code Orientation
- Entry points: `electron/main.js` for the Electron main process, `electron/preload/index.js` for IPC exposure, `src/main.ts` / `src/App.vue` for the Vue renderer.
- Key directories: `electron/` for local directory monitoring and upload behavior, `src/views/` for renderer UI, `scripts/` for dev launch helpers.
- Do not hand-edit: `node_modules/`, `dist/`, `dist-electron/`, `release/`, packaged app output, local ZIP download/upload directories, and temporary artifacts outside `tmp/`.

## Common Commands
- Install: `pnpm install`.
- Run: `pnpm run electron:start` for Electron dev, `pnpm dev` for renderer-only Vite dev.
- Test: no test command is defined in `package.json`.
- Build assets: `pnpm run build:electron` must produce `dist-electron/renderer/index.html`, `dist-electron/main.js`, and `dist-electron/preload/index.js`.
- Windows x64 package: `pnpm exec electron-builder -c electron-builder.yml --win --x64`; do not use plain `pnpm run dist:win` on Apple Silicon for the Beijing Windows machine.
- Lint/format: `pnpm run lint` runs ESLint with `--fix --cache`.

## Packaging Guardrails
- Installer output belongs under `release/`; keeping it outside `dist-electron/` prevents recursive packaging of `win-unpacked`.
- Before delivering a Windows installer, verify `release/win-unpacked/resources/app.asar` contains `/dist-electron/renderer/index.html`.
- A blank white app window usually means the renderer bundle was not packaged. A several-hundred-MB installer usually means generated Windows output was packaged recursively.
- See `AGENTS.d/deployment.md` for the exact Beijing Windows packaging checklist.

## Knowledge Index
- `AGENTS.d/runtime.md`: run/build/test commands, ports, env names, local services; create or update only when that detail exists.
- `AGENTS.d/architecture.md`: module map, code boundaries, data flow, integration points; create or update only when that detail exists.
- `AGENTS.d/dependencies.md`: language/runtime versions, package managers, SDK/JDK/Node notes; create or update only when that detail exists.
- `AGENTS.d/testing.md`: test commands, fixtures, external services, known slow or flaky checks; create or update only when that detail exists.
- `AGENTS.d/deployment.md`: Docker, packaging, release, offline bundle, server operations; create or update only when that detail exists.
- `AGENTS.d/decisions.md`: durable technical decisions and project-specific constraints; create or update only when that detail exists.
- `AGENTS.d/troubleshooting.md`: known failure modes, exact symptoms, verified fixes; create or update only when that detail exists.

## Maintenance
- Keep this file as a quick project map, target under 60 lines and never above 120 lines.
- Put detailed commands, architecture, dependencies, tests, deployment, decisions, and troubleshooting in `AGENTS.d/`.
- Unless the user specifies an output path, put downloads, backups, conversion intermediates, scratch files, ad-hoc test scripts, test inputs/outputs, temporary fixtures, and other temporary artifacts under this project root's `tmp/`.
- Do not store secrets, credentials, or one-off conversation notes here.
- Before final response, mention whether AGENTS files were read, created, or updated.
