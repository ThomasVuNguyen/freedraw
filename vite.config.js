import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1234,
    host: '0.0.0.0',
  },
  preview: {
    port: 1234,
    host: '0.0.0.0',
  },
})
