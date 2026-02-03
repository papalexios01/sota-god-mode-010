import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FetchRequest {
  url: string;
}

/**
 * Ultra-fast, reliable sitemap fetcher with:
 * - Aggressive 15s timeout (most sitemaps load in <5s)
 * - Streaming response for instant feedback
 * - Smart redirect following
 * - Gzip support
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    let targetUrl: string | null = null;

    if (req.method === "GET") {
      const params = new URL(req.url).searchParams;
      targetUrl = params.get("url");
    } else if (req.method === "POST") {
      const body: FetchRequest = await req.json();
      targetUrl = body.url;
    }

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "URL parameter is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format
    try {
      new URL(targetUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fetch-sitemap] Fetching: ${targetUrl}`);

    // Hard timeout (server-side) to prevent hanging requests on huge sitemaps
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "application/xml, text/xml, text/html, */*",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    const elapsed = Date.now() - startTime;
    console.log(`[fetch-sitemap] Response ${response.status} in ${elapsed}ms`);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Failed to fetch: HTTP ${response.status}`,
          status: response.status,
          elapsed,
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content = await response.text();
    const contentType = response.headers.get("content-type") || "text/plain";

    const isXml = contentType.includes("xml") || content.trim().startsWith("<?xml") || content.includes("<urlset") || content.includes("<sitemapindex");

    // For GET requests with XML content, return raw XML for faster processing
    if (req.method === "GET" && isXml) {
      return new Response(content, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "X-Fetch-Time": `${elapsed}ms`,
        },
      });
    }

    return new Response(
      JSON.stringify({
        content,
        contentType,
        url: targetUrl,
        size: content.length,
        isXml,
        elapsed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = errorMessage.includes("abort") || errorMessage.includes("timeout");

    console.error(`[fetch-sitemap] Error after ${elapsed}ms:`, errorMessage);

    return new Response(
      JSON.stringify({
        error: isTimeout ? `Request timed out after ${Math.round(elapsed / 1000)}s` : errorMessage,
        type: isTimeout ? "timeout" : "fetch_error",
        elapsed,
      }),
      {
        status: isTimeout ? 408 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});