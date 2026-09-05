#!/usr/bin/env node
/**
 * 直接测试 provider adapter（绕过 HTTP API）
 * 使用方法: node apps/api/scripts/test-provider-direct.js
 */

const crypto = require('crypto');

function decryptAesGcm(ciphertext, keyBase64) {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  const key = Buffer.from(keyBase64, 'base64');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function test985Proxy() {
  console.log('🧪 测试 985Proxy 直接调用...\n');

  const credential = {
    apikey: 'yR_7WPGbMxp-eVJfN1dQR2JNeHA0Y2MwMTc2NDk5MDc1MQ==',
    zoneId: '4sd72p1bvlha'
  };

  try {
    const body = {
      static_proxy_type: 'premium',
      zone: credential.zoneId
    };

    const response = await fetch('https://open-api.985proxy.com/res_static/inventory', {
      method: 'POST',
      headers: {
        'apikey': credential.apikey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log('✅ 985Proxy 响应:');
    console.log(JSON.stringify(data, null, 2));

    // 过滤美国库存
    if (data.data && Array.isArray(data.data)) {
      const usPackages = data.data.filter(pkg =>
        (pkg.country_code === 'US' || pkg.country === 'US')
      );
      console.log(`\n🇺🇸 美国库存数量: ${usPackages.length}`);
      if (usPackages.length > 0) {
        console.log('示例美国套餐:');
        console.log(JSON.stringify(usPackages[0], null, 2));
      }
    }

  } catch (error) {
    console.error('❌ 985Proxy 错误:', error.message);
  }
}

async function testIpipd() {
  console.log('\n\n🧪 测试 ipipd 直接调用...\n');

  const credential = {
    appId: 'APP13618B8738',
    appSecret: 'fzEE0vF014A7WfdpCp0pek2ufnRo65E4HN6Ni3rZjitx9sjpNSy0beIyo6UKGbi7'
  };

  try {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');

    // HMAC-SHA256 签名
    const signString = `${credential.appId}${timestamp}${nonce}`;
    const signature = crypto
      .createHmac('sha256', credential.appSecret)
      .update(signString)
      .digest('hex');

    const response = await fetch('https://api.ipipd.cn/api/v1/ip/list', {
      method: 'GET',
      headers: {
        'X-App-Id': credential.appId,
        'X-Timestamp': timestamp.toString(),
        'X-Nonce': nonce,
        'X-Signature': signature,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('✅ ipipd 响应:');
    console.log(JSON.stringify(data, null, 2));

    // 过滤美国库存
    if (data.data && Array.isArray(data.data)) {
      const usIps = data.data.filter(ip =>
        ip.country === 'US' || ip.countryCode === 'US'
      );
      console.log(`\n🇺🇸 美国库存数量: ${usIps.length}`);
      if (usIps.length > 0) {
        console.log('示例美国 IP:');
        console.log(JSON.stringify(usIps[0], null, 2));
      }
    }

  } catch (error) {
    console.error('❌ ipipd 错误:', error.message);
  }
}

async function main() {
  await test985Proxy();
  await testIpipd();

  console.log('\n✅ 直接测试完成');
}

main();
