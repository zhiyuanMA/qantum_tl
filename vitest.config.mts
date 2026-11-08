import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@data': path.resolve(root, 'data'),
      '@': path.resolve(root, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    restoreMocks: true,
    coverage: { include: ['src/domain/**', 'src/application/**'], exclude: ['**/*.test.*'] },
  },
});
