import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WalletModule } from '../../wallet/wallet.module';
import { WalletRepository } from '../../wallet/wallet.repository';

describe('WalletModule 导出测试', () => {
  let moduleRef: any;
  let app: any;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [WalletModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('WalletRepository should be available from WalletModule', () => {
    const repo = moduleRef.get(WalletRepository, { strict: false });
    expect(repo).toBeDefined();
    expect(repo.constructor.name).toBe('WalletRepository');
  });
});
