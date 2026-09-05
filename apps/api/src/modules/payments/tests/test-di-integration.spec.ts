import { Test } from '@nestjs/testing';
import { describe, it, expect } from 'vitest';
import { PaymentsModule } from '../payments.module';
import { WalletModule } from '../../wallet/wallet.module';
import { WalletRepository } from '../../wallet/wallet.repository';

describe('DI 测试', () => {
  it('should resolve WalletRepository in PaymentsModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PaymentsModule, WalletModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    
    const repo = moduleRef.get(WalletRepository, { strict: false });
    expect(repo).toBeDefined();
    
    await app.close();
  });
});
