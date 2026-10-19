import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/bungie-proxy': {
        target: 'https://www.bungie.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bungie-proxy/, ''),
      },
    },
  },
})
