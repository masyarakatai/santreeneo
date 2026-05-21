type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export type QuranContentApiClientOptions = {
  baseUrl?: string;
  oauthBaseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  userAgent?: string;
};

type TokenState = {
  accessToken: string;
  expiresAtMs: number;
};

export class QuranContentApiClient {
  private readonly baseUrl: string;
  private readonly oauthBaseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly scope: string;
  private readonly userAgent: string;

  private tokenState: TokenState | null = null;
  private refreshing: Promise<string> | null = null;

  constructor(opts: QuranContentApiClientOptions = {}) {
    this.baseUrl = (opts.baseUrl || process.env.QURAN_CONTENT_API_BASE || "https://apis.quran.foundation/content/api/v4").replace(
      /\/+$/,
      ""
    );
    this.oauthBaseUrl = (
      opts.oauthBaseUrl ||
      process.env.QURAN_CONTENT_OAUTH2_BASE_URL ||
      process.env.QURAN_OAUTH2_BASE_URL ||
      "https://oauth2.quran.foundation"
    ).replace(/\/+$/, "");
    this.clientId = opts.clientId || process.env.QURAN_CLIENT_ID || "";
    this.clientSecret = opts.clientSecret || process.env.QURAN_CLIENT_SECRET || "";
    this.scope = opts.scope || process.env.QURAN_CONTENT_OAUTH_SCOPE || "content";
    this.userAgent = opts.userAgent || process.env.QURAN_USER_AGENT || "santreego/1.0";

    if (!this.clientId) throw new Error("Missing QURAN_CLIENT_ID for Quran Content APIs");
    if (!this.clientSecret) throw new Error("Missing QURAN_CLIENT_SECRET for Quran Content APIs");
  }

  async getVersesByChapter(
    chapterNumber: number | string,
    params?: Record<string, string | number | boolean | undefined | null>
  ) {
    const chapter = this.assertChapterNumber(chapterNumber);
    return this.requestJson<{ verses: JsonValue[]; pagination?: JsonValue }>(`/verses/by_chapter/${chapter}`, params);
  }

  async getVerseByKey(
    verseKey: string,
    params?: Record<string, string | number | boolean | undefined | null>
  ) {
    const key = String(verseKey || "").trim();
    if (!/^\d{1,3}:\d{1,3}$/.test(key)) throw new Error(`Invalid verse_key "${verseKey}" (expected "chapter:verse")`);
    return this.requestJson<{ verse: JsonValue }>(`/verses/by_key/${encodeURIComponent(key)}`, params);
  }

  async getRecitations(params?: Record<string, string | number | boolean | undefined | null>) {
    return this.requestJson<{ recitations: JsonValue[] }>(`/resources/recitations`, params);
  }

  async getRecitationsByChapter(
    recitationId: number | string,
    chapterNumber: number | string,
    params?: Record<string, string | number | boolean | undefined | null>
  ) {
    const rid = this.assertPositiveInt(recitationId, "recitation_id");
    const chapter = this.assertChapterNumber(chapterNumber);
    return this.requestJson<{ audio_files: JsonValue[]; pagination?: JsonValue }>(
      `/recitations/${rid}/by_chapter/${chapter}`,
      params
    );
  }

  private assertPositiveInt(value: number | string, label: string) {
    const n = typeof value === "number" ? value : Number(String(value));
    if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) throw new Error(`Invalid ${label} "${value}"`);
    return String(n);
  }

  private assertChapterNumber(value: number | string) {
    const n = typeof value === "number" ? value : Number(String(value));
    if (!Number.isFinite(n) || Math.floor(n) !== n || n < 1 || n > 114) throw new Error(`Invalid chapter_number "${value}"`);
    return String(n);
  }

  private buildUrl(pathname: string, params?: Record<string, string | number | boolean | undefined | null>) {
    const url = new URL(this.baseUrl + pathname);
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null) continue;
      if (typeof v === "boolean") url.searchParams.set(k, v ? "true" : "false");
      else url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  private async getAccessToken({ forceRefresh }: { forceRefresh: boolean }): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.tokenState && this.tokenState.expiresAtMs - now > 60_000) {
      return this.tokenState.accessToken;
    }
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const tokenUrl = `${this.oauthBaseUrl}/oauth2/token`;
        const body = new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: this.scope,
        });
        const resp = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": this.userAgent,
          },
          body,
        });
        const { json, raw } = await this.readJsonOrText(resp);
        if (!resp.ok) {
          const msg = typeof json === "object" && json && "error" in json ? String((json as any).error) : raw.slice(0, 240);
          throw new Error(`Failed to fetch content access token (${resp.status}): ${msg}`);
        }
        const accessToken = (json as any)?.access_token;
        const expiresIn = Number((json as any)?.expires_in || 3600);
        if (!accessToken || typeof accessToken !== "string") throw new Error("OAuth token response missing access_token");
        const expiresAtMs = Date.now() + Math.max(0, expiresIn) * 1000;
        this.tokenState = { accessToken, expiresAtMs };
        return accessToken;
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async requestJson<T>(
    pathname: string,
    params?: Record<string, string | number | boolean | undefined | null>
  ): Promise<T> {
    const url = this.buildUrl(pathname, params);
    const maxRateLimitRetries = 5;
    let used401Retry = false;
    let rateLimitAttempts = 0;

    while (true) {
      const accessToken = await this.getAccessToken({ forceRefresh: false });
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": this.userAgent,
          "x-auth-token": accessToken,
          "x-client-id": this.clientId,
        },
      });

      if (resp.status === 401 && !used401Retry) {
        used401Retry = true;
        await this.getAccessToken({ forceRefresh: true });
        continue;
      }
      if (resp.status === 429 && rateLimitAttempts < maxRateLimitRetries) {
        const waitMs = this.computeBackoffMs(resp, rateLimitAttempts);
        rateLimitAttempts += 1;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      const { json, raw } = await this.readJsonOrText(resp);
      if (resp.ok) return json as T;

      if (resp.status === 403) {
        throw new Error("Access denied (403). Check QURAN_CLIENT_ID / QURAN_CLIENT_SECRET and requested scope.");
      }

      const snippet = raw.slice(0, 240);
      throw new Error(`Quran Content API request failed (${resp.status}) for ${pathname}: ${snippet}`);
    }
  }

  private computeBackoffMs(resp: Response, attempt: number) {
    const retryAfter = resp.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) return Math.min(60_000, seconds * 1000);
    }
    const base = 500 * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 200);
    return Math.min(10_000, base + jitter);
  }

  private async readJsonOrText(resp: Response): Promise<{ json: unknown; raw: string }> {
    const raw = await resp.text();
    try {
      return { json: JSON.parse(raw), raw };
    } catch {
      // Common failure: HTML error page (starts with "<!doctype")
      return { json: { raw }, raw };
    }
  }
}
