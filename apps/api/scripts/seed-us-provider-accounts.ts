import { prisma } from '@ipeasy/db';
import { encryptAesGcm } from '../src/common/crypto/aes-gcm';

const APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY;
if (!APP_ENCRYPTION_KEY || APP_ENCRYPTION_KEY.length !== 64) {
  throw new Error('APP_ENCRYPTION_KEY must be 64-char hex string');
}

async function main() {
  console.log('🌱 Seeding US provider accounts...\n');

  // Get the site ID
  const site = await prisma.sites.findFirst();
  if (!site) {
    throw new Error('No site found in database');
  }
  console.log(`Using site: ${site.name} (${site.id})\n`);

  // 985Proxy
  const nineEightFiveCredential = {
    apikey: 'yR_7WPGbMxp-eVJfN1dQR2JNeHA0Y2MwMTc2NDk5MDc1MQ==',
    zoneId: '4sd72p1bvlha',
  };
  
  const nineEightFiveCiphertext = encryptAesGcm(
    JSON.stringify(nineEightFiveCredential),
    APP_ENCRYPTION_KEY
  );

  const existing985 = await prisma.provider_accounts.findFirst({
    where: { siteId: site.id, providerCode: 'NINE_EIGHT_FIVE' },
  });

  const provider985 = existing985
    ? await prisma.provider_accounts.update({
        where: { id: existing985.id },
        data: {
          baseUrl: 'https://open-api.985proxy.com',
          credentialEncrypted: nineEightFiveCiphertext,
          status: 'ACTIVE',
        },
      })
    : await prisma.provider_accounts.create({
        data: {
          siteId: site.id,
          providerCode: 'NINE_EIGHT_FIVE',
          baseUrl: 'https://open-api.985proxy.com',
          credentialEncrypted: nineEightFiveCiphertext,
          status: 'ACTIVE',
        },
      });

  console.log('✅ 985Proxy provider account:', provider985.id);

  // ipipd
  const ipipdCredential = {
    appId: 'APP13618B8748',
    appSecret: 'fzEE0vF014A7WfdpCp0pek2ufnRo65E4HN6Ni3rZjitx9sjpNSy0beIyo6UKGbi7',
  };

  const ipipdCiphertext = encryptAesGcm(
    JSON.stringify(ipipdCredential),
    APP_ENCRYPTION_KEY
  );

  const existingIpipd = await prisma.provider_accounts.findFirst({
    where: { siteId: site.id, providerCode: 'IPIPD' },
  });

  const providerIpipd = existingIpipd
    ? await prisma.provider_accounts.update({
        where: { id: existingIpipd.id },
        data: {
          baseUrl: 'https://api.ipipd.cn',
          credentialEncrypted: ipipdCiphertext,
          status: 'ACTIVE',
        },
      })
    : await prisma.provider_accounts.create({
        data: {
          siteId: site.id,
          providerCode: 'IPIPD',
          baseUrl: 'https://api.ipipd.cn',
          credentialEncrypted: ipipdCiphertext,
          status: 'ACTIVE',
        },
      });

  console.log('✅ ipipd provider account:', providerIpipd.id);

  console.log('\n✨ Provider accounts seeded successfully!');
  
  // Verify
  const accounts = await prisma.provider_accounts.findMany({
    where: { siteId: site.id },
    select: { id: true, providerCode: true, baseUrl: true, status: true },
  });
  console.log('\nAll provider accounts:');
  console.table(accounts);
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
