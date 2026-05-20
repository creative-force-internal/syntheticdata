import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    allowedHosts: ['syntheticdata.creativeoperations.com'],
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/mcp': 'http://127.0.0.1:3001',
      '/db':  'http://127.0.0.1:3001',
    },
    historyApiFallback: true,
  },
})
