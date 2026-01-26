import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    exclude: ['tests/e2e/npm-install.test.ts'],
    testTimeout: 120000,
    hookTimeout: 60000,
    globals: true,
  },
});
