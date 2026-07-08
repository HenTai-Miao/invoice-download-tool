import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'

export default defineConfig({
  build: {
    outDir: 'dist-electron/renderer',
    emptyOutDir: true,
  },
  plugins: [
    vue(),
    electron([
      {
        entry: 'electron/main.js',
        vite: {
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false,
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        entry: 'electron/preload/index.js',
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            emptyOutDir: false,
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      // 确保正确的模块解析
    }
  }
})
