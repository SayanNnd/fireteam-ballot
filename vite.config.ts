import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  root: resolve(workspaceRoot, 'frontend'),
  envDir: workspaceRoot,
  plugins: [react()],
  build: {
    outDir: resolve(workspaceRoot, 'dist'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api/bungie-milestones': {
        target: 'https://www.bungie.net',
        changeOrigin: true,
        rewrite: () => '/Platform/Destiny2/Milestones/',
      },
      '/bungie-proxy': {
        target: 'https://www.bungie.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bungie-proxy/, ''),
        timeout: 25000,
        proxyTimeout: 25000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest) => {
            proxyRequest.removeHeader('origin');
          });
        },
      },
    },
  },
})
