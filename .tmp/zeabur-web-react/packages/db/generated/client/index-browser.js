
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 6.2.1
 * Query Engine version: 4123509d24aa4dede1e864b46351bf2790323b69
 */
Prisma.prismaVersion = {
  client: "6.2.1",
  engine: "4123509d24aa4dede1e864b46351bf2790323b69"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.SitesScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  domain: 'domain',
  status: 'status',
  brandConfig: 'brandConfig',
  maintenanceMode: 'maintenanceMode',
  maintenanceMessage: 'maintenanceMessage',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Site_announcementsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  title: 'title',
  content: 'content',
  isActive: 'isActive',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TenantsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  ownerUserId: 'ownerUserId',
  code: 'code',
  name: 'name',
  status: 'status',
  brandConfig: 'brandConfig',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UsersScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  email: 'email',
  passwordHash: 'passwordHash',
  name: 'name',
  phone: 'phone',
  status: 'status',
  kycStatus: 'kycStatus',
  riskStatus: 'riskStatus',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Admin_usersScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  email: 'email',
  passwordHash: 'passwordHash',
  role: 'role',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SessionsScalarFieldEnum = {
  id: 'id',
  ownerType: 'ownerType',
  ownerId: 'ownerId',
  siteId: 'siteId',
  tenantId: 'tenantId',
  token: 'token',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt',
  revokedAt: 'revokedAt'
};

exports.Prisma.Api_keysScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  ownerId: 'ownerId',
  ownerType: 'ownerType',
  name: 'name',
  keyHash: 'keyHash',
  keyPrefix: 'keyPrefix',
  scopes: 'scopes',
  ipWhitelist: 'ipWhitelist',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  revokedAt: 'revokedAt',
  lastUsedAt: 'lastUsedAt'
};

exports.Prisma.WalletsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  userId: 'userId',
  available: 'available',
  frozen: 'frozen',
  currency: 'currency',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Ledger_entriesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  walletId: 'walletId',
  userId: 'userId',
  type: 'type',
  amount: 'amount',
  balanceAfter: 'balanceAfter',
  currency: 'currency',
  relatedId: 'relatedId',
  reason: 'reason',
  idempotencyKey: 'idempotencyKey',
  createdAt: 'createdAt',
  meta: 'meta'
};

exports.Prisma.Payment_ordersScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  userId: 'userId',
  amount: 'amount',
  currency: 'currency',
  channel: 'channel',
  status: 'status',
  idempotencyKey: 'idempotencyKey',
  channelOrderId: 'channelOrderId',
  confirmedBy: 'confirmedBy',
  confirmedAt: 'confirmedAt',
  failReason: 'failReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  meta: 'meta'
};

exports.Prisma.Audit_logsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  actorType: 'actorType',
  actorId: 'actorId',
  targetType: 'targetType',
  targetId: 'targetId',
  action: 'action',
  reason: 'reason',
  requestId: 'requestId',
  ipAddress: 'ipAddress',
  meta: 'meta',
  createdAt: 'createdAt'
};

exports.Prisma.System_settingsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  key: 'key',
  value: 'value',
  description: 'description',
  updatedBy: 'updatedBy',
  updatedAt: 'updatedAt'
};

exports.Prisma.Upstream_request_logsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  providerCode: 'providerCode',
  upstreamAccountId: 'upstreamAccountId',
  operation: 'operation',
  requestId: 'requestId',
  durationMs: 'durationMs',
  status: 'status',
  errorCode: 'errorCode',
  requestSummary: 'requestSummary',
  responseSummary: 'responseSummary',
  createdAt: 'createdAt'
};

exports.Prisma.Provider_accountsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  providerCode: 'providerCode',
  status: 'status',
  credentialEncrypted: 'credentialEncrypted',
  baseUrl: 'baseUrl',
  timeoutMs: 'timeoutMs',
  inventorySyncEnabled: 'inventorySyncEnabled',
  enabledCountryCodes: 'enabledCountryCodes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Platform_resourcesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  upstreamAccountId: 'upstreamAccountId',
  parentId: 'parentId',
  type: 'type',
  code: 'code',
  name: 'name',
  displayName: 'displayName',
  providerCode: 'providerCode',
  ipType: 'ipType',
  protocol: 'protocol',
  status: 'status',
  sortOrder: 'sortOrder',
  upstreamCost: 'upstreamCost',
  upstreamCostCurrency: 'upstreamCostCurrency',
  isVisible: 'isVisible',
  isSaleable: 'isSaleable',
  unsaleableReason: 'unsaleableReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Inventory_snapshotsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  resourceId: 'resourceId',
  providerCode: 'providerCode',
  upstreamAccountId: 'upstreamAccountId',
  stock: 'stock',
  capturedAt: 'capturedAt',
  freshnessTtlSeconds: 'freshnessTtlSeconds',
  isStale: 'isStale'
};

exports.Prisma.Resource_mappingsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  resourceId: 'resourceId',
  providerCode: 'providerCode',
  upstreamAccountId: 'upstreamAccountId',
  providerResourceId: 'providerResourceId',
  weight: 'weight'
};

exports.Prisma.Price_templatesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  name: 'name',
  description: 'description',
  isDefault: 'isDefault',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Price_rulesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  templateId: 'templateId',
  resourceId: 'resourceId',
  durationDays: 'durationDays',
  unitPrice: 'unitPrice',
  currency: 'currency',
  minQty: 'minQty',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Price_overridesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  resourceId: 'resourceId',
  durationDays: 'durationDays',
  unitPrice: 'unitPrice',
  currency: 'currency'
};

exports.Prisma.User_price_bindingsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  userId: 'userId',
  templateId: 'templateId'
};

exports.Prisma.User_resource_price_overridesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  userId: 'userId',
  resourceId: 'resourceId',
  durationDays: 'durationDays',
  unitPrice: 'unitPrice',
  currency: 'currency'
};

exports.Prisma.OrdersScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  userId: 'userId',
  type: 'type',
  status: 'status',
  resourceId: 'resourceId',
  quantity: 'quantity',
  durationDays: 'durationDays',
  unitPrice: 'unitPrice',
  totalPrice: 'totalPrice',
  currency: 'currency',
  quoteSnapshot: 'quoteSnapshot',
  paymentOrderId: 'paymentOrderId',
  idempotencyKey: 'idempotencyKey',
  failReason: 'failReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Fulfillment_jobsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  orderId: 'orderId',
  providerCode: 'providerCode',
  upstreamAccountId: 'upstreamAccountId',
  status: 'status',
  attempts: 'attempts',
  maxAttempts: 'maxAttempts',
  lastError: 'lastError',
  scheduledAt: 'scheduledAt',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Upstream_order_mirrorsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  orderId: 'orderId',
  fulfillmentJobId: 'fulfillmentJobId',
  providerCode: 'providerCode',
  upstreamAccountId: 'upstreamAccountId',
  upstreamOrderId: 'upstreamOrderId',
  status: 'status',
  rawResponse: 'rawResponse',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Proxy_instancesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  userId: 'userId',
  orderId: 'orderId',
  upstreamOrderMirrorId: 'upstreamOrderMirrorId',
  upstreamProxyId: 'upstreamProxyId',
  providerCode: 'providerCode',
  upstreamAccountId: 'upstreamAccountId',
  ip: 'ip',
  port: 'port',
  username: 'username',
  password: 'password',
  protocol: 'protocol',
  countryCode: 'countryCode',
  regionCode: 'regionCode',
  ipType: 'ipType',
  status: 'status',
  expiresAt: 'expiresAt',
  businessType: 'businessType',
  userNote: 'userNote',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Upstream_api_accountsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  name: 'name',
  baseUrl: 'baseUrl',
  apiKeyEncrypted: 'apiKeyEncrypted',
  status: 'status',
  timeoutMs: 'timeoutMs',
  inventorySyncEnabled: 'inventorySyncEnabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TicketsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  userId: 'userId',
  subject: 'subject',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Ticket_messagesScalarFieldEnum = {
  id: 'id',
  ticketId: 'ticketId',
  siteId: 'siteId',
  tenantId: 'tenantId',
  authorType: 'authorType',
  authorId: 'authorId',
  body: 'body',
  createdAt: 'createdAt'
};

exports.Prisma.NotificationsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  userId: 'userId',
  type: 'type',
  title: 'title',
  body: 'body',
  relatedType: 'relatedType',
  relatedId: 'relatedId',
  readAt: 'readAt',
  createdAt: 'createdAt'
};

exports.Prisma.Dedicated_sku_profilesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  platformResourceId: 'platformResourceId',
  code: 'code',
  displayName: 'displayName',
  status: 'status',
  providerCode: 'providerCode',
  providerProductCode: 'providerProductCode',
  clientProtocol: 'clientProtocol',
  inboundPort: 'inboundPort',
  inboundTagTemplate: 'inboundTagTemplate',
  defaultDurationDays: 'defaultDurationDays',
  capacityUnits: 'capacityUnits',
  inventoryTtlSeconds: 'inventoryTtlSeconds',
  config: 'config',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_inventory_snapshotsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  skuProfileId: 'skuProfileId',
  providerAccountId: 'providerAccountId',
  stock: 'stock',
  reservedQuantity: 'reservedQuantity',
  capturedAt: 'capturedAt',
  freshnessTtlSeconds: 'freshnessTtlSeconds',
  rawSummary: 'rawSummary',
  createdAt: 'createdAt'
};

exports.Prisma.Dedicated_inventory_reservationsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  skuProfileId: 'skuProfileId',
  snapshotId: 'snapshotId',
  orderId: 'orderId',
  status: 'status',
  quantity: 'quantity',
  idempotencyKey: 'idempotencyKey',
  expiresAt: 'expiresAt',
  committedAt: 'committedAt',
  releasedAt: 'releasedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_nodesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  code: 'code',
  region: 'region',
  nodeGroupId: 'nodeGroupId',
  status: 'status',
  managementHost: 'managementHost',
  managementPort: 'managementPort',
  managementBasePathEncrypted: 'managementBasePathEncrypted',
  apiTokenEncrypted: 'apiTokenEncrypted',
  tlsMode: 'tlsMode',
  tlsServerName: 'tlsServerName',
  buildId: 'buildId',
  capabilityVersion: 'capabilityVersion',
  capacityUnits: 'capacityUnits',
  allocatedUnits: 'allocatedUnits',
  reservedUnits: 'reservedUnits',
  lastHealthyAt: 'lastHealthyAt',
  consecutiveFailures: 'consecutiveFailures',
  healthIncidentVersion: 'healthIncidentVersion',
  healthIncidentOpen: 'healthIncidentOpen',
  drainReason: 'drainReason',
  configVersion: 'configVersion',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_node_profilesScalarFieldEnum = {
  id: 'id',
  nodeId: 'nodeId',
  skuProfileId: 'skuProfileId',
  status: 'status',
  remoteInboundId: 'remoteInboundId',
  remoteInboundTag: 'remoteInboundTag',
  listenPort: 'listenPort',
  clientConfig: 'clientConfig',
  observedVersion: 'observedVersion',
  observedConfigHash: 'observedConfigHash',
  lastErrorCode: 'lastErrorCode',
  lastReconciledAt: 'lastReconciledAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_linesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  userId: 'userId',
  orderId: 'orderId',
  skuProfileId: 'skuProfileId',
  status: 'status',
  currentNodeId: 'currentNodeId',
  currentExitId: 'currentExitId',
  clientEmail: 'clientEmail',
  clientIdentityEncrypted: 'clientIdentityEncrypted',
  expiresAt: 'expiresAt',
  desiredVersion: 'desiredVersion',
  activeMigrationId: 'activeMigrationId',
  lastObservedVersion: 'lastObservedVersion',
  lastObservedConfigHash: 'lastObservedConfigHash',
  failureReason: 'failureReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_line_projectionsScalarFieldEnum = {
  id: 'id',
  lineId: 'lineId',
  nodeId: 'nodeId',
  projectionKey: 'projectionKey',
  status: 'status',
  desiredVersion: 'desiredVersion',
  observedVersion: 'observedVersion',
  observedConfigHash: 'observedConfigHash',
  lastErrorCode: 'lastErrorCode',
  nextRunAt: 'nextRunAt',
  appliedAt: 'appliedAt',
  removedAt: 'removedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_exitsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  providerAccountId: 'providerAccountId',
  providerCode: 'providerCode',
  upstreamExitId: 'upstreamExitId',
  status: 'status',
  countryCode: 'countryCode',
  host: 'host',
  port: 'port',
  usernameEncrypted: 'usernameEncrypted',
  passwordEncrypted: 'passwordEncrypted',
  expiresAt: 'expiresAt',
  identityFingerprint: 'identityFingerprint',
  observedEgressIp: 'observedEgressIp',
  lastHealthyAt: 'lastHealthyAt',
  maxFanout: 'maxFanout',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_exit_reservationsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  orderId: 'orderId',
  migrationId: 'migrationId',
  exitId: 'exitId',
  status: 'status',
  quantity: 'quantity',
  idempotencyKey: 'idempotencyKey',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_line_endpointsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  lineId: 'lineId',
  role: 'role',
  status: 'status',
  hostname: 'hostname',
  port: 'port',
  dnsRecordId: 'dnsRecordId',
  verifiedAt: 'verifiedAt',
  lastObservedTarget: 'lastObservedTarget',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_line_migrationsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  lineId: 'lineId',
  sourceNodeId: 'sourceNodeId',
  targetNodeId: 'targetNodeId',
  targetExitId: 'targetExitId',
  type: 'type',
  phase: 'phase',
  status: 'status',
  idempotencyKey: 'idempotencyKey',
  requestedBy: 'requestedBy',
  reason: 'reason',
  desiredVersion: 'desiredVersion',
  sourceVersion: 'sourceVersion',
  payloadHash: 'payloadHash',
  rollbackSnapshot: 'rollbackSnapshot',
  failureReason: 'failureReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  completedAt: 'completedAt'
};

exports.Prisma.Dedicated_line_placement_policiesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  tenantId: 'tenantId',
  userId: 'userId',
  skuProfileId: 'skuProfileId',
  nodeGroupId: 'nodeGroupId',
  inboundProfileId: 'inboundProfileId',
  mode: 'mode',
  targetReplicaCount: 'targetReplicaCount',
  minReadyReplicaCount: 'minReadyReplicaCount',
  maxUnitsPerNode: 'maxUnitsPerNode',
  priority: 'priority',
  status: 'status',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Line_placement_policy_nodesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  policyId: 'policyId',
  nodeId: 'nodeId',
  maxUnits: 'maxUnits',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_line_domainsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  lineId: 'lineId',
  migrationId: 'migrationId',
  changeId: 'changeId',
  role: 'role',
  status: 'status',
  hostname: 'hostname',
  port: 'port',
  isCurrent: 'isCurrent',
  verifiedAt: 'verifiedAt',
  retiredAt: 'retiredAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_line_domain_changesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  lineId: 'lineId',
  idempotencyKey: 'idempotencyKey',
  payloadHash: 'payloadHash',
  response: 'response',
  reason: 'reason',
  requestedBy: 'requestedBy',
  createdAt: 'createdAt'
};

exports.Prisma.Dedicated_line_migration_nodesScalarFieldEnum = {
  id: 'id',
  migrationId: 'migrationId',
  nodeId: 'nodeId',
  role: 'role',
  status: 'status',
  capacityUnits: 'capacityUnits',
  reservedAt: 'reservedAt',
  releasedAt: 'releasedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_line_migration_commandsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  migrationId: 'migrationId',
  kind: 'kind',
  idempotencyKey: 'idempotencyKey',
  payloadHash: 'payloadHash',
  response: 'response',
  createdAt: 'createdAt'
};

exports.Prisma.Delivery_routesScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  lineId: 'lineId',
  migrationId: 'migrationId',
  migrationStage: 'migrationStage',
  idempotencyKey: 'idempotencyKey',
  sourceVersion: 'sourceVersion',
  isStaged: 'isStaged',
  isCurrent: 'isCurrent',
  targetNodeId: 'targetNodeId',
  targetPort: 'targetPort',
  evidence: 'evidence',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_line_smoke_observationsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  lineId: 'lineId',
  migrationId: 'migrationId',
  stage: 'stage',
  status: 'status',
  verified: 'verified',
  observedIp: 'observedIp',
  observedCountry: 'observedCountry',
  latencyMs: 'latencyMs',
  stabilityPass: 'stabilityPass',
  failureReason: 'failureReason',
  checkedAt: 'checkedAt',
  createdAt: 'createdAt'
};

exports.Prisma.Control_node_health_observationsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  nodeId: 'nodeId',
  status: 'status',
  observedVersion: 'observedVersion',
  observedHash: 'observedHash',
  failureReason: 'failureReason',
  checkedAt: 'checkedAt',
  createdAt: 'createdAt'
};

exports.Prisma.Dedicated_line_migration_recommendationsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  lineId: 'lineId',
  nodeId: 'nodeId',
  migrationId: 'migrationId',
  incidentVersion: 'incidentVersion',
  status: 'status',
  reason: 'reason',
  candidateNodeIds: 'candidateNodeIds',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Control_node_health_alert_outboxScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  nodeId: 'nodeId',
  incidentVersion: 'incidentVersion',
  topic: 'topic',
  dedupeKey: 'dedupeKey',
  payload: 'payload',
  status: 'status',
  attempts: 'attempts',
  maxAttempts: 'maxAttempts',
  nextRunAt: 'nextRunAt',
  leaseOwner: 'leaseOwner',
  leaseExpiresAt: 'leaseExpiresAt',
  lastError: 'lastError',
  lastErrorCode: 'lastErrorCode',
  sentAt: 'sentAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.Dedicated_control_jobsScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  kind: 'kind',
  aggregateId: 'aggregateId',
  status: 'status',
  idempotencyKey: 'idempotencyKey',
  desiredVersion: 'desiredVersion',
  attempts: 'attempts',
  maxAttempts: 'maxAttempts',
  payload: 'payload',
  nextRunAt: 'nextRunAt',
  leaseOwner: 'leaseOwner',
  leaseExpiresAt: 'leaseExpiresAt',
  purchaseStartedAt: 'purchaseStartedAt',
  upstreamOrderId: 'upstreamOrderId',
  lastErrorCode: 'lastErrorCode',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  completedAt: 'completedAt'
};

exports.Prisma.Dedicated_inventory_alert_outboxScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  skuProfileId: 'skuProfileId',
  snapshotId: 'snapshotId',
  event: 'event',
  dedupeKey: 'dedupeKey',
  available: 'available',
  requested: 'requested',
  capturedAt: 'capturedAt',
  freshnessTtlSeconds: 'freshnessTtlSeconds',
  status: 'status',
  attempts: 'attempts',
  maxAttempts: 'maxAttempts',
  nextRunAt: 'nextRunAt',
  leaseOwner: 'leaseOwner',
  leaseExpiresAt: 'leaseExpiresAt',
  lastError: 'lastError',
  lastErrorCode: 'lastErrorCode',
  sentAt: 'sentAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};
exports.SiteStatus = exports.$Enums.SiteStatus = {
  ACTIVE: 'ACTIVE',
  MAINTENANCE: 'MAINTENANCE',
  DISABLED: 'DISABLED'
};

exports.TenantStatus = exports.$Enums.TenantStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED'
};

exports.UserStatus = exports.$Enums.UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED'
};

exports.KycStatus = exports.$Enums.KycStatus = {
  NONE: 'NONE',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

exports.RiskStatus = exports.$Enums.RiskStatus = {
  NORMAL: 'NORMAL',
  FLAGGED: 'FLAGGED',
  BLOCKED: 'BLOCKED'
};

exports.AdminRole = exports.$Enums.AdminRole = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  TENANT_ADMIN: 'TENANT_ADMIN',
  OPERATOR: 'OPERATOR'
};

exports.AdminStatus = exports.$Enums.AdminStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED'
};

exports.OwnerType = exports.$Enums.OwnerType = {
  USER: 'USER',
  ADMIN_USER: 'ADMIN_USER'
};

exports.ApiKeyOwnerType = exports.$Enums.ApiKeyOwnerType = {
  USER: 'USER',
  TENANT_ADMIN: 'TENANT_ADMIN'
};

exports.ApiKeyStatus = exports.$Enums.ApiKeyStatus = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED'
};

exports.LedgerEntryType = exports.$Enums.LedgerEntryType = {
  DEPOSIT: 'DEPOSIT',
  DEBIT: 'DEBIT',
  REFUND: 'REFUND',
  ADJUSTMENT: 'ADJUSTMENT',
  FREEZE: 'FREEZE',
  UNFREEZE: 'UNFREEZE',
  RENEWAL: 'RENEWAL',
  COMMISSION: 'COMMISSION'
};

exports.PaymentChannel = exports.$Enums.PaymentChannel = {
  MANUAL: 'MANUAL',
  YIPAY: 'YIPAY',
  ALIPAY: 'ALIPAY'
};

exports.PaymentOrderStatus = exports.$Enums.PaymentOrderStatus = {
  PENDING: 'PENDING',
  CONFIRMING: 'CONFIRMING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED'
};

exports.AuditActorType = exports.$Enums.AuditActorType = {
  USER: 'USER',
  ADMIN_USER: 'ADMIN_USER',
  SYSTEM: 'SYSTEM',
  APIKEY: 'APIKEY'
};

exports.UpstreamRequestStatus = exports.$Enums.UpstreamRequestStatus = {
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  TIMEOUT: 'TIMEOUT'
};

exports.ProviderAccountStatus = exports.$Enums.ProviderAccountStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED'
};

exports.ResourceType = exports.$Enums.ResourceType = {
  COUNTRY: 'COUNTRY',
  REGION: 'REGION',
  ZONE: 'ZONE'
};

exports.IpType = exports.$Enums.IpType = {
  NATIVE: 'NATIVE',
  BROADCAST: 'BROADCAST',
  BOTH: 'BOTH'
};

exports.Protocol = exports.$Enums.Protocol = {
  HTTP: 'HTTP',
  SOCKS5: 'SOCKS5',
  BOTH: 'BOTH'
};

exports.ResourceStatus = exports.$Enums.ResourceStatus = {
  ACTIVE: 'ACTIVE',
  HIDDEN: 'HIDDEN',
  DISABLED: 'DISABLED'
};

exports.OrderType = exports.$Enums.OrderType = {
  STATIC_PROXY_BUY: 'STATIC_PROXY_BUY',
  STATIC_PROXY_RENEW: 'STATIC_PROXY_RENEW',
  DEDICATED_LINE_BUY: 'DEDICATED_LINE_BUY',
  DEDICATED_LINE_RENEW: 'DEDICATED_LINE_RENEW'
};

exports.OrderStatus = exports.$Enums.OrderStatus = {
  PENDING: 'PENDING',
  FULFILLING: 'FULFILLING',
  COMPLETED: 'COMPLETED',
  PARTIALLY_COMPLETED: 'PARTIALLY_COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED'
};

exports.FulfillmentJobStatus = exports.$Enums.FulfillmentJobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  RETRYING: 'RETRYING'
};

exports.ProxyInstanceProtocol = exports.$Enums.ProxyInstanceProtocol = {
  HTTP: 'HTTP',
  SOCKS5: 'SOCKS5'
};

exports.ProxyInstanceIpType = exports.$Enums.ProxyInstanceIpType = {
  NATIVE: 'NATIVE',
  BROADCAST: 'BROADCAST'
};

exports.ProxyStatus = exports.$Enums.ProxyStatus = {
  DELIVERING: 'DELIVERING',
  ACTIVE: 'ACTIVE',
  EXPIRING: 'EXPIRING',
  EXPIRED: 'EXPIRED',
  RELEASING: 'RELEASING',
  RELEASED: 'RELEASED',
  FAILED: 'FAILED'
};

exports.UpstreamApiAccountStatus = exports.$Enums.UpstreamApiAccountStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED'
};

exports.TicketStatus = exports.$Enums.TicketStatus = {
  OPEN: 'OPEN',
  PENDING: 'PENDING',
  CLOSED: 'CLOSED'
};

exports.TicketMessageAuthorType = exports.$Enums.TicketMessageAuthorType = {
  USER: 'USER',
  ADMIN_USER: 'ADMIN_USER'
};

exports.DedicatedSkuStatus = exports.$Enums.DedicatedSkuStatus = {
  ACTIVE: 'ACTIVE',
  HIDDEN: 'HIDDEN',
  DISABLED: 'DISABLED'
};

exports.DedicatedClientProtocol = exports.$Enums.DedicatedClientProtocol = {
  VMESS: 'VMESS',
  VLESS: 'VLESS',
  SOCKS5: 'SOCKS5'
};

exports.DedicatedInventoryReservationStatus = exports.$Enums.DedicatedInventoryReservationStatus = {
  RESERVED: 'RESERVED',
  COMMITTED: 'COMMITTED',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED'
};

exports.DedicatedNodeStatus = exports.$Enums.DedicatedNodeStatus = {
  NOT_READY: 'NOT_READY',
  ACTIVE: 'ACTIVE',
  DRAINING: 'DRAINING',
  UNHEALTHY: 'UNHEALTHY',
  DISABLED: 'DISABLED'
};

exports.DedicatedTlsMode = exports.$Enums.DedicatedTlsMode = {
  IP_CERT: 'IP_CERT',
  PRIVATE_NETWORK: 'PRIVATE_NETWORK'
};

exports.DedicatedNodeProfileStatus = exports.$Enums.DedicatedNodeProfileStatus = {
  PENDING: 'PENDING',
  READY: 'READY',
  ERROR: 'ERROR',
  DISABLED: 'DISABLED'
};

exports.DedicatedLineStatus = exports.$Enums.DedicatedLineStatus = {
  PENDING_EXIT: 'PENDING_EXIT',
  PROVISIONING: 'PROVISIONING',
  ACTIVE: 'ACTIVE',
  DEGRADED: 'DEGRADED',
  MIGRATING: 'MIGRATING',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED'
};

exports.DedicatedProjectionStatus = exports.$Enums.DedicatedProjectionStatus = {
  PENDING: 'PENDING',
  APPLYING: 'APPLYING',
  ACTIVE: 'ACTIVE',
  RETRY_WAIT: 'RETRY_WAIT',
  FAILED: 'FAILED',
  DISABLED: 'DISABLED',
  DELETED: 'DELETED'
};

exports.DedicatedExitStatus = exports.$Enums.DedicatedExitStatus = {
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  PURCHASING: 'PURCHASING',
  ACTIVE: 'ACTIVE',
  UNHEALTHY: 'UNHEALTHY',
  EXPIRED: 'EXPIRED',
  RELEASED: 'RELEASED',
  FAILED: 'FAILED'
};

exports.DedicatedReservationStatus = exports.$Enums.DedicatedReservationStatus = {
  RESERVED: 'RESERVED',
  COMMITTED: 'COMMITTED',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED'
};

exports.DedicatedEndpointRole = exports.$Enums.DedicatedEndpointRole = {
  PRIMARY: 'PRIMARY',
  STANDBY: 'STANDBY'
};

exports.DedicatedEndpointStatus = exports.$Enums.DedicatedEndpointStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED',
  FAILED: 'FAILED'
};

exports.DedicatedMigrationType = exports.$Enums.DedicatedMigrationType = {
  NODE_ONLY: 'NODE_ONLY',
  EXIT_ONLY: 'EXIT_ONLY',
  FULL: 'FULL'
};

exports.DedicatedMigrationPhase = exports.$Enums.DedicatedMigrationPhase = {
  PREPARE: 'PREPARE',
  CANARY_ROUTE: 'CANARY_ROUTE',
  VERIFY: 'VERIFY',
  CUTOVER_ROUTE: 'CUTOVER_ROUTE',
  COMMIT: 'COMMIT',
  CLEANUP: 'CLEANUP'
};

exports.DedicatedMigrationStatus = exports.$Enums.DedicatedMigrationStatus = {
  REQUESTED: 'REQUESTED',
  PREPARING_TARGET: 'PREPARING_TARGET',
  VERIFYING_TARGET: 'VERIFYING_TARGET',
  SWITCHING_ENDPOINT: 'SWITCHING_ENDPOINT',
  CLEANING_SOURCE: 'CLEANING_SOURCE',
  COMPLETED: 'COMPLETED',
  ROLLING_BACK: 'ROLLING_BACK',
  ROLLED_BACK: 'ROLLED_BACK',
  FAILED: 'FAILED',
  NEEDS_OPERATOR: 'NEEDS_OPERATOR',
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED'
};

exports.DedicatedPlacementMode = exports.$Enums.DedicatedPlacementMode = {
  FIXED: 'FIXED',
  REPLICATED: 'REPLICATED'
};

exports.DedicatedPlacementPolicyStatus = exports.$Enums.DedicatedPlacementPolicyStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED'
};

exports.DedicatedLineDomainRole = exports.$Enums.DedicatedLineDomainRole = {
  PRIMARY: 'PRIMARY',
  BACKUP: 'BACKUP'
};

exports.DedicatedLineDomainStatus = exports.$Enums.DedicatedLineDomainStatus = {
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED'
};

exports.DedicatedMigrationNodeRole = exports.$Enums.DedicatedMigrationNodeRole = {
  SOURCE: 'SOURCE',
  TARGET: 'TARGET',
  RETAINED: 'RETAINED'
};

exports.DedicatedMigrationNodeStatus = exports.$Enums.DedicatedMigrationNodeStatus = {
  RESERVED: 'RESERVED',
  READY: 'READY',
  RELEASED: 'RELEASED',
  FAILED: 'FAILED'
};

exports.DedicatedMigrationCommandKind = exports.$Enums.DedicatedMigrationCommandKind = {
  COMMIT: 'COMMIT',
  CANCEL: 'CANCEL'
};

exports.DedicatedMigrationStage = exports.$Enums.DedicatedMigrationStage = {
  INITIAL: 'INITIAL',
  CANARY: 'CANARY',
  CUTOVER: 'CUTOVER',
  ROLLBACK: 'ROLLBACK'
};

exports.DedicatedMigrationSmokeStatus = exports.$Enums.DedicatedMigrationSmokeStatus = {
  PENDING: 'PENDING',
  PASSED: 'PASSED',
  FAILED: 'FAILED'
};

exports.DedicatedControlNodeHealthStatus = exports.$Enums.DedicatedControlNodeHealthStatus = {
  HEALTHY: 'HEALTHY',
  FAILED: 'FAILED'
};

exports.DedicatedMigrationRecommendationStatus = exports.$Enums.DedicatedMigrationRecommendationStatus = {
  OPEN: 'OPEN',
  ACCEPTED: 'ACCEPTED',
  DISMISSED: 'DISMISSED',
  RESOLVED: 'RESOLVED'
};

exports.DedicatedInventoryAlertStatus = exports.$Enums.DedicatedInventoryAlertStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  RETRY_WAIT: 'RETRY_WAIT',
  SENT: 'SENT',
  FAILED: 'FAILED'
};

exports.DedicatedControlJobKind = exports.$Enums.DedicatedControlJobKind = {
  PURCHASE_EXIT: 'PURCHASE_EXIT',
  APPLY_PROJECTION: 'APPLY_PROJECTION',
  VERIFY_PROJECTION: 'VERIFY_PROJECTION',
  HEALTH_CHECK: 'HEALTH_CHECK',
  MIGRATE_LINE: 'MIGRATE_LINE',
  REMOVE_PROJECTION: 'REMOVE_PROJECTION',
  RELEASE_EXIT: 'RELEASE_EXIT',
  VERIFY_DEDICATED_LINE_MIGRATION: 'VERIFY_DEDICATED_LINE_MIGRATION',
  CLEANUP_DEDICATED_LINE_MIGRATION: 'CLEANUP_DEDICATED_LINE_MIGRATION',
  DELETE_DEDICATED_LINE_PROJECTION: 'DELETE_DEDICATED_LINE_PROJECTION'
};

exports.DedicatedControlJobStatus = exports.$Enums.DedicatedControlJobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  RETRY_WAIT: 'RETRY_WAIT',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  NEEDS_OPERATOR: 'NEEDS_OPERATOR'
};

exports.DedicatedInventoryAlertEvent = exports.$Enums.DedicatedInventoryAlertEvent = {
  STALE: 'STALE',
  EXHAUSTED: 'EXHAUSTED'
};

exports.Prisma.ModelName = {
  sites: 'sites',
  site_announcements: 'site_announcements',
  tenants: 'tenants',
  users: 'users',
  admin_users: 'admin_users',
  sessions: 'sessions',
  api_keys: 'api_keys',
  wallets: 'wallets',
  ledger_entries: 'ledger_entries',
  payment_orders: 'payment_orders',
  audit_logs: 'audit_logs',
  system_settings: 'system_settings',
  upstream_request_logs: 'upstream_request_logs',
  provider_accounts: 'provider_accounts',
  platform_resources: 'platform_resources',
  inventory_snapshots: 'inventory_snapshots',
  resource_mappings: 'resource_mappings',
  price_templates: 'price_templates',
  price_rules: 'price_rules',
  price_overrides: 'price_overrides',
  user_price_bindings: 'user_price_bindings',
  user_resource_price_overrides: 'user_resource_price_overrides',
  orders: 'orders',
  fulfillment_jobs: 'fulfillment_jobs',
  upstream_order_mirrors: 'upstream_order_mirrors',
  proxy_instances: 'proxy_instances',
  upstream_api_accounts: 'upstream_api_accounts',
  tickets: 'tickets',
  ticket_messages: 'ticket_messages',
  notifications: 'notifications',
  dedicated_sku_profiles: 'dedicated_sku_profiles',
  dedicated_inventory_snapshots: 'dedicated_inventory_snapshots',
  dedicated_inventory_reservations: 'dedicated_inventory_reservations',
  dedicated_nodes: 'dedicated_nodes',
  dedicated_node_profiles: 'dedicated_node_profiles',
  dedicated_lines: 'dedicated_lines',
  dedicated_line_projections: 'dedicated_line_projections',
  dedicated_exits: 'dedicated_exits',
  dedicated_exit_reservations: 'dedicated_exit_reservations',
  dedicated_line_endpoints: 'dedicated_line_endpoints',
  dedicated_line_migrations: 'dedicated_line_migrations',
  dedicated_line_placement_policies: 'dedicated_line_placement_policies',
  line_placement_policy_nodes: 'line_placement_policy_nodes',
  dedicated_line_domains: 'dedicated_line_domains',
  dedicated_line_domain_changes: 'dedicated_line_domain_changes',
  dedicated_line_migration_nodes: 'dedicated_line_migration_nodes',
  dedicated_line_migration_commands: 'dedicated_line_migration_commands',
  delivery_routes: 'delivery_routes',
  dedicated_line_smoke_observations: 'dedicated_line_smoke_observations',
  control_node_health_observations: 'control_node_health_observations',
  dedicated_line_migration_recommendations: 'dedicated_line_migration_recommendations',
  control_node_health_alert_outbox: 'control_node_health_alert_outbox',
  dedicated_control_jobs: 'dedicated_control_jobs',
  dedicated_inventory_alert_outbox: 'dedicated_inventory_alert_outbox'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
