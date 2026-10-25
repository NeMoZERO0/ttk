import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Запросы фронта идут на /api/... — Vite проксирует их на FastAPI.
// Адрес бэкенда можно поменять в frontend/.env (переменная API_TARGET).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.API_TARGET || 'http://localhost:8000'
  const proxy = {
    '/api': {
      target,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  }
  return {
    plugins: [react(), tailwindcss()],
    // host: true — карту можно открыть с телефона в той же Wi-Fi сети по адресу компьютера
    server: { port: 5173, host: true, proxy },
    preview: { port: 4173, host: true, proxy },
  }
})
