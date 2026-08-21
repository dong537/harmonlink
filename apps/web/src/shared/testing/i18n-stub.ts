type TranslateOptions = Record<string, unknown> & { defaultValue?: unknown };

/**
 * 忠于 i18next `t(key, options)` 契约的测试替身：
 * 第二参数是 options 对象，`defaultValue` 是缺失 key 的回退，其余键参与 `{{var}}` 插值。
 * 直接返回 options 对象会把它渲染成 React child 并抛
 * "Objects are not valid as a React child"，因此这里必须解出字符串。
 */
export function translateStub(
  key: string,
  options?: TranslateOptions,
  overrides?: Record<string, string>,
): string {
  const override = overrides?.[key];
  if (override !== undefined) return override;

  const base = options && 'defaultValue' in options ? options.defaultValue : key;
  const template = typeof base === 'string' ? base : key;
  if (!options) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = options[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * `vi.mock('react-i18next', () => createI18nStub(...))` 的通用实现。
 * `overrides` 用于个别用例断言的具体文案；`language` 用于多语言分支。
 */
export function createI18nStub(options?: {
  overrides?: Record<string, string>;
  language?: () => string;
}) {
  const resolveLanguage = options?.language ?? (() => 'zh-CN');
  return {
    useTranslation: () => ({
      t: (key: string, opts?: TranslateOptions) => translateStub(key, opts, options?.overrides),
      i18n: {
        get resolvedLanguage() {
          return resolveLanguage();
        },
        get language() {
          return resolveLanguage();
        },
        changeLanguage: () => Promise.resolve(),
      },
    }),
  };
}
