import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// These formats are specific enough to be treated as credentials in any file.
const knownCredentialPatterns = [
  /yR_[A-Za-z0-9_-]{20,}={0,2}/,
  /APP\d{8,}/,
  /fzEE[A-Za-z0-9]{32,}/,
  /ctrl_hk_[A-Za-z0-9_-]{12,}/,
];

const genericCredentialPattern = /(?:api[_-]?key|app[_-]?secret|token|password)\s*[:=]\s*["']([^"'<$]+)["']/gi;
const postgresCredentialPattern = /postgres(?:ql)?:\/\/[^:\s"<>]+:([^@\s"<>]+)@([^/:\s"<>]+)(?::\d+)?\//gi;
const ignoredPath = /(^|[\\/])(?:node_modules|\.git|\.tmp|\.agents|\.claude|\.codex|\.opencode|packages[\\/]db[\\/]generated)([\\/]|$)/;

/**
 * Returns tracked-file line references containing high-confidence credentials.
 * The input form keeps the detector pure and makes boundary cases testable.
 */
export function findSecretFindings(files) {
  const findings = [];
  for (const file of files) {
    if (ignoredPath.test(file.path)) continue;
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (lineContainsCredential(line, file.path)) findings.push(`${file.path}:${index + 1}`);
    });
  }
  return findings;
}

function lineContainsCredential(line, path) {
  if (knownCredentialPatterns.some((pattern) => pattern.test(line))) return true;
  if (hasRemotePostgresCredential(line)) return true;

  if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path)) return false;

  genericCredentialPattern.lastIndex = 0;
  for (const match of line.matchAll(genericCredentialPattern)) {
    if (looksLikeCredential(match[1])) return true;
  }
  return false;
}

function hasRemotePostgresCredential(line) {
  postgresCredentialPattern.lastIndex = 0;
  for (const match of line.matchAll(postgresCredentialPattern)) {
    const password = match[1];
    const host = match[2].toLowerCase();
    if (isLocalOrPlaceholderHost(host)) continue;
    return true;
  }
  return false;
}

function looksLikeCredential(value) {
  if (value.length < 24 || isPlaceholder(value)) return false;
  const distinctRatio = new Set(value).size / value.length;
  return distinctRatio >= 0.45;
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('<') ||
    normalized.startsWith('${') ||
    normalized.includes('your-') ||
    normalized.includes('example') ||
    normalized.includes('placeholder') ||
    normalized.includes('changeme') ||
    normalized.includes('change-me') ||
    normalized.includes('test') ||
    normalized.includes('dummy') ||
    normalized.includes('fake') ||
    normalized.includes('redacted') ||
    normalized === 'password' ||
    normalized === 'secret';
}

function isLocalOrPlaceholderHost(host) {
  return host === 'localhost'
    || /^127(?:\.\d{1,3}){3}$/.test(host)
    || host === '::1'
    || host === 'host'
    || host === 'hostname'
    || host === 'example.com'
    || host.endsWith('.example.com');
}

function readTrackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'buffer',
  })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    // `git ls-files` includes tracked paths deleted in the working tree. A
    // security check must still inspect the files that will be shipped, not
    // crash before checking them because a removed artifact is unreadable.
    .filter((path) => existsSync(resolve(root, path)))
    .map((path) => ({ path, content: readFileSync(resolve(root, path), 'utf8') }));
}

function main() {
  const findings = findSecretFindings(readTrackedFiles());
  if (findings.length > 0) {
    console.error('secret-scan: credential-like literals found in tracked files:');
    findings.slice(0, 80).forEach((finding) => console.error(`- ${finding}`));
    if (findings.length > 80) console.error(`- ... ${findings.length - 80} more`);
    process.exitCode = 1;
    return;
  }

  console.log('secret-scan: tracked files checked; no high-confidence credential literals found.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
