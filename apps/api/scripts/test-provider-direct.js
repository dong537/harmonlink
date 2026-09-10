#!/usr/bin/env node
/**
 * Read-only provider probes. Credentials are supplied through environment
 * variables and are never printed. No purchase endpoint is called.
 */

const crypto = require('crypto');

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function jsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function test985Proxy() {
  const apiKey = requiredEnv('NINE_EIGHT_FIVE_APIKEY');
  const zoneId = requiredEnv('NINE_EIGHT_FIVE_ZONE_ID');
  const baseUrl = (process.env.NINE_EIGHT_FIVE_BASE_URL || 'https://open-api.985proxy.com').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/res_static/inventory`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ static_proxy_type: 'premium', zone: zoneId }),
  });
  const payload = jsonOrNull(await response.text());
  const records = Array.isArray(payload?.data) ? payload.data : [];
  const usRecords = records.filter((item) => item?.country_code === 'US' || item?.country === 'US');
  console.log(JSON.stringify({
    provider: 'NINE_EIGHT_FIVE',
    httpStatus: response.status,
    code: payload?.code ?? null,
    message: payload?.msg ?? payload?.message ?? null,
    records: records.length,
    usRecords: usRecords.length,
  }));
  if (!response.ok || (payload && payload.code !== undefined && payload.code !== 0)) {
    throw new Error('985Proxy inventory probe failed');
  }
}

async function testIpipd() {
  const appId = requiredEnv('IPIPD_APP_ID');
  const appSecret = requiredEnv('IPIPD_APP_SECRET');
  const baseUrl = (process.env.IPIPD_BASE_URL || 'https://api.ipipd.cn').replace(/\/$/, '');
  const method = 'GET';
  const uri = '/openapi/v2/account';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const body = '';
  const signString = `${method}${uri}${timestamp}${nonce}${body}`;
  const signature = crypto.createHmac('sha256', appSecret).update(signString).digest('hex');
  const response = await fetch(`${baseUrl}${uri}`, {
    method,
    headers: {
      'X-API-AppId': appId,
      'X-API-Timestamp': timestamp,
      'X-API-Nonce': nonce,
      'X-API-Signature': signature,
      'Content-Type': 'application/json',
    },
  });
  const payload = jsonOrNull(await response.text());
  console.log(JSON.stringify({
    provider: 'IPIPD',
    httpStatus: response.status,
    code: payload?.code ?? null,
    message: payload?.message ?? payload?.msg ?? null,
    traceId: payload?.traceId ?? null,
  }));
  if (!response.ok || (payload && payload.success === false)) {
    throw new Error('IPIPD account probe failed');
  }
}

async function main() {
  await test985Proxy();
  await testIpipd();
}

main().catch((error) => {
  console.error(`provider probe failed: ${error.message}`);
  process.exitCode = 1;
});
