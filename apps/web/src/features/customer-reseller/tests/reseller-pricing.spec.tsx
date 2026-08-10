import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ResellerPricingFeature } from '../reseller-pricing.feature';
import { userApiRequest } from '../../../shared/api/client';
import { formatResourceLocationZh } from '../../../shared/resource/resource-labels';

const navigateMock = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => params?.name ?? params?.count ?? params?.days ?? key }),
}));

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>('../../../shared/api/client');
  return {
    ...actual,
    userApiRequest: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: () => '',
  } as unknown as CSSStyleDeclaration);
});

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ResellerPricingFeature', () => {
  it('uses the enabled reseller product pool for rule configuration and saves through the real reseller template endpoint', async () => {
    vi.mocked(userApiRequest)
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        total: 1,
        items: [
          {
            id: 'tpl-1',
            name: 'Default reseller pricing',
            description: '30 day default',
            isDefault: true,
            price_rules: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            resourceId: 'res-us-ny',
            code: 'US:NY-RECOMMENDED',
            name: 'US-New York Recommended',
            displayName: 'US-New York Recommended',
            providerCode: 'IPIPD',
            unitPrice: '28',
            currency: 'CNY',
            enabled: true,
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        total: 1,
        items: [],
      });

    renderWithQueryClient(<ResellerPricingFeature />);

    fireEvent.click(await screen.findByRole('button', { name: 'customer.reseller.pricing.configureRules' }));

    await waitFor(() => {
      expect(userApiRequest).toHaveBeenCalledWith('/api/customer/reseller/products?page=1&pageSize=20&status=ENABLED');
    });

    const resourceSelector = document.querySelector('#resourceIds');
    expect(resourceSelector).toBeTruthy();
    fireEvent.mouseDown(resourceSelector as Element);
    const localizedResource = formatResourceLocationZh({
      code: 'US:NY-RECOMMENDED',
      name: 'US-New York Recommended',
      displayName: 'US-New York Recommended',
    }).title;
    fireEvent.click(await screen.findByText(`${localizedResource} / 28 CNY`));
    expect(screen.queryByText(/US-New York Recommended/)).not.toBeInTheDocument();
    expect(screen.queryByText(/IPIPD/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() => {
      expect(userApiRequest).toHaveBeenCalledWith('/api/customer/reseller/templates/tpl-1/rules', {
        method: 'POST',
        body: JSON.stringify({
          rules: [
            {
              resourceId: 'res-us-ny',
              durationDays: 30,
              unitPrice: '35',
              currency: 'CNY',
              minQty: 1,
            },
          ],
        }),
      });
    });
    expect(vi.mocked(userApiRequest).mock.calls.some((call) => String(call[0]).startsWith('/api/resources'))).toBe(false);
  });
});
