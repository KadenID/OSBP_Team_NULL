import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@testing-library/react': path.resolve(__dirname, 'node_modules/@testing-library/react'),
      '@testing-library/jest-dom': path.resolve(__dirname, 'node_modules/@testing-library/jest-dom'),
      'vitest': path.resolve(__dirname, 'node_modules/vitest'),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react-router-dom': path.resolve(__dirname, 'node_modules/react-router-dom'),
    },
  },
  server: {
    fs: {
      allow: ['../../'],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: '../../Project_test/client_test/setup.js',
    include: ['../../Project_test/client_test/**/*.{test,spec}.{js,jsx}'],
    css: true,
    coverage: {
      reportsDirectory: '../../Project_test/client_test_coverage',
      reporter: ['text', 'html'],
    },
  },
})
