import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'examples/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'build/',
        'examples/',
        'dist/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/__tests__/**',
        'scripts/',
        '*.config.ts',
        '*.config.js',
        'vitest.config.ts',
        'eslint.config.js',
      ],
    },
  },
});
