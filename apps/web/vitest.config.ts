import { cpus } from 'node:os';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 每个 worker 都会创建一套 jsdom + antd 运行时，默认的 CPU-1 个 worker 在多核机器上
// 会互相抢占 CPU，导致渲染类用例随机超时。上限按 CPU 数推导，避免在 CI 小机器上反向超额。
const maxWorkers = Math.max(1, Math.min(8, cpus().length - 1));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.spec.tsx', 'src/**/*.spec.ts'],
    maxWorkers,
    coverage: {
      provider: 'v8',
      exclude: ['**/dist/**', '**/*.d.ts'],
    },
  },
});
