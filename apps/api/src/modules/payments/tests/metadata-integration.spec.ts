import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { ConfirmPaymentOrderUseCase } from '../use-cases/confirm-payment-order.use-case';
import { WalletRepository } from '../../wallet/wallet.repository';

describe('metadata check', () => {
  it('should have decorator metadata', () => {
    const metadata = Reflect.getMetadata('design:paramtypes', ConfirmPaymentOrderUseCase);
    console.info('Metadata:', metadata);
    if (metadata) {
      const paramTypes = metadata as unknown[];
      console.info(
        'Param types:',
        paramTypes.map((type) => (typeof type === 'function' ? type.name : undefined)),
      );
    }
    expect(metadata).toBeDefined();
    expect(metadata[1]).toBe(WalletRepository);
  });
});
