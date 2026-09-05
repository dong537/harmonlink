import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { WalletRepository } from './src/modules/wallet/wallet.repository';
import { ConfirmPaymentOrderUseCase } from './src/modules/payments/use-cases/confirm-payment-order.use-case';

describe('Metadata test', () => {
  it('should have correct parameter metadata', () => {
    const metadata = Reflect.getMetadata('design:paramtypes', ConfirmPaymentOrderUseCase);
    console.log('Metadata:', metadata);
    console.log('Param count:', metadata?.length);
    if (metadata) {
      metadata.forEach((type: any, index: number) => {
        console.log(`  [${index}]:`, type?.name || 'undefined');
      });
    }
    expect(metadata).toBeDefined();
    expect(metadata?.length).toBe(3);
    expect(metadata[1]).toBe(WalletRepository);
  });
});
