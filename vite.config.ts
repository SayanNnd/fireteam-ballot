import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
      },
    },
  },
})
