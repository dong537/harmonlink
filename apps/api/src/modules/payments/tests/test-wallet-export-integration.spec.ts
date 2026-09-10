import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AuthGuard } from '../../../common/auth/guards';
import { WalletModule } from '../../wallet/wallet.module';
import { WalletRepository } from '../../wallet/wallet.repository';

const EXPORTED_WALLET_REPOSITORY = Symbol('EXPORTED_WALLET_REPOSITORY');

describe('WalletModule 导出测试', () => {
  let moduleRef: TestingModule;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [WalletModule],
      providers: [
        {
          provide: EXPORTED_WALLET_REPOSITORY,
          inject: [WalletRepository],
          useFactory: (repository: WalletRepository) => repository,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('WalletModule should initialize its guarded controller and export WalletRepository', () => {
    const authGuard = moduleRef.get(AuthGuard, { strict: false });
    const repo = moduleRef.get<WalletRepository>(EXPORTED_WALLET_REPOSITORY);
    expect(authGuard).toBeInstanceOf(AuthGuard);
    expect(repo).toBeInstanceOf(WalletRepository);
  });
});
