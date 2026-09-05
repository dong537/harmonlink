import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { ConfirmPaymentOrderUseCase } from '../use-cases/confirm-payment-order.use-case';
import { WalletRepository } from '../../wallet/wallet.repository';

describe('metadata check', () => {
  it('should have decorator metadata', () => {
    const metadata = Reflect.getMetadata('design:paramtypes', ConfirmPaymentOrderUseCase);
    console.log('Metadata:', metadata);
    if (metadata) {
      console.log('Param types:', metadata.map((t: any) => t?.name));
    }
    expect(metadata).toBeDefined();
    expect(metadata[1]).toBe(WalletRepository);
  });
});
