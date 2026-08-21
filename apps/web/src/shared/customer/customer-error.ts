import { ApiError } from '../api/client';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function formatCustomerError(
  error: unknown,
  t: Translate,
  namespace: string,
  fallbackKey = 'error',
): string {
  if (!(error instanceof ApiError)) return t(fallbackKey);
  const translationKey = `${namespace}.${error.reasonKey}`;
  const translated = t(translationKey);
  if (translated !== translationKey && translated !== error.reasonKey) return translated;
  // 本地化缺失时透出后端 reasonKey，避免用通用文案掩盖真实失败原因。
  // 但 client.ts 会把 json.msg 兜进 reasonKey，原始报错文案/堆栈可能落到这里，
  // 因此只透出 code 形状的短标识，其余仍回退到通用文案。
  return isReasonCode(error.reasonKey) ? error.reasonKey : t(fallbackKey);
}

function isReasonCode(reasonKey: string): boolean {
  return reasonKey.length <= 64 && /^[A-Za-z][A-Za-z0-9_]*$/.test(reasonKey);
}
