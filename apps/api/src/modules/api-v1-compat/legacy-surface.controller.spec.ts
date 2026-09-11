import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { LegacySurfaceController } from './legacy-surface.controller';

const userContext: AuthenticatedContext = {
  ownerId: 'user-1',
  ownerType: 'USER',
  siteId: 'site-1',
  tenantId: 'tenant-1',
  scopes: [],
  requestId: 'request-1',
};

const tenantAdminContext: AuthenticatedContext = {
  ...userContext,
  ownerId: 'admin-1',
  ownerType: 'TENANT_ADMIN',
};

function createController() {
  const config = {
    get: vi.fn((key: string): unknown => {
      if (key === 'LEGACY_API_V1_ENABLED') return 'true';
      if (key === 'LEGACY_API_SITE_ID') return 'site-1';
      if (key === 'APP_PLATFORM_CURRENCY') return 'CNY';
      return '';
    }),
  };
  const createPayment = { execute: vi.fn() };
  const confirmPayment = { execute: vi.fn() };
  const payments = { getPaymentOrderById: vi.fn(), listPaymentOrders: vi.fn() };
  const listApiKeys = { execute: vi.fn() };
  const wallet = { getWalletByUserId: vi.fn(), listLedgerEntries: vi.fn() };
  const delivery = { count: vi.fn() };

  const controller = new LegacySurfaceController(
    config as never,
    createPayment as never,
    confirmPayment as never,
    payments as never,
    listApiKeys as never,
    wallet as never,
    delivery as never,
  );

  return { controller, config, createPayment, confirmPayment, payments, listApiKeys, wallet, delivery };
}

describe('LegacySurfaceController', () => {
  it.each([
    ['settings', (controller: LegacySurfaceController) => controller.settings()],
    ['admin dashboard', (controller: LegacySurfaceController) => controller.dashboardAdminPendingTasks(userContext)],
    ['api apps', (controller: LegacySurfaceController) => controller.listApiApps(userContext)],
    ['referral', (controller: LegacySurfaceController) => controller.referralMine(userContext)],
  ])('returns a typed unsupported error for the unavailable %s surface', async (_name, invoke) => {
    const { controller } = createController();

    await expect(Promise.resolve().then(() => invoke(controller))).rejects.toMatchObject({
      httpStatus: 501,
      reasonKey: 'legacy_capability_unavailable',
    });
  });

  it('projects a strictly scoped dedicated-line count into the frozen dashboard shape', async () => {
    const { controller, delivery } = createController();
    delivery.count.mockResolvedValue(3);

    await expect(controller.dashboardOverview(userContext)).resolves.toEqual({
      proxies: { dc: 3, residential: 0, mobile: 0, total: 3 },
    });
    expect(delivery.count).toHaveBeenCalledWith(userContext);
  });

  it('does not turn a canonical dashboard count failure into fabricated zeroes', async () => {
    const { controller, delivery } = createController();
    const failure = new Error('database unavailable');
    delivery.count.mockRejectedValue(failure);

    await expect(controller.dashboardOverview(userContext)).rejects.toBe(failure);
  });

  it('checks the fixed site before querying the authenticated dashboard scope', async () => {
    const { controller } = createController();

    await expect(controller.dashboardOverview({ ...userContext, siteId: 'site-2' })).rejects.toMatchObject({
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    });
  });

  it('projects the canonical API key list without exposing hashes or plain keys', async () => {
    const { controller, listApiKeys } = createController();
    listApiKeys.execute.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [
        {
          id: 'key-1',
          name: 'active',
          keyPrefix: 'abcd1234',
          scopes: [],
          ipWhitelist: [],
          status: 'ACTIVE',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          lastUsedAt: null,
          revokedAt: null,
        },
        {
          id: 'key-2',
          name: 'revoked',
          keyPrefix: 'revoked',
          scopes: [],
          ipWhitelist: [],
          status: 'REVOKED',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          lastUsedAt: null,
          revokedAt: new Date('2026-09-02T00:00:00.000Z'),
        },
      ],
    });

    const result = await controller.getApiKey(userContext);

    expect(listApiKeys.execute).toHaveBeenCalledWith(userContext, { page: 1, pageSize: 20 });
    expect(result).toEqual({
      hasKey: true,
      prefix: 'abcd1234',
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(result).not.toHaveProperty('keyHash');
    expect(result).not.toHaveProperty('plainKey');
  });

  it('creates a manual billing recharge through the canonical payment order use case', async () => {
    const { controller, createPayment } = createController();
    createPayment.execute.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      amount: '50.00',
      currency: 'CNY',
      channel: 'MANUAL',
      status: 'PENDING',
      idempotencyKey: 'legacy-key',
      confirmedBy: null,
      confirmedAt: null,
      failReason: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    const result = await controller.createRecharge(userContext, { amount: 50, method: 'alipay', remark: 'bank ref' }, 'legacy-key');

    expect(createPayment.execute).toHaveBeenCalledWith(userContext, {
      amount: '50',
      currency: 'CNY',
      channel: 'MANUAL',
      idempotencyKey: 'legacy-key',
    });
    expect(result).toMatchObject({ id: 'payment-1', orderNo: 'payment-1', amount: 50, status: 'pending' });
  });

  it('does not fabricate an online payment URL', async () => {
    const { controller, createPayment } = createController();

    await expect(controller.initiatePayment(userContext, {
      amount: 50,
      type: 'alipay',
      gateway: 'yipay',
    })).rejects.toMatchObject({
      httpStatus: 501,
      reasonKey: 'legacy_online_payment_unavailable',
    });
    expect(createPayment.execute).not.toHaveBeenCalled();
  });

  it('confirms an approved recharge through the canonical confirmation use case', async () => {
    const { controller, confirmPayment } = createController();
    confirmPayment.execute.mockResolvedValue({
      order: {
        id: 'payment-1',
        userId: 'user-1',
        amount: '50.00',
        currency: 'CNY',
        channel: 'MANUAL',
        status: 'COMPLETED',
        idempotencyKey: 'legacy-key',
        confirmedBy: 'admin-1',
        confirmedAt: new Date('2026-09-02T00:00:00.000Z'),
        failReason: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      },
      wallet: { available: '50.00', currency: 'CNY' },
    });

    const result = await controller.approveRecharge(
      { ...userContext, ownerType: 'TENANT_ADMIN' },
      'payment-1',
      { approved: true, remark: 'checked' },
    );

    expect(confirmPayment.execute).toHaveBeenCalledWith(
      { ...userContext, ownerType: 'TENANT_ADMIN' },
      'payment-1',
      { reason: 'checked' },
    );
    expect(result).toMatchObject({ id: 'payment-1', status: 'approved' });
  });

  it('maps scoped payment orders into the legacy recharge page shape', async () => {
    const { controller, payments } = createController();
    payments.listPaymentOrders.mockResolvedValue({
      page: 2,
      pageSize: 10,
      total: 1,
      items: [{
        id: 'payment-1',
        userId: 'user-1',
        amount: { toString: () => '50.00' },
        currency: 'CNY',
        channel: 'MANUAL',
        status: 'PENDING',
        idempotencyKey: 'key',
        confirmedBy: null,
        confirmedAt: null,
        failReason: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        user: { id: 'user-1', email: 'user@example.com', name: null, phone: null, status: 'ACTIVE' },
      }],
    });

    const result = await controller.listRecharges(userContext, { page: '2', limit: '10' });

    expect(payments.listPaymentOrders).toHaveBeenCalledWith('site-1', 'tenant-1', expect.objectContaining({
      page: 2,
      pageSize: 10,
      userId: 'user-1',
    }));
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 1 });
    expect(result.data[0]).toMatchObject({ id: 'payment-1', orderNo: 'payment-1', method: 'manual', status: 'pending', amount: 50 });
  });

  it('passes the admin email filter through to the scoped payment repository', async () => {
    const { controller, payments } = createController();
    payments.listPaymentOrders.mockResolvedValue({ page: 1, pageSize: 20, total: 0, items: [] });

    await controller.listAdminRecharges(tenantAdminContext, {
      email: 'customer@example.com',
      status: 'pending',
    });

    expect(payments.listPaymentOrders).toHaveBeenCalledWith('site-1', 'tenant-1', expect.objectContaining({
      email: 'customer@example.com',
      status: 'PENDING',
    }));
  });

  it.each(['wechat', 'usdt', 'usd'])('rejects unsupported legacy payment method filter %s', async (method) => {
    const { controller, payments } = createController();

    await expect(controller.listAdminRecharges(tenantAdminContext, { method })).rejects.toMatchObject({
      httpStatus: 501,
      reasonKey: 'legacy_payment_method_unavailable',
    });
    expect(payments.listPaymentOrders).not.toHaveBeenCalled();
  });

  it('maps wallet ledger entries with a scoped wallet lookup', async () => {
    const { controller, wallet } = createController();
    wallet.getWalletByUserId.mockResolvedValue({ id: 'wallet-1', available: '100.00', currency: 'CNY' });
    wallet.listLedgerEntries.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{
        id: 'ledger-1',
        type: 'DEPOSIT',
        amount: { toString: () => '50.00' },
        balanceAfter: { toString: () => '100.00' },
        currency: 'CNY',
        relatedId: 'payment-1',
        reason: 'payment_order_confirmed',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      }],
    });

    const result = await controller.listTransactions(userContext, { page: '1', limit: '20' });

    expect(wallet.getWalletByUserId).toHaveBeenCalledWith('user-1', 'site-1', 'tenant-1');
    expect(wallet.listLedgerEntries).toHaveBeenCalledWith('wallet-1', 'tenant-1', expect.objectContaining({ page: 1, pageSize: 20 }));
    expect(result.data[0]).toMatchObject({ transactionNo: 'payment-1', type: 'recharge', amount: 50, balanceAfter: 100, balanceBefore: 50 });
  });
});
