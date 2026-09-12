import { Injectable } from '@nestjs/common';
import { prisma } from '@ipeasy/db';
import type { Prisma } from '@ipeasy/db/generated/client';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PageQueryDto, PageResult, normalizePageQuery } from '../../common/pagination/pagination.dto';

const PROVIDER_ORDER_JOB_KIND = 'PROVIDER_DEDICATED_LINE_ORDER';

/** The site boundary is always present; null tenant means every tenant in that site. */
export interface DedicatedLineOrderAdminScope {
  siteId: string;
  tenantId: string | null;
}

/** Alias kept for callers that use the shorter admin-scope terminology. */
export type AdminScope = DedicatedLineOrderAdminScope;

export interface DedicatedLineOrderAdminListQuery extends PageQueryDto {
  tenantId?: string;
  userId?: string;
  skuCode?: string;
  providerCode?: string;
}

export interface DedicatedLineOrderAdminReservation {
  id: string;
  siteId: string;
  tenantId: string;
  userId: string;
  inventorySnapshotId: string;
  providerAccountId: string;
  skuId: string;
  dedicatedLineOrderId: string | null;
  providerCode: string;
  countryCode: string;
  quantity: number;
  snapshotVersion: string;
  status: string;
  expiresAt: Date;
  consumedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DedicatedLineOrderAdminJob {
  id: string;
  siteId: string;
  tenantId: string | null;
  userId: string | null;
  dedicatedLineId: string | null;
  dedicatedLineOrderId: string | null;
  kind: string;
  aggregateType: string;
  aggregateId: string;
  desiredVersion: number;
  status: string;
  attempt: number;
  maxAttempts: number;
  nextRunAt: Date;
  lastErrorCode: string | null;
  upstreamOrderId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DedicatedLineOrderAdminProjection {
  id: string;
  siteId: string;
  tenantId: string;
  userId: string;
  dedicatedLineId: string;
  migrationId: string | null;
  nodeId: string;
  projectionKey: string;
  status: string;
  desiredVersion: number;
  observedVersion: number | null;
  nodeExternalId: string | null;
  lastErrorCode: string | null;
  retryCount: number;
  lastAppliedAt: Date | null;
  lastObservedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DedicatedLineOrderAdminLine {
  id: string;
  siteId: string;
  tenantId: string;
  userId: string;
  zoneId: string | null;
  skuId: string;
  dedicatedLineOrderId: string | null;
  inboundProfileId: string;
  status: string;
  countryCode: string;
  protocol: string;
  clientEmail: string;
  desiredVersion: number;
  limits: {
    trafficLimitBytes: string;
    uplinkLimitBps: string;
    downlinkLimitBps: string;
    maxConnections: number;
    ipLimit: number;
  };
  startsAt: Date | null;
  expiresAt: Date | null;
  suspendedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  projections: DedicatedLineOrderAdminProjection[];
}

export interface DedicatedLineOrderAdminDeployment {
  status: string | null;
  ready: number;
  failed: number;
  total: number;
  projections: DedicatedLineOrderAdminProjection[];
}

export interface DedicatedLineOrderAdminItem {
  id: string;
  siteId: string;
  tenantId: string;
  userId: string;
  zoneId: string | null;
  skuId: string;
  skuCode: string;
  skuName: string;
  countryCode: string;
  regionCode: string | null;
  businessType: string | null;
  durationDays: number;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  currency: string;
  priceSource: string;
  contractVersion: number;
  /** Provider-job status is the order's operational status; absent means no job exists yet. */
  status: string | null;
  reservation: DedicatedLineOrderAdminReservation | null;
  job: DedicatedLineOrderAdminJob | null;
  lines: DedicatedLineOrderAdminLine[];
  deployment: DedicatedLineOrderAdminDeployment;
  createdAt: Date;
  updatedAt: Date;
}

const reservationSelect = {
  id: true,
  siteId: true,
  tenantId: true,
  userId: true,
  inventorySnapshotId: true,
  providerAccountId: true,
  skuId: true,
  dedicatedLineOrderId: true,
  providerCode: true,
  countryCode: true,
  quantity: true,
  snapshotVersion: true,
  status: true,
  expiresAt: true,
  consumedAt: true,
  releasedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.stock_reservationsSelect;

// `payload` is selected only so the safe upstream order id can be projected;
// it is consumed immediately and never appears in the returned DTO.
const jobSelect = {
  id: true,
  siteId: true,
  tenantId: true,
  userId: true,
  dedicatedLineId: true,
  dedicatedLineOrderId: true,
  kind: true,
  aggregateType: true,
  aggregateId: true,
  desiredVersion: true,
  status: true,
  attempt: true,
  maxAttempts: true,
  nextRunAt: true,
  lastErrorCode: true,
  payload: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.external_jobsSelect;

const projectionSelect = {
  id: true,
  siteId: true,
  tenantId: true,
  userId: true,
  dedicatedLineId: true,
  migrationId: true,
  nodeId: true,
  projectionKey: true,
  status: true,
  desiredVersion: true,
  observedVersion: true,
  nodeExternalId: true,
  lastErrorCode: true,
  retryCount: true,
  lastAppliedAt: true,
  lastObservedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.dedicated_line_projectionsSelect;

const lineScalarSelect = {
  id: true,
  siteId: true,
  tenantId: true,
  userId: true,
  zoneId: true,
  skuId: true,
  dedicatedLineOrderId: true,
  inboundProfileId: true,
  status: true,
  countryCode: true,
  protocol: true,
  clientEmail: true,
  desiredVersion: true,
  quotaBytes: true,
  uplinkLimitBps: true,
  downlinkLimitBps: true,
  maxConnections: true,
  ipLimit: true,
  startsAt: true,
  expiresAt: true,
  suspendedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.dedicated_linesSelect;

const orderScalarSelect = {
  id: true,
  siteId: true,
  tenantId: true,
  userId: true,
  zoneId: true,
  skuId: true,
  skuCode: true,
  skuName: true,
  countryCode: true,
  regionCode: true,
  businessType: true,
  durationDays: true,
  quantity: true,
  unitPrice: true,
  totalPrice: true,
  currency: true,
  priceSource: true,
  contractVersion: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.dedicated_line_ordersSelect;

const _orderSelectForType = {
  ...orderScalarSelect,
  reservation: { select: reservationSelect },
  executionJob: { select: jobSelect },
  lines: {
    orderBy: { createdAt: 'asc' },
    select: {
      ...lineScalarSelect,
      projections: {
        orderBy: { createdAt: 'asc' },
        select: projectionSelect,
      },
    },
  },
} satisfies Prisma.dedicated_line_ordersSelect;

type AdminOrderRow = Prisma.dedicated_line_ordersGetPayload<{ select: typeof _orderSelectForType }>;

@Injectable()
export class DedicatedLineOrderAdminRepository {
  async listForAdmin(
    scope: DedicatedLineOrderAdminScope,
    query: DedicatedLineOrderAdminListQuery = {},
  ): Promise<PageResult<DedicatedLineOrderAdminItem>> {
    const { page, pageSize } = normalizePageQuery(query);
    const where = this.buildWhere(scope, query);
    const select = this.buildSelect(scope);
    const [total, rows] = await Promise.all([
      prisma.dedicated_line_orders.count({ where }),
      prisma.dedicated_line_orders.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: (rows as unknown as AdminOrderRow[]).map((row) => toAdminItem(row, scope)),
    };
  }

  async getForAdmin(
    orderId: string,
    scope: DedicatedLineOrderAdminScope,
  ): Promise<DedicatedLineOrderAdminItem> {
    const order = await prisma.dedicated_line_orders.findFirst({
      where: { id: orderId, ...this.scopeWhere(scope) },
      select: this.buildSelect(scope),
    });
    if (!order) {
      // A cross-site/tenant order is intentionally indistinguishable from a
      // missing order at this boundary.
      throw new AppError(ErrorCode.NOT_FOUND, 'order_not_found', 404);
    }
    return toAdminItem(order as unknown as AdminOrderRow, scope);
  }

  private buildWhere(
    scope: DedicatedLineOrderAdminScope,
    query: DedicatedLineOrderAdminListQuery,
  ): Prisma.dedicated_line_ordersWhereInput {
    const where: Prisma.dedicated_line_ordersWhereInput = this.scopeWhere(scope);

    // A platform admin may narrow a site query to one tenant. A tenant admin's
    // caller-supplied tenantId is deliberately ignored so it cannot widen scope.
    if (!scope.tenantId && query.tenantId?.trim()) {
      where.tenantId = query.tenantId.trim();
    }
    if (query.userId?.trim()) where.userId = query.userId.trim();
    if (query.skuCode?.trim()) where.skuCode = query.skuCode.trim();
    if (query.providerCode?.trim()) {
      where.reservation = { is: { providerCode: query.providerCode.trim() } };
    }
    if (query.status?.trim()) {
      const status = parseJobStatus(query.status);
      where.executionJob = { is: { kind: PROVIDER_ORDER_JOB_KIND, status } };
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { userId: { contains: search, mode: 'insensitive' } },
        { skuCode: { contains: search, mode: 'insensitive' } },
        { skuName: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { tenant: { code: { contains: search, mode: 'insensitive' } } },
        { tenant: { name: { contains: search, mode: 'insensitive' } } },
        { reservation: { is: { providerCode: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    if (query.from || query.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.from) createdAt.gte = parseDate(query.from);
      if (query.to) createdAt.lte = parseDate(query.to);
      where.createdAt = createdAt;
    }
    return where;
  }

  private scopeWhere(scope: DedicatedLineOrderAdminScope): Prisma.dedicated_line_ordersWhereInput {
    return {
      siteId: scope.siteId,
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
    };
  }

  private buildSelect(scope: DedicatedLineOrderAdminScope): Prisma.dedicated_line_ordersSelect {
    const relationScope = {
      siteId: scope.siteId,
      ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
    };
    return {
      ...orderScalarSelect,
      reservation: { where: relationScope, select: reservationSelect },
      executionJob: {
        where: { ...relationScope, kind: PROVIDER_ORDER_JOB_KIND },
        select: jobSelect,
      },
      lines: {
        where: relationScope,
        orderBy: { createdAt: 'asc' },
        select: {
          ...lineScalarSelect,
          projections: {
            where: relationScope,
            orderBy: { createdAt: 'asc' },
            select: projectionSelect,
          },
        },
      },
    };
  }
}

function toAdminItem(row: AdminOrderRow, scope: DedicatedLineOrderAdminScope): DedicatedLineOrderAdminItem {
  const reservation = row.reservation && matchesScope(row.reservation, row, scope)
    ? toReservation(row.reservation)
    : null;
  const job = row.executionJob && matchesScope(row.executionJob, row, scope)
    ? toJob(row.executionJob)
    : null;
  const lines = row.lines
    .filter((line) => matchesScope(line, row, scope))
    .map((line) => ({
      id: line.id,
      siteId: line.siteId,
      tenantId: line.tenantId,
      userId: line.userId,
      zoneId: line.zoneId,
      skuId: line.skuId,
      dedicatedLineOrderId: line.dedicatedLineOrderId,
      inboundProfileId: line.inboundProfileId,
      status: line.status,
      countryCode: line.countryCode,
      protocol: line.protocol,
      clientEmail: line.clientEmail,
      desiredVersion: line.desiredVersion,
      limits: {
        trafficLimitBytes: bigintString(line.quotaBytes),
        uplinkLimitBps: bigintString(line.uplinkLimitBps),
        downlinkLimitBps: bigintString(line.downlinkLimitBps),
        maxConnections: line.maxConnections ?? 0,
        ipLimit: line.ipLimit ?? 0,
      },
      startsAt: line.startsAt,
      expiresAt: line.expiresAt,
      suspendedAt: line.suspendedAt,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
      projections: line.projections
        .filter((projection) => matchesScope(projection, line, scope))
        .map(toProjection),
    }));
  const projections = lines.flatMap((line) => line.projections);

  return {
    id: row.id,
    siteId: row.siteId,
    tenantId: row.tenantId,
    userId: row.userId,
    zoneId: row.zoneId,
    skuId: row.skuId,
    skuCode: row.skuCode,
    skuName: row.skuName,
    countryCode: row.countryCode,
    regionCode: row.regionCode,
    businessType: row.businessType,
    durationDays: row.durationDays,
    quantity: row.quantity,
    unitPrice: row.unitPrice.toString(),
    totalPrice: row.totalPrice.toString(),
    currency: row.currency,
    priceSource: row.priceSource,
    contractVersion: row.contractVersion,
    status: job?.status ?? null,
    reservation,
    job,
    lines,
    deployment: {
      status: deploymentStatus(lines),
      ready: projections.filter((projection) => projection.status === 'READY').length,
      failed: projections.filter((projection) => projection.status === 'FAILED').length,
      total: projections.length,
      projections,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toReservation(row: AdminOrderRow['reservation']): DedicatedLineOrderAdminReservation {
  if (!row) throw new Error('reservation row required');
  return {
    id: row.id,
    siteId: row.siteId,
    tenantId: row.tenantId,
    userId: row.userId,
    inventorySnapshotId: row.inventorySnapshotId,
    providerAccountId: row.providerAccountId,
    skuId: row.skuId,
    dedicatedLineOrderId: row.dedicatedLineOrderId,
    providerCode: row.providerCode,
    countryCode: row.countryCode,
    quantity: row.quantity,
    snapshotVersion: row.snapshotVersion,
    status: row.status,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    releasedAt: row.releasedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toJob(row: NonNullable<AdminOrderRow['executionJob']>): DedicatedLineOrderAdminJob {
  return {
    id: row.id,
    siteId: row.siteId,
    tenantId: row.tenantId,
    userId: row.userId,
    dedicatedLineId: row.dedicatedLineId,
    dedicatedLineOrderId: row.dedicatedLineOrderId,
    kind: row.kind,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    desiredVersion: row.desiredVersion,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    nextRunAt: row.nextRunAt,
    lastErrorCode: row.lastErrorCode,
    upstreamOrderId: readUpstreamOrderId(row.payload),
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toProjection(row: NonNullable<AdminOrderRow['lines'][number]['projections'][number]>): DedicatedLineOrderAdminProjection {
  return {
    id: row.id,
    siteId: row.siteId,
    tenantId: row.tenantId,
    userId: row.userId,
    dedicatedLineId: row.dedicatedLineId,
    migrationId: row.migrationId,
    nodeId: row.nodeId,
    projectionKey: row.projectionKey,
    status: row.status,
    desiredVersion: row.desiredVersion,
    observedVersion: row.observedVersion,
    nodeExternalId: row.nodeExternalId,
    lastErrorCode: row.lastErrorCode,
    retryCount: row.retryCount,
    lastAppliedAt: row.lastAppliedAt,
    lastObservedAt: row.lastObservedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function matchesScope(
  value: { siteId: string; tenantId: string | null; userId: string | null },
  owner: { siteId: string; tenantId: string; userId: string },
  scope: DedicatedLineOrderAdminScope,
): boolean {
  return value.siteId === owner.siteId
    && value.siteId === scope.siteId
    && value.tenantId === owner.tenantId
    && value.userId === owner.userId
    && (!scope.tenantId || value.tenantId === scope.tenantId);
}

function readUpstreamOrderId(payload: Prisma.JsonValue): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)['upstreamOrderId'];
  return typeof value === 'string' && value.trim() ? value : null;
}

function bigintString(value: bigint | null): string {
  return (value ?? 0n).toString();
}

function deploymentStatus(lines: DedicatedLineOrderAdminLine[]): string | null {
  const statuses = lines.map((line) => line.status);
  if (statuses.length === 0) return null;
  if (statuses.includes('FAILED')) return 'FAILED';
  if (statuses.includes('DEGRADED')) return 'DEGRADED';
  if (statuses.every((status) => status === 'ACTIVE')) return 'ACTIVE';
  return statuses[0] ?? null;
}

function parseJobStatus(value: string): AdminOrderRow['executionJob'] extends { status: infer T } | null ? T : never {
  const allowed = ['QUEUED', 'LEASED', 'RETRYING', 'COMPLETED', 'FAILED', 'NEEDS_OPERATOR'] as const;
  if ((allowed as readonly string[]).includes(value.trim())) {
    return value.trim() as AdminOrderRow['executionJob'] extends { status: infer T } | null ? T : never;
  }
  throw new AppError(ErrorCode.VALIDATION_ERROR, 'dedicated_line_order_status_invalid', 400);
}

function parseDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'dedicated_line_order_date_invalid', 400);
  }
  return parsed;
}
