export type LegacyApiV1RequestLike = {
  url?: string;
  originalUrl?: string;
  raw?: {
    url?: string;
    originalUrl?: string;
  };
};

export type LegacyApiV1RewriteRequest = {
  method?: string;
  url?: string;
};

export type LegacyApiV1Alias = Readonly<{
  method: 'GET' | 'POST';
  from: string;
  to: string;
}>;

/**
 * Only routes whose legacy method and canonical method/path are equivalent may
 * be listed here. Compatibility-specific routes stay on the v1 controller so
 * they can translate DTOs and enforce the legacy feature gate.
 */
export const LEGACY_API_V1_ALIASES: readonly LegacyApiV1Alias[] = [
];

export function isLegacyApiV1Path(value: string | undefined): boolean {
  if (!value) return false;
  const { path } = splitUrl(value);
  return path === '/api/v1' || path.startsWith('/api/v1/');
}

export function isLegacyApiV1Request(request: LegacyApiV1RequestLike): boolean {
  return legacyRequestUrlCandidates(request).some(isLegacyApiV1Path);
}

export function legacyApiV1RequestPath(request: LegacyApiV1RequestLike): string {
  const candidates = legacyRequestUrlCandidates(request);
  const value = candidates.find(isLegacyApiV1Path) ?? candidates.find(Boolean) ?? '/api/v1';
  return splitUrl(value).path || '/api/v1';
}

/**
 * Resolves one allowlisted legacy URL to its canonical URL. The query suffix is
 * copied without parsing or decoding so pagination, signatures, and duplicate
 * parameters retain their original representation.
 */
export function resolveLegacyApiV1Alias(
  method: string | undefined,
  value: string | undefined,
): string | undefined {
  if (!method || !value) return undefined;

  const { path, query } = splitUrl(value);
  const normalizedMethod = method.toUpperCase();
  for (const alias of LEGACY_API_V1_ALIASES) {
    if (alias.method !== normalizedMethod) continue;
    const params = matchAliasPath(alias.from, path);
    if (!params) continue;
    return replaceAliasParams(alias.to, params) + query;
  }
  return undefined;
}

/**
 * Creates the Fastify `rewriteUrl` callback. Keeping the enablement decision at
 * bootstrap prevents aliases from bypassing the existing legacy API switch.
 */
export function createLegacyApiV1RewriteUrl(options: { enabled: boolean }): (request: LegacyApiV1RewriteRequest) => string {
  return (request) => {
    const value = request.url ?? '';
    if (!options.enabled) return value;
    return resolveLegacyApiV1Alias(request.method, value) ?? value;
  };
}

function splitUrl(value: string): { path: string; query: string } {
  const queryIndex = value.indexOf('?');
  if (queryIndex < 0) return { path: value, query: '' };
  return { path: value.slice(0, queryIndex), query: value.slice(queryIndex) };
}

function legacyRequestUrlCandidates(request: LegacyApiV1RequestLike): string[] {
  return [request.raw?.originalUrl, request.originalUrl, request.raw?.url, request.url].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

function matchAliasPath(template: string, path: string): Record<string, string> | undefined {
  const templateParts = template.split('/');
  const pathParts = path.split('/');
  if (templateParts.length !== pathParts.length) return undefined;

  const params: Record<string, string> = {};
  for (let index = 0; index < templateParts.length; index += 1) {
    const templatePart = templateParts[index];
    const pathPart = pathParts[index];
    if (templatePart === undefined || pathPart === undefined) return undefined;
    if (templatePart.startsWith(':')) {
      if (!pathPart) return undefined;
      params[templatePart.slice(1)] = pathPart;
      continue;
    }
    if (templatePart !== pathPart) return undefined;
  }
  return params;
}

function replaceAliasParams(template: string, params: Record<string, string>): string {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => params[name] ?? '');
}
