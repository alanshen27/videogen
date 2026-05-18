/**
 * Reference image search.
 *
 * Priority order:
 *   1. SerpAPI (`SERPAPI_API_KEY` or `IMAGE_SEARCH_API_KEY`) — Google Images
 *   2. Unsplash `source.unsplash.com` — no API key needed, returns 1600×900 jpeg
 *   3. picsum.photos placeholder — last resort
 *
 * Logs are intentionally noisy so the worker terminal makes it obvious why
 * an image came back empty / placeholder.
 */

export type ReferenceImage = {
  url: string;
  alt: string;
  source: "serpapi" | "unsplash" | "picsum";
};

function unsplashFallback(query: string): ReferenceImage {
  const slug = encodeURIComponent(query.trim() || "abstract").replace(/%20/g, ",");
  return {
    url: `https://source.unsplash.com/1600x900/?${slug}`,
    alt: query,
    source: "unsplash",
  };
}

function picsumFallback(query: string): ReferenceImage {
  return {
    url: `https://picsum.photos/seed/${encodeURIComponent(query)}/1600/900`,
    alt: query,
    source: "picsum",
  };
}

/* Hosts whose image URLs SerpAPI returns but which either 403 on hotlink
 * (Shutterstock/Getty) or only serve watermarked thumbnails. We push these to
 * the bottom of the list (and exclude them entirely if there are other hits). */
const PAYWALLED_HOSTS = [
  "shutterstock.com",
  "gettyimages.com",
  "istockphoto.com",
  "alamy.com",
  "dreamstime.com",
  "depositphotos.com",
  "123rf.com",
  "stock.adobe.com",
];

/* LLM-side junk we strip before searching — "stock photo" et al. bias Google
 * Images straight into the paywalled hosts above. */
const QUERY_JUNK = [
  /\bstock\s+(photo|photos|photography|image|images|illustration|illustrations|footage|vector|vectors)\b/gi,
  /\broyalty[-\s]?free\b/gi,
  /\bhigh[-\s]?resolution\b/gi,
  /\bhi[-\s]?res\b/gi,
  /\b4k\b/gi,
  /\bhd\b/gi,
];

function cleanSearchQuery(raw: string): string {
  let q = raw;
  for (const re of QUERY_JUNK) {
    q = q.replace(re, " ");
  }
  return q.replace(/\s+/g, " ").trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isPaywalled(url: string): boolean {
  const h = hostOf(url);
  return PAYWALLED_HOSTS.some((p) => h.endsWith(p));
}

export async function searchReferenceImages(
  query: string
): Promise<ReferenceImage[]> {
  const trimmed = cleanSearchQuery(query);
  if (!trimmed) {
    return [unsplashFallback("abstract pattern")];
  }
  if (trimmed !== query.trim()) {
    console.log(
      `[search-images] Stripped junk from query: "${query.trim()}" → "${trimmed}"`
    );
  }

  const apiKey =
    process.env.SERPAPI_API_KEY || process.env.IMAGE_SEARCH_API_KEY || "";

  if (apiKey) {
    try {
      /* Logo queries want clean transparent PNGs; Google's `ic:trans` filter
       * returns far better results for "<thing> logo" type searches. */
      const wantsTransparent = /\blogo\b|\bicon\b|\bmark\b/i.test(trimmed);
      const tbs = wantsTransparent ? "&tbs=ic:trans" : "";
      const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(
        trimmed
      )}&ijn=0&num=10${tbs}&api_key=${encodeURIComponent(apiKey)}`;

      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.warn(
          `[search-images] SerpAPI HTTP ${response.status}: ${body.slice(0, 240)}`
        );
      } else {
        const data = (await response.json()) as {
          error?: string;
          images_results?: {
            original?: string;
            thumbnail?: string;
            title?: string;
          }[];
        };

        if (data.error) {
          console.warn(`[search-images] SerpAPI error: ${data.error}`);
        } else {
          const rows = data.images_results ?? [];
          const all: ReferenceImage[] = rows
            .map((r) => ({
              /* Originals are usually higher-res but often blocked by hotlinking;
               * thumbnails are reliable. We let download-image.ts handle retries. */
              url: r.original ?? r.thumbnail ?? "",
              alt: r.title ?? trimmed,
              source: "serpapi" as const,
            }))
            .filter((r) => r.url.length > 0);

          /* Push paywalled/watermarked hosts to the bottom — they almost always
           * 403 or return a watermarked thumbnail. We still include them as a
           * last-resort attempt in case the others fail too. */
          const clean = all.filter((r) => !isPaywalled(r.url));
          const paywalled = all.filter((r) => isPaywalled(r.url));
          const skipped = paywalled.length;
          const results = [...clean, ...paywalled].slice(0, 8);

          if (results.length > 0) {
            console.log(
              `[search-images] SerpAPI returned ${results.length} hit(s) for "${trimmed}"${
                skipped > 0 ? ` (${skipped} paywalled deprioritised)` : ""
              }.`
            );
            // Always include the unsplash fallback so the caller can retry if a
            // particular SerpAPI URL refuses to download.
            return [...results, unsplashFallback(trimmed)];
          }
          console.warn(`[search-images] SerpAPI returned 0 results for "${trimmed}".`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[search-images] SerpAPI threw: ${msg}`);
    }
  } else {
    console.warn(
      "[search-images] No SERPAPI_API_KEY / IMAGE_SEARCH_API_KEY set — using Unsplash fallback."
    );
  }

  return [unsplashFallback(trimmed), picsumFallback(trimmed)];
}
