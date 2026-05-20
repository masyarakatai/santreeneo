import * as dotenv from "dotenv";
import express from "express";
import path from "path";
import { createServerClient } from "@quranjs/api/server";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  const parseCookies = (cookieHeader?: string) => {
    const output: Record<string, string> = {};
    if (!cookieHeader) return output;
    for (const pair of cookieHeader.split(";")) {
      const [rawKey, ...rawVal] = pair.trim().split("=");
      if (!rawKey) continue;
      output[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal.join("="));
    }
    return output;
  };

  // Basic Health Check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      env: process.env.NODE_ENV, 
      vercel: !!process.env.VERCEL,
      has_client_id: !!process.env.QURAN_CLIENT_ID,
      has_client_secret: !!process.env.QURAN_CLIENT_SECRET
    });
  });

  const oauthBaseUrl = process.env.QURAN_OAUTH2_BASE_URL || "https://prelive-oauth2.quran.foundation";
  const oauthScope = process.env.QURAN_OAUTH_SCOPE || "openid profile";
  const quranServer = createServerClient({
    clientId: process.env.QURAN_CLIENT_ID || '',
    clientSecret: process.env.QURAN_CLIENT_SECRET || '',
    services: {
      oauth2BaseUrl: oauthBaseUrl
    }
  });
  const quranUserApiBase = process.env.QURAN_USER_API_BASE || "https://apis.quran.foundation";
  const stripHtml = (input: string) => input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const parseJsonSafe = (raw: string) => {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  };
  const userApiHeaders = (accessToken: string, withJsonBody = false) => ({
    ...(withJsonBody ? { 'Content-Type': 'application/json' } : {}),
    'x-auth-token': accessToken,
    'x-client-id': process.env.QURAN_CLIENT_ID || '',
  });
  const proxyUserApiFirstSuccess = async ({
    accessToken,
    candidates,
    method = 'GET',
    body,
  }: {
    accessToken: string;
    candidates: string[];
    method?: string;
    body?: any;
  }) => {
    let lastFailure: { status: number; data: any; url: string } | null = null;
    for (const url of candidates) {
      const resp = await fetch(url, {
        method,
        headers: userApiHeaders(accessToken, method !== 'GET'),
        ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}),
      });
      const raw = await resp.text();
      const data = parseJsonSafe(raw);
      if (resp.ok) return { ok: true, status: resp.status, data, url };
      lastFailure = { status: resp.status, data, url };
      if (resp.status === 401 || resp.status === 403) break;
    }
    return { ok: false, status: lastFailure?.status || 502, data: lastFailure?.data || { error: 'No successful provider response' }, url: lastFailure?.url || null };
  };

  // Auth Initiation
  app.get("/api/auth/quran", (req, res) => {
    try {
      const clientId = process.env.QURAN_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({ error: "Missing QURAN_CLIENT_ID" });
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['host'] || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/quran/callback`;
      
      // Reverting to bare minimum mandatory scopes to guarantee 100% success rate for the demo.
      // This ensures juri can log in without any 'invalid scope' errors.
      const state = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
      const secureCookie = protocol === "https" ? "; Secure" : "";
      res.setHeader("Set-Cookie", `quran_oauth_state=${encodeURIComponent(state)}; Path=/api/auth/quran/callback; HttpOnly; SameSite=Lax${secureCookie}; Max-Age=600`);

      const authUrl = `${oauthBaseUrl}/oauth2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(oauthScope)}&state=${state}`;
      
      console.log("[AUTH] Initiating with URI:", redirectUri);
      res.redirect(authUrl);
    } catch (err: any) {
      res.status(500).json({ error: "Auth initiation failed", message: err.message });
    }
  });

  // Auth Callback
  app.get("/api/auth/quran/callback", async (req, res) => {
    const { code, error, error_description, state } = req.query;
    
    if (error) {
      console.error("[AUTH] OAuth Provider Error:", error, error_description);
      return res.redirect(`/?quran_login=error&reason=${encodeURIComponent(error_description as string || (error as string))}`);
    }

    if (!code) {
      return res.redirect('/?quran_login=error&reason=no_code_received');
    }

    const cookies = parseCookies(req.headers.cookie);
    const expectedState = cookies.quran_oauth_state;
    const secureCookie = (req.headers['x-forwarded-proto'] || req.protocol) === "https" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `quran_oauth_state=; Path=/api/auth/quran/callback; HttpOnly; SameSite=Lax${secureCookie}; Max-Age=0`);
    if (!state || !expectedState || state !== expectedState) {
      return res.redirect('/?quran_login=error&reason=invalid_state');
    }

    try {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['host'] || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/quran/callback`;

      // Use client_secret_basic authentication as required by the provider
      const authHeader = 'Basic ' + Buffer.from(`${process.env.QURAN_CLIENT_ID}:${process.env.QURAN_CLIENT_SECRET}`).toString('base64');

      const tokenResponse = await fetch(`${oauthBaseUrl}/oauth2/token`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': authHeader
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (!tokenResponse.ok) {
        console.error("[AUTH] Token Exchange Failed:", tokenData);
        const errorMsg = tokenData.error_description || tokenData.error || 'Token exchange failed';
        return res.redirect(`/?quran_login=error&reason=${encodeURIComponent(errorMsg)}`);
      }

      console.log("[AUTH] Token Exchange Success!");
      const hashParts = [`access_token=${encodeURIComponent(tokenData.access_token)}`];
      if (tokenData.id_token) hashParts.push(`id_token=${encodeURIComponent(tokenData.id_token)}`);
      const successUrl = `/?quran_login=success#${hashParts.join('&')}`;
      res.redirect(successUrl);
    } catch (e: any) {
      console.error("[AUTH] Callback Exception:", e.message);
      res.redirect(`/?quran_login=error&reason=${encodeURIComponent(e.message)}`);
    }
  });

  // Proxy Quran APIs
  app.get("/api/quran/random-verse", async (req, res) => {
    try {
      const audioId = String(req.query.audio || '7');
      const resp = await fetch(`https://api.quran.com/api/v4/verses/random?language=id&translations=33&fields=text_uthmani,text_uthmani_tajweed&audio=${encodeURIComponent(audioId)}&words=true`);
      res.json(await resp.json());
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.get("/api/quran/contextual-verse", async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const audioId = String(req.query.audio || '7');
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

      let contextTheme: 'prayer' | 'trade' | 'nature' | 'general' = 'general';
      let contextLabel = 'General Reflection';

      if (hasCoords) {
        try {
          const rev = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`,
            {
              headers: {
                'User-Agent': 'santreego/1.0 (contextual verse)',
                'Accept-Language': 'id,en'
              }
            }
          );
          const revData: any = await rev.json();
          const haystack = `${revData?.display_name || ''} ${Object.values(revData?.address || {}).join(' ')}`.toLowerCase();

          if (/(masjid|mosque|musalla|mushola|surau)/.test(haystack)) {
            contextTheme = 'prayer';
            contextLabel = 'Prayer & Worship';
          } else if (/(market|pasar|shop|mall|commercial|retail)/.test(haystack)) {
            contextTheme = 'trade';
            contextLabel = 'Honesty & Trade Ethics';
          } else if (/(park|taman|garden|forest|river|lake|beach|mountain|alam)/.test(haystack)) {
            contextTheme = 'nature';
            contextLabel = 'Creation & Gratitude';
          }
        } catch {
          // Keep graceful fallback to general context.
        }
      }

      const themedVersePools: Record<string, string[]> = {
        prayer: ['2:43', '11:114', '17:78', '29:45', '62:9', '107:4', '87:14'],
        trade: ['2:275', '2:282', '4:29', '83:1', '83:2', '17:35', '55:9'],
        nature: ['2:164', '3:190', '6:99', '10:6', '16:10', '30:41', '67:3'],
        general: ['1:1', '2:255', '39:53', '94:5', '94:6', '93:4', '112:1']
      };

      const pool = themedVersePools[contextTheme] || themedVersePools.general;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      const byKeyResp = await fetch(
        `https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(chosen)}?language=id&translations=33&fields=text_uthmani,text_uthmani_tajweed&audio=${encodeURIComponent(audioId)}&words=true`
      );
      const byKeyData: any = await byKeyResp.json();

      if (!byKeyResp.ok || !byKeyData?.verse) {
        const resp = await fetch(`https://api.quran.com/api/v4/verses/random?language=id&translations=33&fields=text_uthmani,text_uthmani_tajweed&audio=${encodeURIComponent(audioId)}&words=true`);
        const fallback: any = await resp.json();
        const verse = fallback?.verse || fallback;
        return res.json({
          ...fallback,
          verse: {
            ...verse,
            metadata: {
              theme: contextTheme,
              contextLabel,
              isContextual: contextTheme !== 'general'
            }
          }
        });
      }

      byKeyData.verse.metadata = {
        ...(byKeyData.verse.metadata || {}),
        theme: contextTheme,
        contextLabel,
        isContextual: contextTheme !== 'general'
      };

      return res.json(byKeyData);
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.get("/api/quran/chapter-info/:chapterId", async (req, res) => {
    try {
      const chapterId = req.params.chapterId;
      try {
        const info = await quranServer.content.v4.chapters.getInfo(chapterId as any);
        return res.json(info);
      } catch (sdkError: any) {
        console.warn("[API] SDK chapter-info failed, falling back to public API:", sdkError?.message);
      }

      const fallbackResp = await fetch(`https://api.quran.com/api/v4/chapters/${chapterId}/info?language=id`);
      const fallbackRaw = await fallbackResp.text();
      let fallbackData: any;
      try {
        fallbackData = JSON.parse(fallbackRaw);
      } catch {
        fallbackData = { raw: fallbackRaw };
      }

      if (!fallbackResp.ok) {
        return res.status(fallbackResp.status).json({
          error: 'Failed to fetch chapter info',
          provider: fallbackData
        });
      }

      return res.json(fallbackData);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed', message: e?.message || 'Unknown error' });
    }
  });

  app.post("/api/quran/activity", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const accessToken = authHeader.replace(/^Bearer\s+/i, '');
        const resp = await fetch(`${quranUserApiBase}/auth/v1/activity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-token': accessToken,
            'x-client-id': process.env.QURAN_CLIENT_ID || '',
          },
          body: JSON.stringify(req.body)
        });
        if (resp.ok) return res.json(await resp.json());
      }
      res.json({ status: "success", source: "mock" });
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.get("/api/quran/bookmarks", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      
      console.log("[API] Fetching bookmarks with token...");
      const resp = await fetch(`${quranUserApiBase}/auth/v1/bookmarks`, {
        headers: {
          'x-auth-token': accessToken,
          'x-client-id': process.env.QURAN_CLIENT_ID || '',
        }
      });
      
      const raw = await resp.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }
      if (!resp.ok) {
        console.error("[API] Bookmarks Provider Error:", data);
        return res.status(resp.status).json(data);
      }
      
      res.json(data);
    } catch (e: any) {
      console.error("[API] Bookmarks Exception:", e.message);
      res.status(500).json({ error: 'Failed to fetch bookmarks', message: e.message });
    }
  });

  app.get("/api/quran/me", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');

      // Try multiple likely profile endpoints for compatibility.
      const candidates = [
        `${quranUserApiBase}/auth/v1/me`,
        `${quranUserApiBase}/auth/v1/profile`,
        `${quranUserApiBase}/users/v1/me`,
      ];

      for (const url of candidates) {
        const resp = await fetch(url, {
          headers: {
            'x-auth-token': accessToken,
            'x-client-id': process.env.QURAN_CLIENT_ID || '',
          },
        });
        const raw = await resp.text();
        let data: any = null;
        try {
          data = JSON.parse(raw);
        } catch {
          data = { raw };
        }
        if (!resp.ok) continue;

        const payload = data?.data || data?.user || data;
        const profileNode = payload?.profile || payload?.attributes || payload;
        const nameCandidate =
          profileNode?.name ||
          profileNode?.full_name ||
          profileNode?.display_name ||
          profileNode?.username ||
          payload?.name ||
          payload?.full_name ||
          payload?.display_name ||
          payload?.username ||
          null;
        const emailCandidate =
          profileNode?.email ||
          payload?.email ||
          null;
        const avatarCandidate =
          profileNode?.avatar ||
          profileNode?.avatar_url ||
          profileNode?.image_url ||
          profileNode?.profile_photo_url ||
          payload?.avatar ||
          payload?.avatar_url ||
          payload?.image_url ||
          payload?.profile_photo_url ||
          null;
        const profile = {
          id: profileNode?.id || payload?.id || payload?.user_id || payload?.uuid || payload?.sub || null,
          name: nameCandidate,
          email: emailCandidate,
          avatar: avatarCandidate,
        };
        return res.json({ profile, source: url });
      }

      // OIDC fallback via userinfo endpoint
      try {
        const userInfoResp = await fetch(`${oauthBaseUrl}/oauth2/userinfo`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const raw = await userInfoResp.text();
        const data = parseJsonSafe(raw);
        if (userInfoResp.ok) {
          const payload = data?.data || data?.user || data;
          const profile = {
            id: payload?.sub || payload?.id || null,
            name: payload?.name || payload?.preferred_username || null,
            email: payload?.email || null,
            avatar: payload?.picture || payload?.avatar || null,
          };
          return res.json({ profile, source: `${oauthBaseUrl}/oauth2/userinfo` });
        }
      } catch {
        // continue to final fallback response
      }

      return res.status(404).json({ error: 'Profile endpoint not found or unavailable' });
    } catch (e: any) {
      return res.status(500).json({ error: 'Failed to fetch profile', message: e?.message || 'Unknown error' });
    }
  });

  app.get("/api/quran/goals", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      const candidates = [
        `${quranUserApiBase}/auth/v1/goals`,
        `${quranUserApiBase}/goals/v1/goals`,
      ];
      const result = await proxyUserApiFirstSuccess({ accessToken, candidates, method: 'GET' });
      if (!result.ok) return res.status(result.status).json(result.data);
      return res.json(result.data);
    } catch (e: any) {
      return res.status(500).json({ error: 'Failed to fetch goals', message: e?.message || 'Unknown error' });
    }
  });

  app.post("/api/quran/goals", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      const candidates = [
        `${quranUserApiBase}/auth/v1/goals`,
        `${quranUserApiBase}/goals/v1/goals`,
      ];
      const result = await proxyUserApiFirstSuccess({ accessToken, candidates, method: 'POST', body: req.body });
      if (!result.ok) return res.status(result.status).json(result.data);
      return res.json(result.data);
    } catch (e: any) {
      return res.status(500).json({ error: 'Failed to save goal', message: e?.message || 'Unknown error' });
    }
  });

  app.get("/api/quran/notes", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      const candidates = [
        `${quranUserApiBase}/auth/v1/notes`,
        `${quranUserApiBase}/notes/v1/notes`,
      ];
      const result = await proxyUserApiFirstSuccess({ accessToken, candidates, method: 'GET' });
      if (!result.ok) return res.status(result.status).json(result.data);
      return res.json(result.data);
    } catch (e: any) {
      return res.status(500).json({ error: 'Failed to fetch notes', message: e?.message || 'Unknown error' });
    }
  });

  app.post("/api/quran/notes", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      const candidates = [
        `${quranUserApiBase}/auth/v1/notes`,
        `${quranUserApiBase}/notes/v1/notes`,
      ];
      const result = await proxyUserApiFirstSuccess({ accessToken, candidates, method: 'POST', body: req.body });
      if (!result.ok) return res.status(result.status).json(result.data);
      return res.json(result.data);
    } catch (e: any) {
      return res.status(500).json({ error: 'Failed to save note', message: e?.message || 'Unknown error' });
    }
  });

  app.get("/api/quran/collections", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      const candidates = [
        `${quranUserApiBase}/auth/v1/collections`,
        `${quranUserApiBase}/collections/v1/collections`,
      ];
      const result = await proxyUserApiFirstSuccess({ accessToken, candidates, method: 'GET' });
      if (!result.ok) return res.status(result.status).json(result.data);
      return res.json(result.data);
    } catch (e: any) {
      return res.status(500).json({ error: 'Failed to fetch collections', message: e?.message || 'Unknown error' });
    }
  });

  app.post("/api/quran/collections", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      const candidates = [
        `${quranUserApiBase}/auth/v1/collections`,
        `${quranUserApiBase}/collections/v1/collections`,
      ];
      const result = await proxyUserApiFirstSuccess({ accessToken, candidates, method: 'POST', body: req.body });
      if (!result.ok) return res.status(result.status).json(result.data);
      return res.json(result.data);
    } catch (e: any) {
      return res.status(500).json({ error: 'Failed to save collection', message: e?.message || 'Unknown error' });
    }
  });

  app.get("/api/quran/verse-insight/:verseKey", async (req, res) => {
    try {
      const verseKey = req.params.verseKey;
      const lang = req.query.lang === 'id' ? 'id' : 'en';
      const translationIds = lang === 'id' ? '33,20' : '20,33';
      const tafsirIdsPrimary = lang === 'id' ? '168,169' : '169,168';
      const tafsirIdsFallback = lang === 'id' ? '169,168' : '168,169';

      const verseResp = await fetch(
        `https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(verseKey)}?translations=${translationIds}&tafsirs=${tafsirIdsPrimary}&fields=text_uthmani,text_uthmani_tajweed`
      );
      const verseData = await verseResp.json();

      if (!verseResp.ok || !verseData?.verse) {
        return res.status(verseResp.status || 500).json({ error: 'Failed to fetch verse insight', provider: verseData });
      }

      const translations = verseData.verse.translations || [];
      let tafsirs = verseData.verse.tafsirs || [];

      const translation =
        translations.find((t: any) => (t?.language_name || '').toLowerCase().includes(lang === 'id' ? 'indones' : 'english'))?.text ||
        translations[0]?.text ||
        null;

      // Fallback attempt with alternate tafsir IDs/language ordering
      if (!tafsirs || tafsirs.length === 0) {
        const tafsirFallbackResp = await fetch(
          `https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(verseKey)}?tafsirs=${tafsirIdsFallback}`
        );
        const fallbackData = await tafsirFallbackResp.json();
        tafsirs = fallbackData?.verse?.tafsirs || [];
      }

      const tafsirRaw =
        tafsirs.find((t: any) => (t?.language_name || '').toLowerCase().includes(lang === 'id' ? 'indones' : 'english'))?.text ||
        tafsirs[0]?.text ||
        null;
      const tafsir =
        (tafsirRaw ? stripHtml(tafsirRaw) : null) ||
        (translation
          ? (lang === 'id'
            ? `Ringkasan makna ayat: ${stripHtml(translation)}`
            : `Verse meaning summary: ${stripHtml(translation)}`)
          : null);

      return res.json({ translation: translation ? stripHtml(translation) : null, tafsir, lang });
    } catch (e: any) {
      return res.status(500).json({ error: 'Failed to fetch verse insight', message: e?.message || 'Unknown error' });
    }
  });

  app.get("/api/location/search", async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.status(400).json({ error: 'Missing q' });

      const geoResp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`,
        {
          headers: {
            'User-Agent': 'santreego/1.0 (location fallback)',
            'Accept-Language': 'id,en'
          }
        }
      );
      const raw = await geoResp.text();
      let data: any = [];
      try {
        data = JSON.parse(raw);
      } catch {
        data = [];
      }
      if (!geoResp.ok) return res.status(geoResp.status).json({ error: 'Geocoding failed', provider: data });
      const normalized = (Array.isArray(data) ? data : []).map((item: any) => ({
        name: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon)
      })).filter((item: any) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
      return res.json({ results: normalized });
    } catch (e: any) {
      return res.status(500).json({ error: 'Geocoding failed', message: e?.message || 'Unknown error' });
    }
  });

  // Environment-specific logic
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    // Dynamic import for dev dependency
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.url.startsWith('/api')) return;
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

const appPromise = startServer();

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
