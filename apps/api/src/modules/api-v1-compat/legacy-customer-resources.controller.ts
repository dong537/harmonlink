import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OrderStatus } from '@ipeasy/db';
import { ConfigService } from '../../common/config/config.service';
import { AuthenticatedContext } from '../../common/auth/auth-context';
import { CurrentContext } from '../../common/auth/current-context.decorator';
import { RequireAuth, RequireUser } from '../../common/auth/guards';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PageResult } from '../../common/pagination/pagination.dto';
import { OrdersRepository, Order, AdminOrderListItem } from '../orders/orders.repository';
import { NotificationsRepository, Notification } from '../notifications/notifications.repository';
import { requireNotificationOwner } from '../notifications/access';
import { requireTicketAdminScope } from '../tickets/admin-access';
import { requireTicketOwner } from '../tickets/access';
import { TicketsRepository } from '../tickets/tickets.repository';
import { CreateTicketUseCase } from '../tickets/use-cases/create-ticket.use-case';
import { ListTicketsUseCase } from '../tickets/use-cases/list-tickets.use-case';
import { GetTicketUseCase } from '../tickets/use-cases/get-ticket.use-case';
import { ReplyTicketUseCase } from '../tickets/use-cases/reply-ticket.use-case';
import { CloseTicketUseCase } from '../tickets/use-cases/close-ticket.use-case';
import { ListAdminTicketsUseCase } from '../tickets/use-cases/list-admin-tickets.use-case';
import { GetAdminTicketUseCase } from '../tickets/use-cases/get-admin-ticket.use-case';
import { ReplyAdminTicketUseCase } from '../tickets/use-cases/reply-admin-ticket.use-case';
import { UpdateAdminTicketStatusUseCase } from '../tickets/use-cases/update-admin-ticket-status.use-case';
import { TicketDetailDto, AdminTicketDetailDto } from '../tickets/dto';
import { assertLegacyApiAccess } from './legacy-site-access';

type LegacyQuery = Record<string, unknown>;
type LegacyPage<T> = {
  data: T[];
  list: T[];
  items: T[];
  page: number;
  pageSize: number;
  limit: number;
  total: number;
};

/**
 * Adapts the frozen May client contract.  The controller deliberately keeps
 * the legacy response shape at this boundary; all reads and writes still go
 * through the canonical repositories/use-cases.
 */
@Controller('v1')
export class LegacyCustomerResourcesController {
  constructor(
    private readonly config: ConfigService,
    private readonly orders: OrdersRepository,
    private readonly notifications: NotificationsRepository,
    private readonly tickets: TicketsRepository,
    private readonly createTicketUseCase: CreateTicketUseCase,
    private readonly listTicketsUseCase: ListTicketsUseCase,
    private readonly getTicketUseCase: GetTicketUseCase,
    private readonly replyTicketUseCase: ReplyTicketUseCase,
    private readonly closeTicketUseCase: CloseTicketUseCase,
    private readonly listAdminTicketsUseCase: ListAdminTicketsUseCase,
    private readonly getAdminTicketUseCase: GetAdminTicketUseCase,
    private readonly replyAdminTicketUseCase: ReplyAdminTicketUseCase,
    private readonly updateAdminTicketStatusUseCase: UpdateAdminTicketStatusUseCase,
  ) {}

  @Get('orders')
  @RequireAuth()
  async listOrders(
    @CurrentContext() ctx: AuthenticatedContext,
    @Query() query: LegacyQuery,
  ): Promise<LegacyPage<LegacyOrder>> {
    this.assertEnabled(ctx);
    const page = readPage(query);
    const canonicalQuery = {
      page: page.page,
      pageSize: page.pageSize,
      search: readOptional(query.userEmail) ?? readOptional(query.q) ?? undefined,
      status: toCanonicalOrderStatus(readOptional(query.status)),
    };

    let result: PageResult<Order | AdminOrderListItem>;
    if (ctx.ownerType === 'USER') {
      if (!ctx.tenantId) throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_required', 403);
      result = await this.orders.list(ctx.siteId, ctx.ownerId, ctx.tenantId, canonicalQuery);
    } else if (ctx.ownerType === 'TENANT_ADMIN') {
      if (!ctx.tenantId) throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_context_required', 403);
      result = await this.orders.listForAdmin(ctx.siteId, ctx.tenantId, canonicalQuery);
    } else if (ctx.ownerType === 'PLATFORM_ADMIN') {
      result = await this.orders.listForAdmin(ctx.siteId, readOptional(query.tenantId) ?? null, canonicalQuery);
    } else {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }

    return makePage(result, (item) => toLegacyOrder(item));
  }

  @Get('orders/admin/all')
  @RequireAuth()
  async listAdminOrders(
    @CurrentContext() ctx: AuthenticatedContext,
    @Query() query: LegacyQuery,
  ): Promise<LegacyPage<LegacyOrder>> {
    this.assertEnabled(ctx);
    if (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'TENANT_ADMIN') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    if (ctx.ownerType === 'TENANT_ADMIN' && !ctx.tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_context_required', 403);
    }
    const page = readPage(query);
    const result = await this.orders.listForAdmin(
      ctx.siteId,
      ctx.ownerType === 'TENANT_ADMIN' ? ctx.tenantId : readOptional(query.tenantId) ?? null,
      {
        page: page.page,
        pageSize: page.pageSize,
        search: readOptional(query.userEmail) ?? readOptional(query.q) ?? undefined,
        status: toCanonicalOrderStatus(readOptional(query.status)),
      },
    );
    return makePage(result, (item) => toLegacyOrder(item));
  }

  @Patch('orders/:id/cancel')
  @RequireAuth()
  cancelOrder(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    throw new AppError(ErrorCode.UNSUPPORTED_CAPABILITY, 'order_cancellation_unavailable', 409);
  }

  @Get('notifications')
  @RequireUser()
  async listNotifications(
    @CurrentContext() ctx: AuthenticatedContext,
    @Query() query: LegacyQuery,
  ): Promise<LegacyPage<LegacyNotification>> {
    this.assertEnabled(ctx);
    const owner = requireNotificationOwner(ctx);
    const page = readPage(query);
    const readFilter = normalizeLegacyReadFilter(query.read);
    const result = await this.notifications.listForOwner(owner, {
      page: page.page,
      pageSize: page.pageSize,
      readState: readFilter,
      unreadOnly: readFilter === 'unread',
    });
    const ticketIds = result.items
      .filter((item) => item.relatedType === 'ticket' && item.relatedId)
      .map((item) => item.relatedId as string);
    const ticketIdMap = await this.tickets.mapLegacyIdsForOwner(
      requireTicketOwner(ctx),
      ticketIds,
    );
    const items = result.items.map((item) => toLegacyNotification(item, ticketIdMap));
    return {
      data: items,
      list: items,
      items,
      page: result.page,
      pageSize: result.pageSize,
      limit: result.pageSize,
      total: result.total,
    };
  }

  @Get('notifications/unread-count')
  @RequireUser()
  async unreadNotifications(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    const owner = requireNotificationOwner(ctx);
    return { count: await this.notifications.countUnread(owner) };
  }

  @Patch('notifications/:id/read')
  @RequireUser()
  async markNotificationRead(@CurrentContext() ctx: AuthenticatedContext, @Param('id') id: string) {
    this.assertEnabled(ctx);
    await this.notifications.markRead(id, requireNotificationOwner(ctx));
    return { ok: true };
  }

  @Patch('notifications/read-all')
  @RequireUser()
  async markAllNotificationsRead(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    const count = await this.notifications.markAllRead(requireNotificationOwner(ctx));
    return { ok: true, count };
  }

  @Delete('notifications/:id')
  @RequireUser()
  deleteNotification(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    throw new AppError(ErrorCode.UNSUPPORTED_CAPABILITY, 'notification_delete_unavailable', 501);
  }

  @Get('tickets')
  @RequireUser()
  async listTickets(@CurrentContext() ctx: AuthenticatedContext, @Query() query: LegacyQuery) {
    this.assertEnabled(ctx);
    const page = readPage(query);
    const result = await this.listTicketsUseCase.execute(ctx, {
      page: page.page,
      pageSize: page.pageSize,
      search: readOptional(query.q) ?? readOptional(query.search),
      status: toCanonicalTicketStatus(readOptional(query.status)),
    });
    return makePage(result, toLegacyTicketListItem);
  }

  @Get('tickets/:id')
  @RequireUser()
  async getTicket(@CurrentContext() ctx: AuthenticatedContext, @Param('id') id: string) {
    this.assertEnabled(ctx);
    const owner = requireTicketOwner(ctx);
    const canonicalId = await this.tickets.resolveOwnedLegacyId(readLegacyTicketId(id), owner);
    return toLegacyTicketDetail(await this.getTicketUseCase.execute(ctx, canonicalId));
  }

  @Post('tickets')
  @RequireUser()
  async createTicket(@CurrentContext() ctx: AuthenticatedContext, @Body() body: { subject?: unknown; content?: unknown }) {
    this.assertEnabled(ctx);
    const result = await this.createTicketUseCase.execute(ctx, {
      subject: body?.subject as string,
      body: body?.content as string,
    });
    return toLegacyTicketDetail(result);
  }

  @Post('tickets/:id/reply')
  @RequireUser()
  async replyTicket(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') id: string,
    @Body() body: { content?: unknown },
  ) {
    this.assertEnabled(ctx);
    const owner = requireTicketOwner(ctx);
    const canonicalId = await this.tickets.resolveOwnedLegacyId(readLegacyTicketId(id), owner);
    return toLegacyTicketDetail(await this.replyTicketUseCase.execute(ctx, canonicalId, { body: body?.content as string }));
  }

  @Patch('tickets/:id/close')
  @RequireUser()
  async closeTicket(@CurrentContext() ctx: AuthenticatedContext, @Param('id') id: string) {
    this.assertEnabled(ctx);
    const owner = requireTicketOwner(ctx);
    const canonicalId = await this.tickets.resolveOwnedLegacyId(readLegacyTicketId(id), owner);
    return toLegacyTicketDetail(await this.closeTicketUseCase.execute(ctx, canonicalId));
  }

  @Get('admin/tickets')
  @RequireAuth()
  async listAdminTickets(@CurrentContext() ctx: AuthenticatedContext, @Query() query: LegacyQuery) {
    this.assertEnabled(ctx);
    const page = readPage(query);
    const result = await this.listAdminTicketsUseCase.execute(ctx, {
      page: page.page,
      pageSize: page.pageSize,
      search: readOptional(query.q) ?? readOptional(query.search),
      status: toCanonicalTicketStatus(readOptional(query.status)),
    });
    return makePage(result, toLegacyAdminTicketListItem);
  }

  @Get('admin/tickets/:id')
  @RequireAuth()
  async getAdminTicket(@CurrentContext() ctx: AuthenticatedContext, @Param('id') id: string) {
    this.assertEnabled(ctx);
    const scope = requireTicketAdminScope(ctx);
    const canonicalId = await this.tickets.resolveLegacyIdForScope(readLegacyTicketId(id), scope);
    return toLegacyAdminTicketDetail(await this.getAdminTicketUseCase.execute(ctx, canonicalId));
  }

  @Post('admin/tickets/:id/reply')
  @RequireAuth()
  async replyAdminTicket(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') id: string,
    @Body() body: { content?: unknown },
  ) {
    this.assertEnabled(ctx);
    const scope = requireTicketAdminScope(ctx);
    const canonicalId = await this.tickets.resolveLegacyIdForScope(readLegacyTicketId(id), scope);
    return toLegacyAdminTicketDetail(await this.replyAdminTicketUseCase.execute(ctx, canonicalId, { body: body?.content as string }));
  }

  @Patch('admin/tickets/:id/close')
  @RequireAuth()
  async closeAdminTicket(@CurrentContext() ctx: AuthenticatedContext, @Param('id') id: string) {
    this.assertEnabled(ctx);
    const scope = requireTicketAdminScope(ctx);
    const canonicalId = await this.tickets.resolveLegacyIdForScope(readLegacyTicketId(id), scope);
    return toLegacyAdminTicketDetail(await this.updateAdminTicketStatusUseCase.execute(ctx, canonicalId, { status: 'CLOSED' }));
  }

  private assertEnabled(context: Pick<AuthenticatedContext, 'siteId'>): string {
    return assertLegacyApiAccess(this.config, context);
  }
}

export type LegacyOrder = {
  id: string;
  orderNo: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  quantity: number;
  durationDays: number;
  description: string;
  remark: string;
  userEmail?: string;
  user?: { id: string; email: string };
  createdAt: Date;
  updatedAt: Date;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
};

export type LegacyNotification = {
  id: string;
  type: string;
  title: string;
  content: string;
  body: string;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
  data?: { ticketId?: number; relatedId?: string };
};

function readPage(query: LegacyQuery): { page: number; pageSize: number } {
  const page = positiveInt(query.page, 1);
  const pageSize = Math.min(100, positiveInt(query.limit ?? query.pageSize, 20));
  return { page, pageSize };
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function makePage<T, U>(result: PageResult<T>, mapper: (item: T) => U): LegacyPage<U> {
  const data = result.items.map(mapper);
  return {
    data,
    list: data,
    items: data,
    page: result.page,
    pageSize: result.pageSize,
    limit: result.pageSize,
    total: result.total,
  };
}

function toCanonicalOrderStatus(value: string | undefined): OrderStatus | undefined {
  if (!value) return undefined;
  const map: Record<string, OrderStatus> = {
    pending: 'PENDING',
    fulfilling: 'FULFILLING',
    completed: 'COMPLETED',
    partially_completed: 'PARTIALLY_COMPLETED',
    failed: 'FAILED',
    refunded: 'REFUNDED',
  };
  return map[value.toLowerCase()];
}

function toCanonicalTicketStatus(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return ({ open: 'OPEN', answered: 'PENDING', pending: 'PENDING', closed: 'CLOSED' } as Record<string, string>)[value.toLowerCase()] ?? value.toUpperCase();
}

function toLegacyOrder(order: Order | AdminOrderListItem): LegacyOrder {
  const raw = order as Order & Partial<AdminOrderListItem>;
  const snapshot = isRecord(raw.quoteSnapshot) ? raw.quoteSnapshot : {};
  const resource = isRecord(raw.resource) ? raw.resource : null;
  const type = raw.type === 'STATIC_PROXY_RENEW' ? 'renewal' : raw.type === 'STATIC_PROXY_BUY' ? 'static_proxy' : String(raw.type).toLowerCase();
  const status = String(raw.status).toLowerCase() === 'fulfilling' ? 'pending' : String(raw.status).toLowerCase();
  const description = readOptional(snapshot['description']) ?? readOptional(snapshot['businessType']) ?? (resource && readOptional(resource['name'])) ?? raw.resourceId;
  const userEmail = raw.userEmail ?? undefined;
  return {
    id: raw.id,
    orderNo: raw.id,
    type,
    status,
    amount: Number(raw.totalPrice),
    currency: raw.currency,
    quantity: raw.quantity,
    durationDays: raw.durationDays,
    description,
    remark: description,
    ...(userEmail ? { userEmail, user: { id: raw.userId, email: userEmail } } : {}),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    items: [{ name: resource && readOptional(resource['name']) || raw.resourceId, quantity: raw.quantity, unitPrice: Number(raw.unitPrice) }],
  };
}

function toLegacyNotification(notification: Notification, ticketIds: Map<string, number>): LegacyNotification {
  const isTicket = notification.relatedType === 'ticket';
  const legacyTicketId = notification.relatedId ? ticketIds.get(notification.relatedId) : undefined;
  return {
    id: notification.id,
    type: isTicket ? 'ticket' : notification.type,
    title: notification.title,
    content: notification.body,
    body: notification.body,
    read: notification.readAt !== null,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    ...(notification.relatedId && (!isTicket || legacyTicketId !== undefined)
      ? { data: isTicket ? { ticketId: legacyTicketId } : { relatedId: notification.relatedId } }
      : {}),
  };
}

function toLegacyTicketListItem(ticket: { id: string; legacyId?: number; subject: string; status: string; createdAt: Date; updatedAt: Date }) {
  return { ...ticket, id: ticket.legacyId ?? ticket.id, status: toLegacyStatus(ticket.status), lastReplyAt: ticket.updatedAt };
}

function toLegacyTicketDetail(ticket: TicketDetailDto) {
  const messages = ticket.messages.map((message) => ({
    ...message,
    senderRole: message.authorType === 'ADMIN_USER' ? 'admin' : 'user',
  }));
  const legacyTicket = { ...ticket, id: ticket.legacyId ?? ticket.id, status: toLegacyStatus(ticket.status) };
  return { ...legacyTicket, ticket: legacyTicket, messages };
}

function toLegacyAdminTicketListItem(ticket: { id: string; legacyId?: number; subject: string; status: string; userId: string; userEmail: string; createdAt: Date; updatedAt: Date }) {
  return { ...ticket, id: ticket.legacyId ?? ticket.id, status: toLegacyStatus(ticket.status), user: { id: ticket.userId, email: ticket.userEmail }, lastReplyAt: ticket.updatedAt };
}

function toLegacyAdminTicketDetail(ticket: AdminTicketDetailDto) {
  const messages = ticket.messages.map((message) => ({
    ...message,
    senderRole: message.authorType === 'ADMIN_USER' ? 'admin' : 'user',
  }));
  const legacyTicket = {
    id: ticket.legacyId ?? ticket.id,
    subject: ticket.subject,
    status: toLegacyStatus(ticket.status),
    userId: ticket.userId,
    userEmail: ticket.userEmail,
    user: { id: ticket.userId, email: ticket.userEmail },
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
  return { ...legacyTicket, ticket: legacyTicket, messages };
}

function toLegacyStatus(value: string): string {
  return ({ OPEN: 'open', PENDING: 'answered', CLOSED: 'closed' } as Record<string, string>)[value] ?? value.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLegacyReadFilter(value: unknown): 'read' | 'unread' | undefined {
  if (value === 'true' || value === '1' || value === true) return 'read';
  if (value === 'false' || value === '0' || value === false) return 'unread';
  return undefined;
}

function readLegacyTicketId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'ticket_id_invalid', 400);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'ticket_id_invalid', 400);
  }
  return id;
}
