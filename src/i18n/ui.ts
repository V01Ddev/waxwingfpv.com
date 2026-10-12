import tr from './tr.json';
import en from './en.json';

export const locales = ['tr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'tr';

/** BCP-47 tags for <html lang> and hreflang. */
export const htmlLang: Record<Locale, string> = { tr: 'tr', en: 'en' };

/** Open Graph locale format, which uses underscores. */
export const ogLocale: Record<Locale, string> = { tr: 'tr_TR', en: 'en_US' };

/** Shown in the language switcher, each in its own language. */
export const localeLabel: Record<Locale, string> = { tr: 'Türkçe', en: 'English' };

/** Short form for the compact switcher. */
export const localeShort: Record<Locale, string> = { tr: 'TR', en: 'EN' };

const dictionaries = { tr, en } as const;

type Dict = { [key: string]: string | Dict };
export type UIKey = string;

/**
 * Dot-path lookup, falling back to the default locale and then to the key
 * itself. A missing English string degrades to Turkish rather than rendering
 * an empty element or throwing at build time — the whole point of shipping
 * both languages at launch without blocking on a full translation pass.
 */
function lookup(dict: Dict, path: string): string | undefined {
  const value = path
    .split('.')
    .reduce<string | Dict | undefined>(
      (acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined),
      dict
    );
  return typeof value === 'string' ? value : undefined;
}

export function t(locale: Locale, key: UIKey): string {
  return (
    lookup(dictionaries[locale] as Dict, key) ??
    lookup(dictionaries[defaultLocale] as Dict, key) ??
    key
  );
}

/** Pre-bound translator, for components that render many strings. */
export function translator(locale: Locale) {
  return (key: UIKey) => t(locale, key);
}

/**
 * Build a path in a given locale. The default locale has no prefix, so
 * `localePath('tr', '/work')` is `/work` and `localePath('en', '/work')` is
 * `/en/work`.
 */
export function localePath(locale: Locale, barePath = '/'): string {
  const clean = barePath.startsWith('/') ? barePath : `/${barePath}`;
  if (locale === defaultLocale) return clean;
  return clean === '/' ? `/${locale}/` : `/${locale}${clean}`;
}

/** The other locale, for the switcher. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'tr' ? 'en' : 'tr';
}

/**
 * Locale-keyed content fields (`{ tr: "...", en: "..." }`) with a fallback to
 * the default locale. Used by every content collection.
 */
export function localized(
  field: Partial<Record<Locale, string>> | string | undefined,
  locale: Locale
): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[locale] ?? field[defaultLocale] ?? '';
}

/** Same, for arrays of locale-keyed strings. */
export function localizedList(
  field: Partial<Record<Locale, string[]>> | undefined,
  locale: Locale
): string[] {
  if (!field) return [];
  return field[locale] ?? field[defaultLocale] ?? [];
}
