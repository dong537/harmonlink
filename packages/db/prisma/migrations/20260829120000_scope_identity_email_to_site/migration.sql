-- Identity email was globally unique, which contradicts the multi-site model:
-- all sites share one database, so the same person could not register on two
-- sites, and a signup collision on site A leaked the existence of an account on
-- site B. Scope both identity tables per site, matching tenants/service_skus.
--
-- admin_users is keyed on (siteId, email) rather than (siteId, tenantId, email):
-- tenantId is nullable for site-global admins and Postgres treats NULLs as
-- distinct, so a tenant-aware key would leave PLATFORM_ADMIN rows unconstrained.

DROP INDEX IF EXISTS "users_email_key";

CREATE UNIQUE INDEX "users_siteId_email_key"
ON "users"("siteId", "email");

DROP INDEX IF EXISTS "admin_users_email_key";

CREATE UNIQUE INDEX "admin_users_siteId_email_key"
ON "admin_users"("siteId", "email");
