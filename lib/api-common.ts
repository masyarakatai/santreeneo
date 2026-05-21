export const oauthBaseUrl = process.env.QURAN_OAUTH2_BASE_URL || "https://oauth2.quran.foundation";
const requestedScope =
  process.env.QURAN_OAUTH_SCOPE ||
  "openid offline_access bookmark reading_session activity_day streak preference collection goal note user";
const scopeSet = new Set(requestedScope.split(/\s+/).map((s) => s.trim()).filter(Boolean));
scopeSet.add("user");
export const oauthScope = Array.from(scopeSet).join(" ");

const quranUserApiBaseRaw = process.env.QURAN_USER_API_BASE || "https://apis.quran.foundation";
export const quranUserApiBase = quranUserApiBaseRaw.replace(/\/+$/, "");
export const quranReflectApiBase = quranUserApiBase.includes("/quran-reflect")
  ? quranUserApiBase
  : `${quranUserApiBase}/quran-reflect`;

export const parseJsonSafe = (raw: string) => {
  try { return JSON.parse(raw); } catch { return { raw }; }
};

export const stripHtml = (input: string) => input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export const parseCookies = (cookieHeader?: string) => {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(";")) {
    const [rawKey, ...rawVal] = pair.trim().split("=");
    if (!rawKey) continue;
    out[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal.join("="));
  }
  return out;
};

export const decodeJwtPayloadSafe = (token?: string) => {
  try {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
};

export const readJsonBody = (req: any) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
};

export const authFromHeader = (req: any) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader) return null;
  return String(authHeader).replace(/^Bearer\s+/i, "");
};

export const userApiHeaders = (accessToken: string, withJsonBody = false) => ({
  ...(withJsonBody ? { "Content-Type": "application/json" } : {}),
  "x-auth-token": accessToken,
  "x-client-id": process.env.QURAN_CLIENT_ID || "",
});

export const proxyUserApiFirstSuccess = async ({
  accessToken,
  candidates,
  method = "GET",
  body,
}: {
  accessToken: string;
  candidates: string[];
  method?: string;
  body?: any;
}) => {
  let lastFailure: { status: number; data: any; url: string } | null = null;
  let lastException: { message: string; url: string } | null = null;
  for (const url of candidates) {
    try {
      const resp = await fetch(url, {
        method,
        headers: userApiHeaders(accessToken, method !== "GET"),
        ...(method !== "GET" ? { body: JSON.stringify(body || {}) } : {}),
      });
      const raw = await resp.text();
      const data = parseJsonSafe(raw);
      if (resp.ok) return { ok: true, status: resp.status, data, url };
      lastFailure = { status: resp.status, data, url };
      if (resp.status === 401 || resp.status === 403) break;
    } catch (e: any) {
      lastException = { message: e?.message || "Network error", url };
    }
  }
  return {
    ok: false,
    status: lastFailure?.status || 502,
    data:
      lastFailure?.data || {
        error: "No successful provider response",
        providerError: lastException?.message || "Unknown provider error",
        providerUrl: lastException?.url || null,
      },
    url: lastFailure?.url || lastException?.url || null,
  };
};
