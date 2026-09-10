import 'reflect-metadata';

// Loading a Nest module evaluates the shared environment schema. This check
// only inspects decorator metadata and never opens a database connection, so
// use harmless local placeholders when run outside a loaded application.
const metadataEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://127.0.0.1:5432/metadata_check',
  REDIS_URL: 'redis://127.0.0.1:6379',
  APP_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
  JWT_SECRET: 'metadata-check-only',
  APP_PLATFORM_CURRENCY: 'CNY',
};
for (const [key, value] of Object.entries(metadataEnv)) {
  if (!process.env[key]) process.env[key] = value;
}

// 动态导入以确保装饰器被执行
// Metadata is checked from the compiled application, never from generated
// artifacts beside TypeScript source files. Run `pnpm --filter @ipeasy/api
// build` before invoking this script.
const { WalletRepository } = await import('./dist/modules/wallet/wallet.repository.js');
const { ConfirmPaymentOrderUseCase } = await import('./dist/modules/payments/use-cases/confirm-payment-order.use-case.js');

console.log('=== Checking ConfirmPaymentOrderUseCase metadata ===');
const metadata = Reflect.getMetadata('design:paramtypes', ConfirmPaymentOrderUseCase);
console.log('Metadata:', metadata);
console.log('Param count:', metadata?.length);

if (metadata) {
  metadata.forEach((type, index) => {
    console.log(`  [${index}]:`, type?.name || 'undefined');
  });
} else {
  console.log('ERROR: No metadata found!');
}

console.log('\n=== Expected ===');
console.log('  [0]: PaymentsRepository');
console.log('  [1]: WalletRepository');
console.log('  [2]: ConfigService');
