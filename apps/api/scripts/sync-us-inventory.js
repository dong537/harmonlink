const { prisma } = require('@ipeasy/db');
const { decryptAesGcm } = require('../src/common/crypto/aes-gcm');
const crypto = require('crypto');

const APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY;

async function fetch985Inventory(credential) {
  const { apikey, zoneId } = JSON.parse(credential);
  
  const results = [];
  
  // 查询 premium 和 shared 两种类型
  for (const proxyType of ['premium', 'shared']) {
    const url = 'https://open-api.985proxy.com/res_static/inventory';
    const body = { static_proxy_type: proxyType, zone: zoneId };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': apikey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      throw new Error(`985Proxy API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`985Proxy error: ${data.msg}`);
    }
    
    results.push({ proxyType, data: data.data });
  }
  
  return results;
}

function buildIpipdSignature(method, uri, timestamp, nonce, body, appSecret) {
  const message = `${method}${uri}${timestamp}${nonce}${body}`;
  return crypto.createHmac('sha256', appSecret).update(message).digest('hex');
}

async function fetchIpipdInventory(credential) {
  const { appId, appSecret } = JSON.parse(credential);
  
  const allRecords = [];
  let current = 0;
  const size = 200;
  
  while (true) {
    const url = 'https://api.ipipd.cn/openapi/v2/static/lines';
    const uri = '/openapi/v2/static/lines';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const body = JSON.stringify({ current, size, countryCode: 'USA' });
    
    const signature = buildIpipdSignature('POST', uri, timestamp, nonce, body, appSecret);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-AppId': appId,
        'X-API-Timestamp': timestamp,
        'X-API-Nonce': nonce,
        'X-API-Signature': signature,
      },
      body,
    });
    
    if (!response.ok) {
      throw new Error(`ipipd API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`ipipd error: ${data.message}`);
    }
    
    const records = data.data?.records || [];
    allRecords.push(...records);
    
    console.log(`   📄 Page ${current}: ${records.length} records`);
    
    if (records.length < size) {
      break;
    }
    
    current++;
  }
  
  return allRecords;
}

async function main() {
  console.log('🔍 Syncing US inventory from providers...\n');

  const site = await prisma.sites.findFirst();
  if (!site) throw new Error('No site found');

  const providers = await prisma.provider_accounts.findMany({
    where: { 
      siteId: site.id,
      status: 'ACTIVE',
    },
  });

  for (const provider of providers) {
    console.log(`\n📦 Provider: ${provider.providerCode}`);
    console.log(`   Base URL: ${provider.baseUrl}`);
    
    try {
      const credential = decryptAesGcm(provider.credentialEncrypted, APP_ENCRYPTION_KEY);
      
      let inventory;
      if (provider.providerCode === 'NINE_EIGHT_FIVE') {
        inventory = await fetch985Inventory(credential);
        console.log(`   ✅ 985Proxy Response:`);
        for (const { proxyType, data } of inventory) {
          const usRecords = data.filter(r => r.country_code === 'US' || r.country === 'US');
          console.log(`      ${proxyType}: ${usRecords.length} US records, total stock: ${usRecords.reduce((sum, r) => sum + Number(r.stock || 0), 0)}`);
        }
      } else if (provider.providerCode === 'IPIPD') {
        inventory = await fetchIpipdInventory(credential);
        console.log(`   ✅ ipipd Response: ${inventory.length} total US records`);
        if (inventory.length > 0) {
          console.log(`      Sample: ${JSON.stringify(inventory[0], null, 2)}`);
        }
      } else {
        console.log(`   ⚠️  Unknown provider code, skipping`);
        continue;
      }
      
    } catch (error) {
      console.error(`   ❌ Error:`, error.message);
    }
  }
  
  console.log('\n✨ Sync complete');
}

main()
  .catch((error) => {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
