-- Deprecated on purpose.
--
-- Provider credentials must be encrypted by the application boundary. This
-- file previously contained plaintext credentials and used an obsolete schema.
-- Configure an account with:
--
--   PROVIDER_CREDENTIAL_JSON='{"apikey":"...","zoneId":"..."}' \
--   pnpm --filter @ipeasy/api provider:set-credential \
--     --provider NINE_EIGHT_FIVE --site <site-id> \
--     --base-url https://open-api.985proxy.com --status ACTIVE
--
-- Use the same command for IPIPD with appId/appSecret. Keep all values in a
-- secret manager or process environment; never put them in SQL or Git.

\echo 'This SQL file is documentation only. Use provider:set-credential.'
\quit 1
