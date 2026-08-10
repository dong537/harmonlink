import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const repoRoot = path.resolve(__dirname);

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: [
    {
      command: 'node e2e/start-servers.cjs',
      url: 'http://127.0.0.1:4173',
      timeout: 120_000,
      reuseExistingServer: false,
      cwd: repoRoot,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
