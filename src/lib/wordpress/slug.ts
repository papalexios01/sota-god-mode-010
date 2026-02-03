// ============================================================
// WORDPRESS SLUG HELPERS
// Keep publish slugs stable for rewrites (derive from source URL)
// ============================================================

function normalizeUrlish(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export function getPathnameFromUrl(urlish?: string | null): string | null {
  const normalized = normalizeUrlish(urlish || '');
  if (!normalized) return null;
  try {
    const u = new URL(normalized);
    return u.pathname || '/';
  } catch {
    return null;
  }
}

export function getWordPressPostSlugFromUrl(urlish?: string | null): string | null {
  const pathname = getPathnameFromUrl(urlish);
  if (!pathname) return null;
  const trimmed = pathname.replace(/\/+$/, '');
  const parts = trimmed.split('/').filter(Boolean);
  const last = parts.at(-1);
  if (!last) return null;
  return toSafeWpSlug(last);
}

export function toSafeWpSlug(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
