import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

// Get version from package.json
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = packageJson.version

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
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
