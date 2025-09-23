import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/*.test.{ts,tsx}', 'src/__tests__/**/*.test.{ts,tsx}', 'src/__tests__/**/*.ts', 'src/**/__tests__/**/*.ts']
  }
  ,resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
