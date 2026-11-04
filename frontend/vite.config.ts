import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Zapytania /api przekazujemy do backendu (Express, port 3000)
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
