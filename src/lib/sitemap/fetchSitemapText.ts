import { adaptJinaMarkdownToSitemapXml } from "./jinaSitemapAdapter";

export type FetchSitemapTextConfig = {
  supabaseUrl?: string | null;
  supabaseAnonKey?: string | null;
  /** Per-strategy timeout in ms (upper bound). */
  perStrategyTimeoutMs?: number;
  /** Overall timeout for the whole race in ms. */
  overallTimeoutMs?: number;
  signal?: AbortSignal;
};

type StrategyResult = { name: string; text: string };

function isLikelySitemapXml(text: string): boolean {
  return /<\s*(?:[A-Za-z_][\w.-]*:)?(urlset|sitemapindex)\b/i.test(text);
}

function linkAbortSignals(from: AbortSignal | undefined, to: AbortController): () => void {
  if (!from) return () => undefined;
  const handler = () => to.abort();
  if (from.aborted) {
    to.abort();
    return () => undefined;
  }
  from.addEventListener("abort", handler, { once: true });
  return () => from.removeEventListener("abort", handler);
}

async function fetchTextWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<string> {
  const controller = new AbortController();
  const unlink = linkAbortSignals(externalSignal, controller);
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    // Normalize abort errors into something human-readable
    const msg = e instanceof Error ? e.message : String(e);
    if (/aborted|abort/i.test(msg)) {
      throw new Error(`timeout after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw e;
  } finally {
    window.clearTimeout(timeoutId);
    unlink();
  }
}

/**
 * Fetch sitemap XML text using multiple strategies and return the first successful result.
 * - Cancels all other in-flight requests once one succeeds
 * - Enforces a hard overall timeout so the caller cannot hang forever
 */
export async function fetchSitemapTextRaced(
  targetUrl: string,
  config: FetchSitemapTextConfig
): Promise<string> {
  const trimmed = targetUrl.trim();
  if (!trimmed) throw new Error("URL is required");

  const perStrategyTimeoutMs = Math.max(4000, config.perStrategyTimeoutMs ?? 12000);
  const overallTimeoutMs = Math.max(perStrategyTimeoutMs, config.overallTimeoutMs ?? 15000);

  const raceAbort = new AbortController();
  const unlinkExternal = linkAbortSignals(config.signal, raceAbort);

  const strategies: Array<{ name: string; run: (signal: AbortSignal) => Promise<string> }> = [];

  // Strategy: Supabase Edge function (server-side fetch)
  if (config.supabaseUrl && config.supabaseAnonKey) {
    strategies.push({
      name: "Supabase",
      run: (signal) =>
        fetchTextWithTimeout(
          `${config.supabaseUrl}/functions/v1/fetch-sitemap?url=${encodeURIComponent(trimmed)}`,
          {
            method: "GET",
            headers: {
              Accept: "application/xml, text/xml, */*",
              apikey: config.supabaseAnonKey,
              Authorization: `Bearer ${config.supabaseAnonKey}`,
            },
          },
          Math.min(25000, Math.max(perStrategyTimeoutMs, 12000)),
          signal
        ),
    });
  }

  // Strategy: Direct fetch (only works when target site allows CORS)
  strategies.push({
    name: "Direct",
    run: (signal) =>
      fetchTextWithTimeout(
        trimmed,
        {
          method: "GET",
          headers: { Accept: "application/xml, text/xml, */*" },
          mode: "cors",
        },
        8000,
        signal
      ),
  });

  // Strategy: allorigins (free CORS-friendly proxy)
  strategies.push({
    name: "AllOrigins",
    run: (signal) =>
      fetchTextWithTimeout(
        `https://api.allorigins.win/raw?url=${encodeURIComponent(trimmed)}`,
        { method: "GET", headers: { Accept: "application/xml, text/xml, */*" } },
        perStrategyTimeoutMs,
        signal
      ),
  });

  // Strategy: r.jina.ai (free fetch proxy)
  // Format: https://r.jina.ai/http(s)://example.com/path
  strategies.push({
    name: "Jina",
    run: async (signal) => {
      const text = await fetchTextWithTimeout(
        `https://r.jina.ai/${trimmed.startsWith("http") ? trimmed : `https://${trimmed}`}`,
        { method: "GET", headers: { Accept: "application/xml, text/xml, */*" } },
        perStrategyTimeoutMs,
        signal
      );

      // Jina often returns Markdown lists; convert them into real sitemap XML when possible.
      return adaptJinaMarkdownToSitemapXml(text, trimmed) ?? text;
    },
  });

  if (strategies.length === 0) throw new Error("No fetch strategies available");

  const errors: string[] = [];

  const overallTimeout = new Promise<never>((_, reject) => {
    const id = window.setTimeout(() => {
      try {
        raceAbort.abort();
      } catch {
        // ignore
      }
      reject(new Error(`All strategies timed out after ${Math.round(overallTimeoutMs / 1000)}s`));
    }, overallTimeoutMs);
    // If caller cancels, reject quickly
    if (config.signal) {
      config.signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(id);
          reject(new Error("Cancelled"));
        },
        { once: true }
      );
    }
  });

  const runner = async (): Promise<StrategyResult> => {
    return new Promise((resolve, reject) => {
      let done = false;
      let completed = 0;

      const finishRejectIfAllFailed = () => {
        if (!done && completed >= strategies.length) {
          reject(new Error(`All strategies failed: ${errors.join(" | ")}`));
        }
      };

      for (const s of strategies) {
        // Run each strategy; never allow a sync throw to escape and break the loop
        Promise.resolve()
          .then(() => s.run(raceAbort.signal))
          .then((text) => {
            if (done) return;
            if (!isLikelySitemapXml(text)) {
              throw new Error("not sitemap XML");
            }
            done = true;
            try {
              raceAbort.abort();
            } catch {
              // ignore
            }
            resolve({ name: s.name, text });
          })
          .catch((e) => {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push(`${s.name}: ${msg}`);
            completed += 1;
            finishRejectIfAllFailed();
          });
      }
    });
  };

  try {
    const result = await Promise.race([runner(), overallTimeout]);
    // eslint-disable-next-line no-console
    console.log(`[Sitemap] ✅ ${result.name} succeeded first`);
    return result.text;
  } finally {
    unlinkExternal();
  }
}
