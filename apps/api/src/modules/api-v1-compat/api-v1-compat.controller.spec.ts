import { describe, expect, it, vi } from 'vitest';
import { prisma } from '@ipeasy/db';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { ApiV1CompatController } from './api-v1-compat.controller';

const userContext: AuthenticatedContext = {
  ownerId: 'user-1',
  ownerType: 'USER',
  siteId: 'site-1',
  tenantId: 'tenant-1',
  scopes: [],
  requestId: 'request-1',
};

function createController() {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'LEGACY_API_V1_ENABLED') return 'true';
      if (key === 'LEGACY_API_SITE_ID') return 'site-1';
      return '';
    }),
  };
  const catalog = {
    findSku: vi.fn().mockResolvedValue(null),
    listSaleableSkusForBuyer: vi.fn(),
  };
  const quote = { execute: vi.fn() };
  const createOrder = { execute: vi.fn() };
  const renew = { execute: vi.fn() };
  const login = { executeLegacy: vi.fn() };
  const getMe = { execute: vi.fn() };
  const wallet = {
    getWalletByUserId: vi.fn().mockResolvedValue({ available: { toString: () => '100.00' }, currency: 'CNY' }),
  };
  const resolveZone = { execute: vi.fn().mockResolvedValue(null) };

  const controller = new ApiV1CompatController(
    config as never,
    login as never,
    {} as never,
    {} as never,
    catalog as never,
    quote as never,
    {} as never,
    createOrder as never,
    {} as never,
    renew as never,
    getMe as never,
    wallet as never,
    resolveZone as never,
  );

  return { controller, config, catalog, quote, createOrder, renew, login, getMe, wallet, resolveZone };
}

describe('ApiV1CompatController', () => {
  it.each([undefined, null, []])('rejects a malformed legacy login body with a validation error', async (body) => {
    const { controller, login } = createController();

    await expect(controller.loginUser(body as never)).rejects.toMatchObject({
      httpStatus: 400,
      reasonKey: 'login_body_invalid',
    });
    expect(login.executeLegacy).not.toHaveBeenCalled();
  });

  it('allows an admin through regular legacy login and maps the role for the frozen client', async () => {
    const { controller, login } = createController();
    login.executeLegacy.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'rt_refresh-token',
      expiresAt: new Date('2026-09-07T00:00:00.000Z'),
      identity: {
        ownerType: 'ADMIN_USER',
        ownerId: 'admin-1',
        siteId: 'site-1',
        tenantId: null,
        email: 'admin@example.com',
        name: null,
        role: 'platform_admin',
      },
    });

    const result = await controller.loginUser({ email: 'admin@example.com', password: 'secret' });

    expect(login.executeLegacy).toHaveBeenCalledWith(
      { email: 'admin@example.com', password: 'secret', siteId: 'site-1' },
    );
    expect(result).toEqual({
      access_token: 'access-token',
      refresh_token: 'rt_refresh-token',
      user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    });
  });

  it('returns a scoped admin profile instead of applying the user-only profile guard', async () => {
    const { controller, getMe, wallet } = createController();
    const findAdmin = vi.spyOn(prisma.admin_users, 'findFirst').mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    } as never);

    const result = await controller.profile({
      ...userContext,
      ownerId: 'admin-1',
      ownerType: 'PLATFORM_ADMIN',
      tenantId: null,
    });

    expect(findAdmin).toHaveBeenCalledWith({
      where: { id: 'admin-1', siteId: 'site-1' },
      select: { id: true, email: true, role: true, status: true },
    });
    expect(getMe.execute).not.toHaveBeenCalled();
    expect(wallet.getWalletByUserId).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'admin@example.com',
      role: 'admin',
      balance: '0',
    });
    findAdmin.mockRestore();
  });

  it('keeps the dedicated admin-login owner restriction', async () => {
    const { controller, login } = createController();
    login.executeLegacy.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'rt_refresh-token',
      expiresAt: new Date('2026-09-07T00:00:00.000Z'),
      identity: {
        ownerType: 'ADMIN_USER',
        ownerId: 'admin-1',
        siteId: 'site-1',
        tenantId: null,
        email: 'admin@example.com',
        name: null,
        role: 'platform_admin',
      },
    });

    await controller.loginAdmin({ email: 'admin@example.com', password: 'secret' });

    expect(login.executeLegacy).toHaveBeenCalledWith(
      { email: 'admin@example.com', password: 'secret', siteId: 'site-1' },
      'ADMIN_USER',
    );
  });

  it('quotes through the canonical catalog use case with authenticated buyer scope', async () => {
    const { controller, quote, resolveZone } = createController();
    quote.execute.mockResolvedValue({
      skuCode: 'SV',
      durationDays: 30,
      unitPrice: '100.00',
      totalPrice: '100.00',
      currency: 'CNY',
    });

    const result = await controller.dedicatedPreview(userContext, {
      skuCode: 'sv',
      durationDays: 30,
      country: 'hk',
      protocol: 'vless',
      zoneCode: 'short-video',
    });

    expect(resolveZone.execute).toHaveBeenCalledWith(
      { siteId: 'site-1', tenantId: 'tenant-1', userId: 'user-1' },
      'short-video',
    );
    expect(quote.execute).toHaveBeenCalledWith({
      siteId: 'site-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      skuCode: 'SV',
      durationDays: 30,
      quantity: 1,
      currency: 'CNY',
    });
    expect(result).toMatchObject({ chargeAmount: '100.00', finalPrice: '100.00', currency: 'CNY' });
  });

  it('maps legacy purchase input into the canonical order use case without bypassing it', async () => {
    const { controller, createOrder } = createController();
    createOrder.execute.mockResolvedValue({
      status: 'QUEUED',
      orderId: 'order-1',
      reservationId: 'reservation-1',
      jobId: 'job-1',
      skuCode: 'ZB',
      countryCode: 'HK',
      quantity: 1,
      replayed: false,
    });

    const result = await controller.dedicatedPurchase(userContext, {
      skuCode: 'zb',
      durationDays: 60,
      country: 'hk',
      protocol: 'vmess',
      zoneCode: 'short-video',
    }, 'request-idempotency-key');

    expect(createOrder.execute).toHaveBeenCalledWith(userContext, {
      skuCode: 'ZB',
      countryCode: 'HK',
      quantity: 1,
      durationDays: 60,
      currency: 'CNY',
      idempotencyKey: 'request-idempotency-key',
      zoneCode: 'short-video',
    });
    expect(result).toMatchObject({
      status: 'reserved',
      pending: true,
      proxyId: 'order-1',
      orderNo: 'order-1',
    });
  });

  it('passes an empty preview zoneCode through for canonical validation', async () => {
    const { controller, quote, resolveZone } = createController();
    quote.execute.mockResolvedValue({
      skuCode: 'SV',
      durationDays: 30,
      unitPrice: '100.00',
      totalPrice: '100.00',
      currency: 'CNY',
    });
    resolveZone.execute.mockRejectedValue(new AppError(ErrorCode.VALIDATION_ERROR, 'zone_code_invalid', 400));

    await expect(controller.dedicatedPreview(userContext, {
      skuCode: 'sv',
      durationDays: 30,
      country: 'hk',
      zoneCode: '',
    })).rejects.toMatchObject({ reasonKey: 'zone_code_invalid' });
    expect(resolveZone.execute).toHaveBeenCalledWith(
      { siteId: 'site-1', tenantId: 'tenant-1', userId: 'user-1' },
      '',
    );
  });

  it('passes an empty purchase zoneCode to the canonical order use case', async () => {
    const { controller, createOrder } = createController();
    createOrder.execute.mockRejectedValue(new AppError(ErrorCode.VALIDATION_ERROR, 'zone_code_invalid', 400));

    await expect(controller.dedicatedPurchase(userContext, {
      skuCode: 'zb',
      durationDays: 60,
      country: 'hk',
      zoneCode: '',
    }, 'request-idempotency-key')).rejects.toMatchObject({ reasonKey: 'zone_code_invalid' });
    expect(createOrder.execute).toHaveBeenCalledWith(userContext, expect.objectContaining({ zoneCode: '' }));
  });

  it('passes an empty renewal zoneCode to the canonical renewal use case', async () => {
    const { controller, renew } = createController();
    const findLine = vi.spyOn(prisma.dedicated_lines, 'findFirst').mockResolvedValue({ id: 'line-1' } as never);
    renew.execute.mockRejectedValue(new AppError(ErrorCode.VALIDATION_ERROR, 'zone_code_invalid', 400));

    try {
      await expect(controller.dedicatedRenew(userContext, '1', {
        durationDays: 30,
        zoneCode: '',
      })).rejects.toMatchObject({ reasonKey: 'zone_code_invalid' });
      expect(renew.execute).toHaveBeenCalledWith(userContext, 'line-1', expect.objectContaining({ zoneCode: '' }));
    } finally {
      findLine.mockRestore();
    }
  });

  it.each([123, {}])('rejects a non-string purchase zoneCode instead of silently dropping %j', async (zoneCode) => {
    const { controller, createOrder } = createController();

    await expect(controller.dedicatedPurchase(userContext, {
      skuCode: 'zb',
      durationDays: 60,
      country: 'hk',
      zoneCode,
    } as never, 'request-idempotency-key')).rejects.toMatchObject({
      httpStatus: 400,
      reasonKey: 'zone_code_invalid',
    });
    expect(createOrder.execute).not.toHaveBeenCalled();
  });

  it.each([' 1', '01', '1e3', '+1', '1.0', '9007199254740992'])(
    'rejects non-canonical legacy line ID %j before resolving a line',
    async (legacyId) => {
      const { controller, renew } = createController();

      await expect(controller.dedicatedRenew(userContext, legacyId, { durationDays: 30 }))
        .rejects.toMatchObject({
          httpStatus: 400,
          reasonKey: 'dedicated_line_id_invalid',
        });
      expect(renew.execute).not.toHaveBeenCalled();
    },
  );

  it('rejects an authenticated context from a different configured site', async () => {
    const { controller, catalog } = createController();

    await expect(controller.dedicatedSkus({ ...userContext, siteId: 'site-2' })).rejects.toMatchObject({
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    });
    expect(catalog.listSaleableSkusForBuyer).not.toHaveBeenCalled();
  });

  it('rejects a disabled compatibility surface before reading dedicated resources', async () => {
    const { controller, config, catalog } = createController();
    config.get.mockImplementation((key: string) => (key === 'LEGACY_API_V1_ENABLED' ? 'false' : 'site-1') as never);

    await expect(controller.dedicatedSkus(userContext)).rejects.toMatchObject({
      httpStatus: 404,
      reasonKey: 'legacy_api_disabled',
    });
    expect(catalog.listSaleableSkusForBuyer).not.toHaveBeenCalled();
  });

  it('reports missing fixed-site configuration before invoking authenticated use cases', async () => {
    const { controller, config, catalog } = createController();
    config.get.mockImplementation((key: string) => (key === 'LEGACY_API_V1_ENABLED' ? 'true' : undefined) as never);

    await expect(controller.dedicatedSkus(userContext)).rejects.toMatchObject({
      httpStatus: 500,
      reasonKey: 'legacy_api_site_not_configured',
    });
    expect(catalog.listSaleableSkusForBuyer).not.toHaveBeenCalled();
  });

  it('checks the fixed site before reporting an unsupported authenticated capability', async () => {
    const { controller } = createController();

    expect(() => controller.lock({ ...userContext, siteId: 'site-2' })).toThrow(
      expect.objectContaining({
        httpStatus: 403,
        reasonKey: 'legacy_api_site_mismatch',
      }),
    );
  });
});
