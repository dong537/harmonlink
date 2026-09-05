import 'reflect-metadata';

// 动态导入以确保装饰器被执行
const { WalletRepository } = await import('./src/modules/wallet/wallet.repository.js');
const { ConfirmPaymentOrderUseCase } = await import('./src/modules/payments/use-cases/confirm-payment-order.use-case.js');

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
