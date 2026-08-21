// 生成环境变量的密钥
const crypto = require('crypto');

console.log('🔐 生成安全密钥...\n');
console.log('APP_ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('base64'));
console.log('JWT_SECRET=' + crypto.randomBytes(64).toString('hex'));
console.log('SESSION_SECRET=' + crypto.randomBytes(32).toString('hex'));
console.log('\n✅ 密钥生成完成！');
