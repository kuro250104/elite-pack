import "server-only";
import { z } from "zod";

/** Generic client name: no personal or project contact is sent to the provider. */
const userAgent = "ElitePackCatalogue/0.1 (educational project)";

const searchSchema = z.object({ search: z.array(z.object({ id: z.string().regex(/^Q\d+$/) })) });
const snakSchema = z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }) });
const entitiesSchema = z.object({ entities: z.record(z.string(), z.object({
  id: z.string().optional(), missing: z.string().optional(),
  claims: z.record(z.string(), z.array(snakSchema)).optional(),
})) });
const metadataValue = z.object({ value: z.union([z.string(), z.number()]).transform(String) }).optional();
const imageInfoSchema = z.object({ query: z.object({ pages: z.array(z.object({
  title: z.string(), missing: z.boolean().optional(),
  imageinfo: z.array(z.object({
    url: z.string(), descriptionurl: z.string(), width: z.number().optional(), mime: z.string().optional(),
    extmetadata: z.object({ LicenseShortName: metadataValue, LicenseUrl: metadataValue, Artist: metadataValue,
      Restrictions: metadataValue }).passthrough(),
  })).optional(),
})) }).optional() });

export interface WikidataPerson { qid: string; human: boolean; birthDates: string[]; imageFile: string | null }
export interface CommonsFile {
  title: string; fileUrl: string; descriptionUrl: string; width: number | null; mime: string | null;
  licenseShortName: string | null; licenseUrl: string | null; artistHtml: string | null; restrictions: string | null;
}

/**
 * Wikidata and Wikimedia Commons action APIs (not the SPARQL service, which can be throttled to one query per minute).
 * Requests are serial, spaced and honour Retry-After: anonymous clients are rate limited aggressively.
 */
export class WikimediaClient {
  private nextRequestAt = 0;

  constructor(private readonly options: { minIntervalMs?: number; maxAttempts?: number; timeoutMs?: number } = {},
    private readonly fetcher: typeof fetch = fetch,
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {}

  private async request(host: "www.wikidata.org" | "commons.wikimedia.org", parameters: Record<string, string>): Promise<unknown> {
    const url = new URL(`https://${host}/w/api.php`);
    url.search = new URLSearchParams({ ...parameters, format: "json", formatversion: "2" }).toString();
    const attempts = this.options.maxAttempts ?? 8;
    for (let attempt = 1; ; attempt++) {
      const delay = this.nextRequestAt - Date.now();
      if (delay > 0) await this.wait(delay);
      this.nextRequestAt = Date.now() + (this.options.minIntervalMs ?? 1_000);
      let response: Response;
      try {
        response = await this.fetcher(url, { headers: { "User-Agent": userAgent, Accept: "application/json" },
          cache: "no-store", signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000) });
      } catch {
        throw new Error("Wikimedia est temporairement indisponible.");
      }
      if (response.ok) {
        const body: unknown = await response.json().catch(() => null);
        // The API can also refuse with HTTP 200 and {"error": {"code": "ratelimited" | "maxlag"}}: wait and retry.
        const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
        if (code === undefined && body !== null) return body;
        if ((code !== "ratelimited" && code !== "maxlag") || attempt >= attempts) {
          throw new Error(`Wikimedia a renvoyé une erreur (${typeof code === "string" ? code.slice(0, 40) : "réponse illisible"}).`);
        }
        await this.wait(Math.min(120, 5 * attempt) * 1000);
        continue;
      }
      if (response.status !== 429 && response.status < 500 || attempt >= attempts) {
        throw new Error(`Wikimedia a refusé la requête (${response.status}).`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      await this.wait(Math.min(120, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter + 1 : 5 * attempt) * 1000);
    }
  }

  /** Candidate items whose label or alias matches the name; identity must still be confirmed by the caller. */
  async searchPeople(name: string): Promise<string[]> {
    const query = z.string().trim().min(2).max(200).parse(name);
    const data = searchSchema.parse(await this.request("www.wikidata.org",
      { action: "wbsearchentities", search: query, language: "en", uselang: "en", type: "item", limit: "7" }));
    return data.search.map((row) => row.id);
  }

  async getPeople(qids: string[]): Promise<WikidataPerson[]> {
    const people: WikidataPerson[] = [];
    for (let index = 0; index < qids.length; index += 50) {
      const ids = qids.slice(index, index + 50);
      if (!ids.every((id) => /^Q\d+$/.test(id))) throw new Error("Identifiant Wikidata invalide.");
      const data = entitiesSchema.parse(await this.request("www.wikidata.org", { action: "wbgetentities", ids: ids.join("|"), props: "claims" }));
      for (const [qid, entity] of Object.entries(data.entities)) {
        if (entity.missing !== undefined) continue;
        const values = (property: string) => (entity.claims?.[property] ?? []).map((claim) => claim.mainsnak.datavalue?.value);
        people.push({ qid,
          human: values("P31").some((value) => (value as { id?: string } | undefined)?.id === "Q5"),
          // Day precision only (11); "+1998-12-20T00:00:00Z" becomes "1998-12-20".
          birthDates: values("P569").flatMap((value) => {
            const time = value as { time?: string; precision?: number } | undefined;
            return time?.precision === 11 && time.time ? [time.time.slice(1, 11)] : [];
          }),
          imageFile: values("P18").find((value): value is string => typeof value === "string") ?? null });
      }
    }
    return people;
  }

  async getCommonsFiles(fileNames: string[]): Promise<CommonsFile[]> {
    const files: CommonsFile[] = [];
    for (let index = 0; index < fileNames.length; index += 50) {
      const titles = fileNames.slice(index, index + 50).map((name) => `File:${name}`);
      const data = imageInfoSchema.parse(await this.request("commons.wikimedia.org",
        { action: "query", titles: titles.join("|"), prop: "imageinfo", iiprop: "url|extmetadata|size|mime" }));
      for (const page of data.query?.pages ?? []) {
        const info = page.imageinfo?.[0];
        if (page.missing || !info) continue;
        const meta = info.extmetadata;
        files.push({ title: page.title, fileUrl: info.url, descriptionUrl: info.descriptionurl, width: info.width ?? null, mime: info.mime ?? null,
          licenseShortName: meta.LicenseShortName?.value ?? null, licenseUrl: meta.LicenseUrl?.value ?? null,
          artistHtml: meta.Artist?.value ?? null, restrictions: meta.Restrictions?.value || null });
      }
    }
    return files;
  }
}
