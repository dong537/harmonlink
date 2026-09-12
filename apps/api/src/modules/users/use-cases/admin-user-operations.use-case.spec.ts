import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AuthenticatedContext } from '../../../common/auth/auth-context';

const db = vi.hoisted(() => ({
  users: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  sessions: {
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  audit_logs: { create: vi.fn() },
  orders: { count: vi.fn() },
  proxy_instances: { count: vi.fn() },
  payment_orders: { count: vi.fn() },
  tickets: { count: vi.fn() },
  dedicated_line_orders: { count: vi.fn() },
  dedicated_lines: { count: vi.fn() },
  stock_reservations: { count: vi.fn() },
  user_zones: { count: vi.fn() },
  external_jobs: { count: vi.fn() },
  line_placement_policies: { count: vi.fn() },
  dedicated_line_placements: { count: vi.fn() },
  dedicated_line_placement_nodes: { count: vi.fn() },
  dedicated_line_projections: { count: vi.fn() },
  dedicated_line_exit_assignments: { count: vi.fn() },
  delivery_routes: { count: vi.fn() },
  dedicated_line_domain_binding_operations: { count: vi.fn() },
  dedicated_line_migrations: { count: vi.fn() },
  dedicated_line_smoke_observations: { count: vi.fn() },
  dedicated_line_migration_recommendations: { count: vi.fn() },
  exit_health_observations: { count: vi.fn() },
  outbox_events: { count: vi.fn() },
  tenants: { count: vi.fn() },
  notifications: { deleteMany: vi.fn() },
  ledger_entries: { count: vi.fn(), deleteMany: vi.fn() },
  wallets: { findUnique: vi.fn(), delete: vi.fn() },
  api_keys: { deleteMany: vi.fn() },
  user_price_bindings: { deleteMany: vi.fn() },
  user_resource_price_overrides: { deleteMany: vi.fn() },
  user_sku_price_overrides: { deleteMany: vi.fn() },
  transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)),
}));

vi.mock('@ipeasy/db', () => ({ prisma: { ...db, $transaction: db.transaction } }));

const bcryptMock = vi.hoisted(() => ({ hash: vi.fn() }));
vi.mock('bcryptjs', () => bcryptMock);

import { AdminUserOperationsUseCase } from './admin-user-operations.use-case';

function ctx(overrides: Partial<AuthenticatedContext> = {}): AuthenticatedContext {
  return {
    ownerId: 'admin-1',
    ownerType: 'PLATFORM_ADMIN',
    siteId: 'site-1',
    tenantId: null,
    scopes: [],
    requestId: 'request-1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.users.findFirst.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1', status: 'ACTIVE' });
  db.users.updateMany.mockResolvedValue({ count: 1 });
  db.users.delete.mockResolvedValue({ id: 'user-1' });
  db.sessions.updateMany.mockResolvedValue({ count: 1 });
  db.sessions.deleteMany.mockResolvedValue({ count: 0 });
  db.audit_logs.create.mockResolvedValue({ id: 'audit-1' });
  db.orders.count.mockResolvedValue(0);
  db.proxy_instances.count.mockResolvedValue(0);
  db.payment_orders.count.mockResolvedValue(0);
  db.tickets.count.mockResolvedValue(0);
  db.dedicated_line_orders.count.mockResolvedValue(0);
  db.dedicated_lines.count.mockResolvedValue(0);
  db.stock_reservations.count.mockResolvedValue(0);
  db.user_zones.count.mockResolvedValue(0);
  db.external_jobs.count.mockResolvedValue(0);
  db.line_placement_policies.count.mockResolvedValue(0);
  db.dedicated_line_placements.count.mockResolvedValue(0);
  db.dedicated_line_placement_nodes.count.mockResolvedValue(0);
  db.dedicated_line_projections.count.mockResolvedValue(0);
  db.dedicated_line_exit_assignments.count.mockResolvedValue(0);
  db.delivery_routes.count.mockResolvedValue(0);
  db.dedicated_line_domain_binding_operations.count.mockResolvedValue(0);
  db.dedicated_line_migrations.count.mockResolvedValue(0);
  db.dedicated_line_smoke_observations.count.mockResolvedValue(0);
  db.dedicated_line_migration_recommendations.count.mockResolvedValue(0);
  db.exit_health_observations.count.mockResolvedValue(0);
  db.outbox_events.count.mockResolvedValue(0);
  db.tenants.count.mockResolvedValue(0);
  db.notifications.deleteMany.mockResolvedValue({ count: 0 });
  db.ledger_entries.count.mockResolvedValue(0);
  db.ledger_entries.deleteMany.mockResolvedValue({ count: 0 });
  db.wallets.findUnique.mockResolvedValue({ id: 'wallet-1', available: decimal('0'), frozen: decimal('0') });
  db.wallets.delete.mockResolvedValue({ id: 'wallet-1' });
  db.api_keys.deleteMany.mockResolvedValue({ count: 0 });
  db.user_price_bindings.deleteMany.mockResolvedValue({ count: 0 });
  db.user_resource_price_overrides.deleteMany.mockResolvedValue({ count: 0 });
  db.user_sku_price_overrides.deleteMany.mockResolvedValue({ count: 0 });
  bcryptMock.hash.mockResolvedValue('hashed-password');
});

describe('AdminUserOperationsUseCase', () => {
  it('updates a scoped user status, revokes sessions, and audits the transition', async () => {
    const result = await new AdminUserOperationsUseCase().updateStatus(ctx(), 'user-1', { status: 'SUSPENDED' });

    expect(result).toEqual({ id: 'user-1', status: 'SUSPENDED' });
    expect(db.users.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', siteId: 'site-1' },
      select: { id: true, tenantId: true, status: true },
    });
    expect(db.sessions.updateMany).toHaveBeenCalledWith({
      where: { ownerType: 'USER', ownerId: 'user-1', siteId: 'site-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'admin-1',
        targetId: 'user-1',
        action: 'users.update_status',
        requestId: 'request-1',
        meta: { from: 'ACTIVE', to: 'SUSPENDED' },
      }),
    });
  });

  it('rejects an invalid status before opening a transaction', async () => {
    await expect(new AdminUserOperationsUseCase().updateStatus(ctx(), 'user-1', { status: 'DELETED' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'user_status_invalid',
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('resets a scoped user password, revokes sessions, and audits the change', async () => {
    const result = await new AdminUserOperationsUseCase().resetPassword(ctx(), 'user-1', { password: 'new-pass-123' });

    expect(result).toEqual({ id: 'user-1' });
    expect(bcryptMock.hash).toHaveBeenCalledWith('new-pass-123', 10);
    expect(db.users.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', siteId: 'site-1' },
      data: { passwordHash: 'hashed-password' },
    });
    expect(db.sessions.updateMany).toHaveBeenCalledWith({
      where: { ownerType: 'USER', ownerId: 'user-1', siteId: 'site-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'users.reset_password', targetId: 'user-1' }),
    });
  });

  it('rejects a short reset password without hashing or mutating state', async () => {
    await expect(new AdminUserOperationsUseCase().resetPassword(ctx(), 'user-1', { password: 'short' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'password_too_weak',
    });
    expect(bcryptMock.hash).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects deletion when business records exist', async () => {
    db.orders.count.mockResolvedValue(1);

    await expect(new AdminUserOperationsUseCase().delete(ctx(), 'user-1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'user_has_business_records',
    });
    expect(db.users.delete).not.toHaveBeenCalled();
    expect(db.audit_logs.create).not.toHaveBeenCalled();
  });

  it('rejects deletion when dedicated-line business records exist', async () => {
    db.dedicated_line_orders.count.mockResolvedValue(1);

    await expect(new AdminUserOperationsUseCase().delete(ctx(), 'user-1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'user_has_business_records',
    });
    expect(db.users.delete).not.toHaveBeenCalled();
    expect(db.audit_logs.create).not.toHaveBeenCalled();
  });

  it('rejects deletion when a wallet still has funds even without ledger rows', async () => {
    db.wallets.findUnique.mockResolvedValue({ id: 'wallet-1', available: decimal('25'), frozen: decimal('0') });

    await expect(new AdminUserOperationsUseCase().delete(ctx(), 'user-1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'user_has_business_records',
      httpStatus: 422,
    });
    expect(db.users.delete).not.toHaveBeenCalled();
    expect(db.wallets.delete).not.toHaveBeenCalled();
    expect(db.audit_logs.create).not.toHaveBeenCalled();
  });

  it('rejects deletion when the user owns a reseller tenant', async () => {
    db.tenants.count.mockResolvedValue(1);

    await expect(new AdminUserOperationsUseCase().delete(ctx(), 'user-1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'user_has_business_records',
      httpStatus: 422,
    });
    expect(db.tenants.count).toHaveBeenCalledWith({ where: { ownerUserId: 'user-1' } });
    expect(db.users.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty scoped user and records the deletion audit', async () => {
    const result = await new AdminUserOperationsUseCase().delete(ctx({ ownerType: 'TENANT_ADMIN', tenantId: 'tenant-1' }), 'user-1');

    expect(result).toEqual({ id: 'user-1' });
    expect(db.users.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', siteId: 'site-1', tenantId: 'tenant-1' },
      select: { id: true, tenantId: true, status: true },
    });
    expect(db.wallets.delete).toHaveBeenCalledWith({ where: { id: 'wallet-1' } });
    expect(db.users.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(db.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'users.delete', targetId: 'user-1', tenantId: 'tenant-1' }),
    });
  });
});

function decimal(value: string) {
  return { toString: () => value };
}
