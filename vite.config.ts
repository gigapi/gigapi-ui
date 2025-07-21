import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { readFileSync } from 'fs'

// Get version from package.json
const packageJson = JSON.parse(
  readFileSync('./package.json', 'utf-8')
)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Add package version to environment
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(packageJson.version)
  },
})

