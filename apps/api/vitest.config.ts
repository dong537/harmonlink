import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The source tree contains tracked JavaScript build artifacts next to the
  // TypeScript sources. Keep unit tests on one module graph so classes such as
  // AppError retain identity across extensionless imports.
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.json'],
  },
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.integration.spec.ts', 'src/**/tests/*-integration.spec.ts', 'dist/**', 'generated/**'],
    coverage: {
      provider: 'v8',
      exclude: ['**/generated/**', '**/dist/**', '**/*.d.ts'],
      thresholds: { statements: 80, branches: 70 },
    },
  },
});
