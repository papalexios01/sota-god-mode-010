import type { Reference, SERPAnalysis } from "./types";

export function appendReferencesIfMissing(html: string, refs?: Reference[] | null, serp?: SERPAnalysis | null): string {
  const hasRefs = /<h2[^>]*>\s*(references|sources)\s*<\/h2>/i.test(html || "");
  if (hasRefs) return html;

  const items: { title: string; url: string }[] = [];

  for (const r of refs || []) {
    if (r?.title && r?.url) items.push({ title: r.title, url: r.url });
  }
  for (const c of serp?.topCompetitors || []) {
    if (c?.title && c?.url) items.push({ title: c.title, url: c.url });
  }

  const dedup = new Map<string, { title: string; url: string }>();
  for (const it of items) {
    const key = (it.url || "").trim().toLowerCase();
    if (!key) continue;
    if (!dedup.has(key)) dedup.set(key, it);
  }
  const finalItems = Array.from(dedup.values()).slice(0, 10);
  if (finalItems.length === 0) return html;

  const esc = (s: string) =>
    (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const block =
    `<h2>References</h2>` +
    `<ol>` +
    finalItems
      .map((it) => `<li><a href="${it.url}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a></li>`)
      .join("") +
    `</ol>`;

  return `${html}\n\n${block}`;
}
