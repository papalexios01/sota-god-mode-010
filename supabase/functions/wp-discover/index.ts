const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type DiscoverRequest = {
  siteUrl: string;
  perPage?: number;
  maxPages?: number;
  maxUrls?: number;
  includePages?: boolean;
};

function normalizeOrigin(input: string): string {
  const t = input.trim();
  const withProto = t.startsWith("http://") || t.startsWith("https://") ? t : `https://${t}`;
  const url = new URL(withProto);
  return url.origin;
}

async function fetchWpLinks(
  origin: string,
  endpoint: "posts" | "pages",
  opts: { perPage: number; maxPages: number; maxUrls: number }
): Promise<string[]> {
  const perPage = Math.min(100, Math.max(1, opts.perPage));
  const maxPages = Math.max(1, opts.maxPages);
  const maxUrls = Math.max(1, opts.maxUrls);

  const out = new Set<string>();

  const mkUrl = (page: number) =>
    `${origin}/wp-json/wp/v2/${endpoint}?per_page=${perPage}&page=${page}&_fields=link`;

  const fetchPage = async (page: number) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(mkUrl(page), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      const totalPagesHeader = res.headers.get("x-wp-totalpages") || res.headers.get("X-WP-TotalPages");
      const totalPages = totalPagesHeader ? Number(totalPagesHeader) : undefined;

      if (!res.ok || !Array.isArray(json)) {
        return { links: [] as string[], totalPages };
      }

      const links: string[] = [];
      for (const item of json) {
        const link = (item as any)?.link;
        if (typeof link === "string" && link.startsWith("http")) links.push(link);
      }
      return { links, totalPages };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Page 1
  const first = await fetchPage(1);
  for (const l of first.links) {
    if (out.size >= maxUrls) break;
    out.add(l);
  }

  const totalPages = first.totalPages;
  const finalPage = totalPages ? Math.min(totalPages, maxPages) : maxPages;

  // Remaining pages in small parallel batches
  const concurrency = 4;
  let page = 2;
  while (page <= finalPage && out.size < maxUrls) {
    const batch = Array.from({ length: concurrency }, (_, i) => page + i).filter((p) => p <= finalPage);
    page += batch.length;

    const results = await Promise.all(batch.map((p) => fetchPage(p)));
    for (const r of results) {
      for (const l of r.links) {
        if (out.size >= maxUrls) break;
        out.add(l);
      }
      // If we don't know the total pages and got an empty batch, stop early.
      if (!totalPages && r.links.length === 0) {
        page = finalPage + 1;
        break;
      }
    }
  }

  return Array.from(out);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: DiscoverRequest = req.method === "GET"
      ? Object.fromEntries(new URL(req.url).searchParams.entries()) as any
      : await req.json();

    const siteUrl = (body as any)?.siteUrl;
    if (!siteUrl || typeof siteUrl !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "siteUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const origin = normalizeOrigin(siteUrl);
    const perPage = Number((body as any)?.perPage ?? 100);
    const maxPages = Number((body as any)?.maxPages ?? 250);
    const maxUrls = Number((body as any)?.maxUrls ?? 100000);
    const includePages = (body as any)?.includePages === false ? false : true;

    console.log(`[wp-discover] Discovering via WP API: ${origin} (perPage=${perPage}, maxPages=${maxPages})`);

    const urls = new Set<string>();

    const postLinks = await fetchWpLinks(origin, "posts", { perPage, maxPages, maxUrls });
    postLinks.forEach((u) => urls.add(u));

    if (includePages && urls.size < maxUrls) {
      const pageLinks = await fetchWpLinks(origin, "pages", { perPage, maxPages, maxUrls: maxUrls - urls.size });
      pageLinks.forEach((u) => urls.add(u));
    }

    console.log(`[wp-discover] Done: ${urls.size} URLs`);

    return new Response(
      JSON.stringify({ success: true, urls: Array.from(urls) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[wp-discover] Error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
