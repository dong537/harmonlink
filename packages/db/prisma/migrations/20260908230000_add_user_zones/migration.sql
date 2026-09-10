-- User-owned zones are independent from provider inventory resources.
CREATE TYPE "UserZoneStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "user_zones" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "UserZoneStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_zones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_zones_values_valid" CHECK (
      "code" = btrim("code")
      AND "code" = lower("code")
      AND "code" ~ '^[a-z0-9][a-z0-9_-]{1,63}$'
      AND length(btrim("name")) > 0
      AND "sortOrder" BETWEEN 0 AND 999
    )
);

CREATE UNIQUE INDEX "user_zones_scope_code_key"
  ON "user_zones"("siteId", "tenantId", "userId", "code");
CREATE UNIQUE INDEX "user_zones_scope_id_key"
  ON "user_zones"("siteId", "tenantId", "userId", "id");
CREATE INDEX "user_zones_scope_status_sortOrder_idx"
  ON "user_zones"("siteId", "tenantId", "userId", "status", "sortOrder");

CREATE UNIQUE INDEX "users_site_tenant_id_key" ON "users"("siteId", "tenantId", "id");
CREATE UNIQUE INDEX "tenants_site_id_key" ON "tenants"("siteId", "id");

ALTER TABLE "user_zones"
  ADD CONSTRAINT "user_zones_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "user_zones_siteId_tenantId_fkey"
    FOREIGN KEY ("siteId", "tenantId") REFERENCES "tenants"("siteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "user_zones_siteId_tenantId_userId_fkey"
    FOREIGN KEY ("siteId", "tenantId", "userId") REFERENCES "users"("siteId", "tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dedicated_line_orders" ADD COLUMN "zoneId" TEXT;
ALTER TABLE "dedicated_lines" ADD COLUMN "zoneId" TEXT;

CREATE INDEX "dedicated_line_orders_scope_zone_createdAt_idx"
  ON "dedicated_line_orders"("siteId", "tenantId", "userId", "zoneId", "createdAt");
CREATE INDEX "dedicated_lines_scope_zone_status_idx"
  ON "dedicated_lines"("siteId", "tenantId", "userId", "zoneId", "status");

ALTER TABLE "dedicated_line_orders"
  ADD CONSTRAINT "dedicated_line_orders_zone_scope_fkey"
    FOREIGN KEY ("siteId", "tenantId", "userId", "zoneId")
    REFERENCES "user_zones" ("siteId", "tenantId", "userId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dedicated_lines"
  ADD CONSTRAINT "dedicated_lines_zone_scope_fkey"
    FOREIGN KEY ("siteId", "tenantId", "userId", "zoneId")
    REFERENCES "user_zones" ("siteId", "tenantId", "userId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
