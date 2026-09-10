import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { findSecretFindings } from './scan-secrets.mjs';

const root = resolve(import.meta.dirname, '..');

test('ignores local database examples and test credentials', () => {
  const findings = findSecretFindings([
    {
      path: '.env.example',
      content: 'DATABASE_URL=postgresql://user:local@localhost:5432/app\nPASSWORD="LegacyCompatTest123!"',
    },
    {
      path: 'apps/api/src/auth.spec.ts',
      content: "const password = 'LegacyCompatTest123!';",
    },
    {
      path: 'apps/api/src/database.spec.ts',
      content: [
        'DATABASE_URL_TEST=postgresql://postgres:postgres@production.example.com/ipeasy_test',
        'DATABASE_URL_TEST=postgresql://postgres:postgres@127.0.0.2:5432/ipeasy_test',
      ].join('\n'),
    },
  ]);

  assert.deepEqual(findings, []);
});

test('flags a remote database credential', () => {
  const credential = ['postgres', 'ql://app:real-password-123456@203.0.113.10:5432/prod'].join('');
  const findings = findSecretFindings([
    {
      path: 'docs/operations.md',
      content: `psql "${credential}"`,
    },
  ]);

  assert.deepEqual(findings, ['docs/operations.md:1']);
});

test('flags a remote database credential even when its password is weak', () => {
  const credential = ['postgres', 'ql://app:password@198.51.100.20:5432/prod'].join('');
  const findings = findSecretFindings([
    {
      path: 'docs/operations.md',
      content: `DATABASE_URL=${credential}`,
    },
  ]);

  assert.deepEqual(findings, ['docs/operations.md:1']);
});

test('flags known provider credential formats', () => {
  const findings = findSecretFindings([
    { path: 'config-one.txt', content: ['key=yR_', 'abcdefghijklmnopqrstuvwxyz123456'].join('') },
    { path: 'config-two.txt', content: ['app=APP', '12345678'].join('') },
    { path: 'config-three.txt', content: ['token=ctrl_hk_', 'abcdefghijklmnop'].join('') },
  ]);

  assert.deepEqual(findings, ['config-one.txt:1', 'config-two.txt:1', 'config-three.txt:1']);
});

test('flags high-entropy generic credentials while ignoring placeholders', () => {
  const findings = findSecretFindings([
    {
      path: 'config.env',
      content: 'API_TOKEN="mK8vP2xQ7rT4nL9wC6sZ3hJ5dF1gB0yU8iO4pA6eR2tY"',
    },
    {
      path: 'README.md',
      content: 'API_TOKEN="<your-api-token>"',
    },
  ]);

  assert.deepEqual(findings, ['config.env:1']);
});

test('allows high-entropy generic fixtures in test files', () => {
  const findings = findSecretFindings([
    {
      path: 'apps/api/src/crypto.spec.ts',
      content: 'const password = "mK8vP2xQ7rT4nL9wC6sZ3hJ5dF1gB0yU8iO4pA6eR2tY";',
    },
  ]);

  assert.deepEqual(findings, []);
});

test('scanner test source does not contain credential-shaped literals', () => {
  const path = 'scripts/scan-secrets.spec.mjs';
  const findings = findSecretFindings([
    { path, content: readFileSync(new URL(import.meta.url), 'utf8') },
  ]);

  assert.deepEqual(findings, []);
});

test('security scan tolerates tracked files deleted from the working tree', () => {
  const output = execFileSync(process.execPath, ['scripts/scan-secrets.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.match(output, /tracked files checked/);
});
