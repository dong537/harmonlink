import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { LegacyCustomerResourcesController } from './legacy-customer-resources.controller';

const userContext: AuthenticatedContext = {
  ownerId: 'user-1',
  ownerType: 'USER',
  siteId: 'site-1',
  tenantId: 'tenant-1',
  scopes: [],
  requestId: 'request-1',
};

function createController() {
  const config = { get: vi.fn((key: string): unknown => key === 'LEGACY_API_V1_ENABLED' ? 'true' : 'site-1') };
  const orders = { list: vi.fn(), listForAdmin: vi.fn() };
  const notifications = { listForOwner: vi.fn(), countUnread: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() };
  const ticketsRepository = {
    resolveOwnedLegacyId: vi.fn().mockResolvedValue('ticket-1'),
    resolveLegacyIdForScope: vi.fn().mockResolvedValue('ticket-1'),
    mapLegacyIdsForOwner: vi.fn().mockResolvedValue(new Map([['ticket-1', 17]])),
  };
  const createTicket = { execute: vi.fn() };
  const listTickets = { execute: vi.fn() };
  const getTicket = { execute: vi.fn() };
  const replyTicket = { execute: vi.fn() };
  const closeTicket = { execute: vi.fn() };
  const listAdminTickets = { execute: vi.fn() };
  const getAdminTicket = { execute: vi.fn() };
  const replyAdminTicket = { execute: vi.fn() };
  const updateAdminTicketStatus = { execute: vi.fn() };

  const controller = new LegacyCustomerResourcesController(
    config as never,
    orders as never,
    notifications as never,
    ticketsRepository as never,
    createTicket as never,
    listTickets as never,
    getTicket as never,
    replyTicket as never,
    closeTicket as never,
    listAdminTickets as never,
    getAdminTicket as never,
    replyAdminTicket as never,
    updateAdminTicketStatus as never,
  );

  return {
    controller,
    config,
    orders,
    notifications,
    ticketsRepository,
    createTicket,
    listTickets,
    listAdminTickets,
    getTicket,
    replyTicket,
    closeTicket,
  };
}

describe('LegacyCustomerResourcesController', () => {
  it('maps the canonical order page into the frozen frontend data/total shape', async () => {
    const { controller, orders } = createController();
    orders.list.mockResolvedValue({
      page: 2,
      pageSize: 10,
      total: 1,
      items: [{
        id: 'order-1',
        type: 'STATIC_PROXY_BUY',
        status: 'PENDING',
        quantity: 2,
        durationDays: 30,
        unitPrice: '3.50',
        totalPrice: '7.00',
        currency: 'CNY',
        failReason: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:01:00.000Z'),
        userId: 'user-1',
        siteId: 'site-1',
        tenantId: 'tenant-1',
        resourceId: 'resource-1',
        paymentOrderId: null,
        idempotencyKey: 'idem-1',
        quoteSnapshot: { businessType: 'SV' },
      }],
    });

    const result = await controller.listOrders(userContext, { page: '2', limit: '10', status: 'pending' });

    expect(orders.list).toHaveBeenCalledWith('site-1', 'user-1', 'tenant-1', expect.objectContaining({ page: 2, pageSize: 10, status: 'PENDING' }));
    expect(result).toMatchObject({ page: 2, limit: 10, total: 1 });
    expect(result.data[0]).toMatchObject({ orderNo: 'order-1', type: 'static_proxy', status: 'pending', amount: 7 });
  });

  it('maps notifications to the legacy read/content fields and translates read filters', async () => {
    const { controller, notifications } = createController();
    notifications.listForOwner.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{
        id: 'notification-1',
        type: 'ticket_reply',
        title: 'Ticket',
        body: 'Reply',
        relatedType: 'ticket',
        relatedId: 'ticket-1',
        readAt: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      }],
    });

    const result = await controller.listNotifications(userContext, { page: '1', limit: '20', read: 'false' });

    expect(notifications.listForOwner).toHaveBeenCalledWith(
      { userId: 'user-1', siteId: 'site-1', tenantId: 'tenant-1' },
      expect.objectContaining({ page: 1, pageSize: 20, unreadOnly: true }),
    );
    expect(result.data[0]).toMatchObject({ id: 'notification-1', content: 'Reply', read: false, data: { ticketId: 17 } });
  });

  it('rejects a valid credential from a different fixed-site context before reading resources', async () => {
    const { controller, orders } = createController();

    await expect(controller.listOrders({ ...userContext, siteId: 'site-2' }, {})).rejects.toMatchObject({
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    });
    expect(orders.list).not.toHaveBeenCalled();
  });

  it('rejects a tenant admin without tenant context on the customer order route', async () => {
    const { controller, orders } = createController();

    await expect(controller.listOrders({ ...userContext, ownerType: 'TENANT_ADMIN', tenantId: null }, {}))
      .rejects.toMatchObject({ httpStatus: 403, reasonKey: 'tenant_context_required' });
    expect(orders.listForAdmin).not.toHaveBeenCalled();
  });

  it('rejects a tenant admin without tenant context on the admin order route', async () => {
    const { controller, orders } = createController();

    await expect(controller.listAdminOrders({ ...userContext, ownerType: 'TENANT_ADMIN', tenantId: null }, {}))
      .rejects.toMatchObject({ httpStatus: 403, reasonKey: 'tenant_context_required' });
    expect(orders.listForAdmin).not.toHaveBeenCalled();
  });

  it('rejects an admin resource request from a different fixed-site context before listing tickets', async () => {
    const { controller, listAdminTickets } = createController();

    await expect(controller.listAdminTickets({ ...userContext, ownerType: 'PLATFORM_ADMIN', siteId: 'site-2' }, {})).rejects.toMatchObject({
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    });
    expect(listAdminTickets.execute).not.toHaveBeenCalled();
  });

  it('short-circuits unsupported order cancellation on a site mismatch', () => {
    const { controller } = createController();

    expect(() => controller.cancelOrder({ ...userContext, siteId: 'site-2' })).toThrow(expect.objectContaining({
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    }));
  });

  it('short-circuits unsupported notification deletion on a site mismatch', () => {
    const { controller } = createController();

    expect(() => controller.deleteNotification({ ...userContext, siteId: 'site-2' })).toThrow(expect.objectContaining({
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    }));
  });

  it('rejects a disabled compatibility surface before reading customer resources', async () => {
    const { controller, config, orders } = createController();
    config.get.mockImplementation((key: string) => key === 'LEGACY_API_V1_ENABLED' ? 'false' : 'site-1');

    await expect(controller.listOrders(userContext, {})).rejects.toMatchObject({
      httpStatus: 404,
      reasonKey: 'legacy_api_disabled',
    });
    expect(orders.list).not.toHaveBeenCalled();
  });

  it('rejects a missing fixed-site configuration before invoking admin resources', async () => {
    const { controller, config, listTickets } = createController();
    config.get.mockImplementation((key: string) => key === 'LEGACY_API_V1_ENABLED' ? 'true' : undefined);

    await expect(controller.listTickets(userContext, {})).rejects.toMatchObject({
      httpStatus: 500,
      reasonKey: 'legacy_api_site_not_configured',
    });
    expect(listTickets.execute).not.toHaveBeenCalled();
  });

  it('pushes read=true filtering to the repository and preserves its filtered total', async () => {
    const { controller, notifications, ticketsRepository } = createController();
    notifications.listForOwner.mockResolvedValue({
      page: 1,
      pageSize: 1,
      total: 1,
      items: [{
        id: 'notification-1',
        type: 'ticket_reply',
        title: 'Ticket',
        body: 'Reply',
        relatedType: 'ticket',
        relatedId: 'ticket-1',
        readAt: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      }],
    });

    const result = await controller.listNotifications(userContext, { page: '1', limit: '1', read: 'true' });

    expect(notifications.listForOwner).toHaveBeenCalledWith(
      { userId: 'user-1', siteId: 'site-1', tenantId: 'tenant-1' },
      expect.objectContaining({ page: 1, pageSize: 1, readState: 'read' }),
    );
    expect(result.total).toBe(1);
    expect(ticketsRepository.mapLegacyIdsForOwner).toHaveBeenCalledWith(
      { ownerId: 'user-1', siteId: 'site-1', tenantId: 'tenant-1' },
      ['ticket-1'],
    );
  });

  it('translates legacy ticket bodies and returns the legacy detail envelope', async () => {
    const { controller, createTicket, replyTicket, closeTicket } = createController();
    createTicket.execute.mockResolvedValue({
      id: 'ticket-1', legacyId: 17, subject: 'Help', status: 'OPEN', createdAt: new Date(), updatedAt: new Date(),
      messages: [{ id: 'message-1', authorType: 'USER', authorId: 'user-1', body: 'Need help', createdAt: new Date() }],
    });
    replyTicket.execute.mockResolvedValue({
      id: 'ticket-1', legacyId: 17, subject: 'Help', status: 'PENDING', createdAt: new Date(), updatedAt: new Date(), messages: [],
    });
    closeTicket.execute.mockResolvedValue({
      id: 'ticket-1', legacyId: 17, subject: 'Help', status: 'CLOSED', createdAt: new Date(), updatedAt: new Date(), messages: [],
    });

    const created = await controller.createTicket(userContext, { subject: 'Help', content: 'Need help' });
    const replied = await controller.replyTicket(userContext, '17', { content: 'More details' });
    const closed = await controller.closeTicket(userContext, '17');

    expect(createTicket.execute).toHaveBeenCalledWith(userContext, { subject: 'Help', body: 'Need help' });
    expect(replyTicket.execute).toHaveBeenCalledWith(userContext, 'ticket-1', { body: 'More details' });
    expect(closeTicket.execute).toHaveBeenCalledWith(userContext, 'ticket-1');
    expect(created).toMatchObject({ id: 17, ticket: { id: 17, status: 'open' }, messages: [{ senderRole: 'user', body: 'Need help' }] });
    expect(replied.ticket.status).toBe('answered');
    expect(closed.ticket.status).toBe('closed');
  });

  it('rejects non-numeric ticket IDs at the legacy boundary', async () => {
    const { controller, getTicket, ticketsRepository } = createController();

    await expect(controller.getTicket(userContext, 'ticket-uuid')).rejects.toMatchObject({
      httpStatus: 400,
      reasonKey: 'ticket_id_invalid',
    });
    expect(ticketsRepository.resolveOwnedLegacyId).not.toHaveBeenCalled();
    expect(getTicket.execute).not.toHaveBeenCalled();
  });
});
