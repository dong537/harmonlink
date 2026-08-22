import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedContext } from '../../common/auth/auth-context';
import { ConfigService } from '../../common/config/config.service';
import { ErrorCode } from '../../common/errors/error-codes';
import { ResStaticController } from '../openapi/res-static.controller';
import { PricingController } from '../pricing/pricing.controller';
import { OrdersController } from './orders.controller';
import { CreateStaticProxyOrderUseCase } from './use-cases/create-static-proxy-order.use-case';

const USER_CONTEXT: AuthenticatedContext = {
  ownerId: 'user-1',
  ownerType: 'USER',
  siteId: 'site-1',
  tenantId: 'tenant-1',
  scopes: [],
  requestId: 'request-1',
};

const ADMIN_CONTEXT: AuthenticatedContext = {
  ...USER_CONTEXT,
  ownerType: 'PLATFORM_ADMIN',
  tenantId: null,
};

const DISABLED_ERROR = {
  code: ErrorCode.PRODUCT_DISABLED,
  reasonKey: 'static_proxy_purchase_disabled',
  httpStatus: 410,
};

function configWith(flag: 'true' | 'false'): ConfigService {
  return { get: () => flag } as unknown as ConfigService;
}

function createUseCase(flag: 'true' | 'false') {
  const quoteUseCase = { execute: vi.fn() };
  const ordersRepo = { findByIdempotencyKeyForUser: vi.fn() };
  const usersRepo = { findOrderContextByIdInSite: vi.fn() };

  const useCase = new CreateStaticProxyOrderUseCase(
    quoteUseCase as never,
    {} as never,
    ordersRepo as never,
    {} as never,
    usersRepo as never,
    configWith(flag),
  );

  return { useCase, quoteUseCase, ordersRepo, usersRepo };
}

function createResStatic(useCase: CreateStaticProxyOrderUseCase, flag: 'true' | 'false') {
  return new ResStaticController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    configWith(flag),
    {} as never,
    useCase,
  );
}

describe('legacy static proxy purchase gate (disabled by default)', () => {
  it('rejects the customer order route with PRODUCT_DISABLED', async () => {
    const { useCase, quoteUseCase, ordersRepo } = createUseCase('false');
    const controller = new OrdersController(useCase, {} as never, {} as never);

    await expect(controller.createStaticProxy(USER_CONTEXT, {} as never)).rejects.toMatchObject(DISABLED_ERROR);
    expect(quoteUseCase.execute).not.toHaveBeenCalled();
    expect(ordersRepo.findByIdempotencyKeyForUser).not.toHaveBeenCalled();
  });

  it('rejects the admin order route with PRODUCT_DISABLED before loading the target user', async () => {
    const { useCase, usersRepo } = createUseCase('false');
    const controller = new OrdersController(useCase, {} as never, {} as never);

    await expect(
      controller.createStaticProxyForUser(ADMIN_CONTEXT, 'user-1', { reason: 'r' } as never),
    ).rejects.toMatchObject(DISABLED_ERROR);
    expect(usersRepo.findOrderContextByIdInSite).not.toHaveBeenCalled();
  });

  it('rejects the OpenAPI buy route before validating the request body', async () => {
    const { useCase, quoteUseCase } = createUseCase('false');

    await expect(createResStatic(useCase, 'false').buy(USER_CONTEXT, {} as never)).rejects.toMatchObject(DISABLED_ERROR);
    expect(quoteUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects the legacy pricing quote route', () => {
    const quoteUseCase = { execute: vi.fn() };
    const controller = new PricingController(
      {} as never,
      {} as never,
      quoteUseCase as never,
      configWith('false'),
    );

    expect(() => controller.quote(USER_CONTEXT, 'resource-1', '30', '1', 'CNY')).toThrowError(
      expect.objectContaining(DISABLED_ERROR),
    );
    expect(quoteUseCase.execute).not.toHaveBeenCalled();
  });
});

describe('legacy static proxy purchase gate (enabled by opt-in flag)', () => {
  it('lets the customer order route reach the legacy use case body', async () => {
    const { useCase, ordersRepo } = createUseCase('true');
    const controller = new OrdersController(useCase, {} as never, {} as never);

    await expect(controller.createStaticProxy(USER_CONTEXT, {} as never)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'idempotency_key_required',
    });
    expect(ordersRepo.findByIdempotencyKeyForUser).not.toHaveBeenCalled();
  });

  it('lets the admin order route reach the target user lookup', async () => {
    const { useCase, usersRepo } = createUseCase('true');
    usersRepo.findOrderContextByIdInSite.mockResolvedValue(null);
    const controller = new OrdersController(useCase, {} as never, {} as never);

    await expect(
      controller.createStaticProxyForUser(ADMIN_CONTEXT, 'user-1', { reason: 'restore' } as never),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, reasonKey: 'user_not_found' });
    expect(usersRepo.findOrderContextByIdInSite).toHaveBeenCalledWith('user-1', 'site-1');
  });

  it('lets the OpenAPI buy route reach request body validation', async () => {
    const { useCase } = createUseCase('true');

    await expect(createResStatic(useCase, 'true').buy(USER_CONTEXT, {} as never)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('lets the pricing quote route reach the quote use case', async () => {
    const quoteUseCase = { execute: vi.fn().mockResolvedValue({ totalPrice: '10' }) };
    const controller = new PricingController(
      {} as never,
      {} as never,
      quoteUseCase as never,
      configWith('true'),
    );

    await expect(controller.quote(USER_CONTEXT, 'resource-1', '30', '1', 'CNY')).resolves.toEqual({
      totalPrice: '10',
    });
    expect(quoteUseCase.execute).toHaveBeenCalledOnce();
  });
});
