import { useQuery } from '@tanstack/react-query';
import { userApiRequest } from '../api/client';

export interface SiteFeatures {
  staticProxyPurchaseEnabled: boolean;
}

interface CurrentSiteResponse {
  features?: Partial<SiteFeatures> | null;
}

const SITE_FEATURES_KEY = ['site', 'current', 'features'] as const;

/**
 * Feature switches owned by the API. The legacy static proxy path ships disabled,
 * so an unresolved query keeps its entry points hidden rather than flashing them.
 */
export function useSiteFeatures() {
  const query = useQuery({
    queryKey: SITE_FEATURES_KEY,
    queryFn: async (): Promise<SiteFeatures> => {
      const data = await userApiRequest<CurrentSiteResponse>('/api/sites/current');
      return { staticProxyPurchaseEnabled: data.features?.staticProxyPurchaseEnabled === true };
    },
    staleTime: 5 * 60 * 1000,
  });
  return { staticProxyPurchaseEnabled: query.data?.staticProxyPurchaseEnabled === true };
}
