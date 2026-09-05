import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PaymentsModule } from '../payments.module';
import { WalletModule } from '../../wallet/wallet.module';
import { AuthModule } from '../../auth/auth.module';
import { WalletRepository } from '../../wallet/wallet.repository';
import { ConfirmPaymentOrderUseCase } from '../use-cases/confirm-payment-order.use-case';

describe('PaymentsModule DI 集成测试', () => {
  let moduleRef: any;
  let app: any;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AuthModule, WalletModule, PaymentsModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should resolve ConfirmPaymentOrderUseCase', () => {
    const useCase = moduleRef.get(ConfirmPaymentOrderUseCase, { strict: false });
    expect(useCase).toBeDefined();
    expect(useCase.constructor.name).toBe('ConfirmPaymentOrderUseCase');
  });

  it('should resolve WalletRepository via PaymentsModule', () => {
    const repo = moduleRef.get(WalletRepository, { strict: false });
    expect(repo).toBeDefined();
    expect(repo.constructor.name).toBe('WalletRepository');
  });
});
