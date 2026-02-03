function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractHttpUrls(raw: string, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  // Broad URL matcher; good for Jina “Markdown Content” output.
  const re = /https?:\/\/[^\s<>()\[\]"']+/gi;
  for (const m of raw.matchAll(re)) {
    const u = (m[0] || "").trim().replace(/[),.;]+$/g, "");
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= max) break;
  }

  return out;
}

function isIndexLikeSitemapUrl(targetUrl: string): boolean {
  try {
    const path = new URL(targetUrl).pathname.toLowerCase();
    return path === "/sitemap.xml" || path === "/wp-sitemap.xml" || path.endsWith("/sitemap_index.xml");
  } catch {
    return false;
  }
}

/**
 * r.jina.ai often returns a plain-text/markdown listing of URLs instead of XML.
 * This adapter converts that listing into valid sitemap XML so our crawler can parse it.
 */
export function adaptJinaMarkdownToSitemapXml(raw: string, targetUrl: string): string | null {
  // If it already looks like sitemap XML, don’t touch it.
  if (/<\s*(?:[A-Za-z_][\w.-]*:)?(urlset|sitemapindex)\b/i.test(raw)) return null;

  const urls = extractHttpUrls(raw, 50_000);
  if (urls.length === 0) return null;

  const indexLike = isIndexLikeSitemapUrl(targetUrl);
  if (indexLike) {
    const xmlLinks = urls.filter((u) => /(?:^|\/)[^\s?#]+\.xml(?:$|[?#])/i.test(u));
    if (xmlLinks.length > 0) {
      const items = xmlLinks
        .slice(0, 5_000)
        .map((u) => `  <sitemap><loc>${escapeXml(u)}</loc></sitemap>`)
        .join("\n");

      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        items,
        "</sitemapindex>",
      ].join("\n");
    }
  }

  // Default: treat as a urlset
  const items = urls
    .slice(0, 50_000)
    .map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`)
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    items,
    "</urlset>",
  ].join("\n");
}
