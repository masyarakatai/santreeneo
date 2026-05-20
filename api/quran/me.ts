export default async function handler(req: any, res: any) {
  try {
    const authHeader = req.headers?.authorization;
    const accessToken = authHeader ? String(authHeader).replace(/^Bearer\s+/i, "") : null;
    if (!accessToken) return res.status(401).json({ error: 'Unauthorized' });
    const oauthBaseUrl = process.env.QURAN_OAUTH2_BASE_URL || "https://prelive-oauth2.quran.foundation";
    const quranUserApiBaseRaw = process.env.QURAN_USER_API_BASE || "https://apis.quran.foundation";
    const quranUserApiBase = quranUserApiBaseRaw.includes("/quran-reflect")
      ? quranUserApiBaseRaw.replace(/\/+$/, "")
      : `${quranUserApiBaseRaw.replace(/\/+$/, "")}/quran-reflect`;
    const parseJsonSafe = (raw: string) => { try { return JSON.parse(raw); } catch { return { raw }; } };
    const decodeJwtPayloadSafe = (token?: string) => {
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
    const debug = String(req.query.debug || '0') === '1';
    const claims = decodeJwtPayloadSafe(accessToken);
    const tokenSub = claims?.sub ? String(claims.sub) : null;
    const tokenUsername = claims?.preferred_username ? String(claims.preferred_username) : null;

    const reflectProfileCandidates = [
      tokenSub ? `${quranUserApiBase}/v1/users/${encodeURIComponent(tokenSub)}?qdc=true` : null,
      tokenUsername ? `${quranUserApiBase}/v1/users/${encodeURIComponent(tokenUsername)}?qdc=true` : null,
      `${quranUserApiBase}/v1/users/me?qdc=true`,
    ].filter(Boolean) as string[];

    for (const url of reflectProfileCandidates) {
      try {
        const resp = await fetch(url, { headers: { 'x-auth-token': accessToken, 'x-client-id': process.env.QURAN_CLIENT_ID || '', Accept: 'application/json' } });
        const raw = await resp.text();
        const data = parseJsonSafe(raw);
        if (!resp.ok) continue;
        const payload = data?.data || data?.user || data;
        const fullName = [payload?.firstName, payload?.lastName].filter(Boolean).join(' ').trim();
        const profile = {
          id: payload?.id || tokenSub || null,
          username: payload?.username || tokenUsername || null,
          name: fullName || payload?.name || payload?.display_name || payload?.username || tokenUsername || null,
          email: payload?.email || payload?.qdc?.email || null,
          avatar: payload?.photoUrl || payload?.avatar || payload?.avatarUrl || payload?.avatarUrls?.medium || payload?.avatarUrls?.small || payload?.avatarUrls?.large || payload?.qdc?.photoUrl || null,
        };
        if (profile.id || profile.name || profile.username || profile.email || profile.avatar) return res.json({ profile, source: url, ...(debug ? { debug: { payloadKeys: Object.keys(payload || {}) } } : {}) });
      } catch {}
    }

    const candidates = [`${quranUserApiBase}/auth/v1/me`, `${quranUserApiBase}/auth/v1/profile`, `${quranUserApiBase}/users/v1/me`, `${quranUserApiBase}/user/v1/me`];
    const headerVariants = [
      { 'x-auth-token': accessToken, 'x-client-id': process.env.QURAN_CLIENT_ID || '' },
      { Authorization: `Bearer ${accessToken}`, 'x-client-id': process.env.QURAN_CLIENT_ID || '' },
      { Authorization: `Bearer ${accessToken}` },
    ] as Record<string, string>[];

    for (const url of candidates) {
      for (const headers of headerVariants) {
        try {
          const resp = await fetch(url, { headers });
          const raw = await resp.text();
          const data = parseJsonSafe(raw);
          if (!resp.ok) continue;
          const payload = data?.data || data?.user || data;
          const profileNode = payload?.profile || payload?.attributes || payload;
          const profile = {
            id: profileNode?.id || payload?.id || payload?.user_id || payload?.uuid || payload?.sub || null,
            name: profileNode?.name || profileNode?.full_name || profileNode?.display_name || profileNode?.username || payload?.name || payload?.full_name || payload?.display_name || payload?.username || null,
            username: profileNode?.username || payload?.username || payload?.preferred_username || null,
            email: profileNode?.email || payload?.email || null,
            avatar: profileNode?.avatar || profileNode?.avatar_url || profileNode?.photo_url || profileNode?.profile_picture || profileNode?.profile_picture_url || profileNode?.image_url || profileNode?.profile_photo_url || payload?.avatar || payload?.avatar_url || payload?.photo_url || payload?.profile_picture || payload?.profile_picture_url || payload?.image_url || payload?.profile_photo_url || null,
          };
          if (profile.id || profile.name || profile.email || profile.avatar) return res.json({ profile, source: url });
        } catch {}
      }
    }

    const authHostFallback = oauthBaseUrl.replace('oauth2.', 'auth.');
    for (const userinfoUrl of [`${oauthBaseUrl}/oauth2/userinfo`, `${authHostFallback}/oauth2/userinfo`]) {
      try {
        const resp = await fetch(userinfoUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        const raw = await resp.text();
        const data = parseJsonSafe(raw);
        if (!resp.ok) continue;
        const payload = data?.data || data?.user || data;
        const profile = { id: payload?.sub || payload?.id || null, name: payload?.name || payload?.preferred_username || null, username: payload?.preferred_username || payload?.username || null, email: payload?.email || null, avatar: payload?.picture || payload?.avatar || payload?.profile_picture || null };
        if (profile.id || profile.name || profile.email || profile.avatar) return res.json({ profile, source: userinfoUrl });
      } catch {}
    }

    return res.json({ profile: null, source: 'unavailable' });
  } catch (e: any) {
    return res.status(500).json({
      error: 'Failed to fetch profile',
      message: e?.message || 'Unknown error',
      hint: 'Check QURAN_USER_API_BASE and OAuth environment alignment (prelive vs production).',
    });
  }
}
