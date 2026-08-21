import { describe, it, expect } from 'vitest';
import { formatCustomerError } from './customer-error';
import { ApiError } from '../api/client';

const t = (key: string) => (key === 'error' ? '操作失败，请稍后重试' : key);

function translateWith(dictionary: Record<string, string>) {
  return (key: string) => dictionary[key] ?? t(key);
}

const NAMESPACE = 'customer.tickets.reason';

describe('formatCustomerError', () => {
  it('prefers the localized message when the namespace has a translation', () => {
    const translate = translateWith({ [`${NAMESPACE}.ticket_not_found`]: '工单不存在' });

    expect(formatCustomerError(new ApiError(404, 'ticket_not_found'), translate, NAMESPACE)).toBe('工单不存在');
  });

  it('exposes the backend reason code when localization is missing', () => {
    expect(formatCustomerError(new ApiError(404, 'ticket_not_found'), t, NAMESPACE)).toBe('ticket_not_found');
    expect(formatCustomerError(new ApiError(403, 'PERMISSION_DENIED'), t, NAMESPACE)).toBe('PERMISSION_DENIED');
  });

  it('suppresses server prose so raw failures never reach the customer', () => {
    const leaks = [
      'select * from users where id = $1 failed',
      'connect ECONNREFUSED 127.0.0.1:5432',
      'at Object.<anonymous> (/app/dist/main.js:12:9)',
      'duplicate key value violates unique constraint "users_email_key"',
      'a'.repeat(65),
      '',
      '500',
    ];

    for (const leak of leaks) {
      expect(formatCustomerError(new ApiError(500, leak), t, NAMESPACE)).toBe('操作失败，请稍后重试');
    }
  });

  it('falls back for non-ApiError failures and honors a custom fallback key', () => {
    expect(formatCustomerError(new Error('boom'), t, NAMESPACE)).toBe('操作失败，请稍后重试');
    expect(formatCustomerError(undefined, t, NAMESPACE)).toBe('操作失败，请稍后重试');
    expect(formatCustomerError(new Error('boom'), t, NAMESPACE, 'customer.tickets.loadFailed')).toBe(
      'customer.tickets.loadFailed',
    );
  });
});
