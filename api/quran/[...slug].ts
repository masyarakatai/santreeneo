export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET,POST,OPTIONS');
      return res.status(200).end();
    }
    const slugParts = Array.isArray(req.query?.slug)
      ? req.query.slug
      : String(req.query?.slug || '').split('/').filter(Boolean);
    const route = slugParts.join('/');

    const quranUserApiBase = (process.env.QURAN_USER_API_BASE || 'https://apis.quran.foundation').replace(/\/+$/, '');
    const quranReflectApiBase = quranUserApiBase.includes('/quran-reflect')
      ? quranUserApiBase
      : `${quranUserApiBase}/quran-reflect`;
    const authHeader = req.headers?.authorization;
    const accessToken = authHeader ? String(authHeader).replace(/^Bearer\s+/i, '') : null;
    const parseJsonSafe = (raw: string) => { try { return JSON.parse(raw); } catch { return { raw }; } };
    const readJsonBody = () => (req.body && typeof req.body === 'object' ? req.body : {});
    const stripHtml = (input: string) => input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    if (route === 'goals' || route === 'notes' || route === 'collections') {
      if (!accessToken) return res.status(401).json({ error: 'Unauthorized' });
      const map: Record<string, string[]> = {
        goals: [
          req.method === 'GET'
            ? `${quranUserApiBase}/auth/v1/goals/get-todays-plan?type=QURAN_PAGES&mushafId=4`
            : `${quranUserApiBase}/auth/v1/goals?mushafId=4`,
        ],
        notes: [
          `${quranUserApiBase}/auth/v1/notes?first=20`,
        ],
        collections: [
          ...(req.method === 'GET'
            ? [
                `${quranUserApiBase}/auth/v1/bookmarks/collections`,
                `${quranUserApiBase}/auth/v1/collections/all?first=20`,
                `${quranUserApiBase}/auth/v1/collections?first=20`,
              ]
            : [`${quranUserApiBase}/auth/v1/collections`]),
        ],
      };
      const candidates = map[route];
      const method = req.method === 'POST' ? 'POST' : 'GET';
      let lastFailure: { status: number; data: any } | null = null;
      for (const url of candidates) {
        const rawBody = readJsonBody();
        const providerBody = route === 'goals' && method === 'POST'
          ? {
              type: 'QURAN_PAGES',
              amount: Number(rawBody.target || rawBody.amount || 1),
              category: 'QURAN',
            }
          : rawBody;
        const resp = await fetch(url, {
          method,
          headers: {
            ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
            'x-auth-token': accessToken,
            'x-client-id': process.env.QURAN_CLIENT_ID || '',
            ...(route === 'goals' ? { 'x-timezone': String(req.headers?.['x-timezone'] || 'Asia/Jakarta') } : {}),
          },
          ...(method === 'POST' ? { body: JSON.stringify(providerBody) } : {}),
        });
        const raw = await resp.text();
        const data = parseJsonSafe(raw);
        if (resp.ok) return res.json(data);
        lastFailure = { status: resp.status, data };
        if (resp.status === 401 || resp.status === 403) break;
      }
      return res.status(lastFailure?.status || 502).json(lastFailure?.data || { error: `No successful provider response (${route})` });
    }

    if (route === 'me') {
      if (!accessToken) return res.status(401).json({ error: 'Unauthorized' });
      const claims = (() => {
        try {
          const parts = accessToken.split('.');
          if (parts.length < 2) return null;
          const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
          return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
        } catch {
          return null;
        }
      })();
      const tokenSub = claims?.sub ? String(claims.sub) : null;
      const tokenUsername = claims?.preferred_username ? String(claims.preferred_username) : null;
      const oauthBaseUrl = process.env.QURAN_OAUTH2_BASE_URL || 'https://oauth2.quran.foundation';

      const reflectProfileCandidates = [
        tokenSub ? `${quranReflectApiBase}/v1/users/${encodeURIComponent(tokenSub)}?qdc=true` : null,
        tokenUsername ? `${quranReflectApiBase}/v1/users/${encodeURIComponent(tokenUsername)}?qdc=true` : null,
        `${quranReflectApiBase}/v1/users/me?qdc=true`,
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
          if (profile.id || profile.name || profile.username || profile.email || profile.avatar) return res.json({ profile, source: url });
        } catch {}
      }

      for (const userinfoUrl of [`${oauthBaseUrl}/oauth2/userinfo`, `${oauthBaseUrl.replace('oauth2.', 'auth.')}/oauth2/userinfo`]) {
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
    }

    if (route === 'random-verse') {
      const lang = req.query.language === 'en' ? 'en' : 'id';
      const translationId = lang === 'id' ? '33' : '20';
      const audioId = String(req.query.audio || '7');
      const resp = await fetch(`https://api.quran.com/api/v4/verses/random?language=${lang}&translations=${translationId}&fields=text_uthmani,text_uthmani_tajweed&audio=${encodeURIComponent(audioId)}&words=true&word_fields=text_uthmani`);
      const data = await resp.json();
      if (!resp.ok) return res.status(resp.status).json(data);
      return res.json(data);
    }

    if (route.startsWith('chapter-info/')) {
      const chapterId = slugParts[1];
      if (!chapterId) return res.status(400).json({ error: 'Missing chapterId' });
      const lang = req.query.language === 'en' ? 'en' : 'id';
      const resp = await fetch(`https://api.quran.com/api/v4/chapters/${chapterId}/info?language=${lang}`);
      const data = await resp.json();
      if (!resp.ok) return res.status(resp.status).json(data);
      return res.json(data);
    }

    if (route === 'bookmarks') {
      if (!accessToken) return res.status(401).json({ error: 'Unauthorized' });
      if (req.method === 'GET') {
        const mushafId = Number(req.query.mushafId || 4);
        const resp = await fetch(`${quranUserApiBase}/auth/v1/bookmarks?mushafId=${encodeURIComponent(String(mushafId))}&type=ayah&first=20`, {
          headers: { 'x-auth-token': accessToken, 'x-client-id': process.env.QURAN_CLIENT_ID || '' },
        });
        const raw = await resp.text();
        const data = parseJsonSafe(raw);
        if (!resp.ok) return res.status(resp.status).json(data);
        return res.json(data);
      }
      if (req.method === 'POST') {
        const rawBody = readJsonBody();
        const verseKey = String(rawBody.verse_key || rawBody.verseKey || '').trim();
        const [surahNoStr, ayahNoStr] = verseKey.split(':');
        const surahNo = Number(surahNoStr);
        const ayahNo = Number(ayahNoStr);
        const normalizedBody = Number.isFinite(surahNo) && Number.isFinite(ayahNo)
          ? { type: 'ayah', key: surahNo, verseNumber: ayahNo, isReading: false, mushafId: 4, mushaf: 4 }
          : rawBody;
        const attempts = [
          `${quranUserApiBase}/auth/v1/bookmarks`,
          `${quranUserApiBase}/auth/v1/collections/__default__/bookmarks`,
        ];
        let lastFailure: { status: number; data: any } | null = null;
        for (const url of attempts) {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-auth-token': accessToken, 'x-client-id': process.env.QURAN_CLIENT_ID || '' },
            body: JSON.stringify(normalizedBody),
          });
          const raw = await resp.text();
          const data = parseJsonSafe(raw);
          if (resp.ok) return res.json(data);
          lastFailure = { status: resp.status, data };
        }
        return res.status(lastFailure?.status || 422).json(lastFailure?.data || { error: 'Failed to save bookmark' });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (route === 'activity') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (!accessToken) return res.json({ status: 'success', source: 'mock' });
      const rawBody = readJsonBody();
      const verseKey = String(rawBody.verse_key || rawBody.verseKey || '').trim();
      const activityBody = /^\d{1,3}:\d{1,3}$/.test(verseKey)
        ? { type: 'QURAN', seconds: 1, ranges: [`${verseKey}-${verseKey}`], mushafId: 4 }
        : { type: 'QURAN', seconds: 1, ranges: ['1:1-1:1'], mushafId: 4 };
      const resp = await fetch(`${quranUserApiBase}/auth/v1/activity-days`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': accessToken,
          'x-client-id': process.env.QURAN_CLIENT_ID || '',
          'x-timezone': String(req.headers?.['x-timezone'] || 'Asia/Jakarta'),
        },
        body: JSON.stringify(activityBody),
      });
      const raw = await resp.text();
      if (!resp.ok) return res.status(resp.status).json({ error: 'Activity provider failed', provider: raw });
      try { return res.json(JSON.parse(raw)); } catch { return res.json({ raw }); }
    }

    if (route === 'contextual-verse') {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const audioId = String(req.query.audio || '7');
      const lang = req.query.language === 'en' ? 'en' : 'id';
      const translationId = lang === 'id' ? '33' : '20';
      const exclude = new Set(
        String(req.query.exclude || '')
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean)
      );
      let contextTheme: 'prayer' | 'trade' | 'nature' | 'general' = 'general';
      let contextLabel = 'General Reflection';
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        try {
          const rev = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`, { headers: { 'User-Agent': 'santreego/1.0 (contextual verse)', 'Accept-Language': 'id,en' } });
          const revData: any = await rev.json();
          const haystack = `${revData?.display_name || ''} ${Object.values(revData?.address || {}).join(' ')}`.toLowerCase();
          if (/(masjid|mosque|musalla|mushola|surau)/.test(haystack)) { contextTheme = 'prayer'; contextLabel = 'Prayer & Worship'; }
          else if (/(market|pasar|shop|mall|commercial|retail)/.test(haystack)) { contextTheme = 'trade'; contextLabel = 'Honesty & Trade Ethics'; }
          else if (/(park|taman|garden|forest|river|lake|beach|mountain|alam)/.test(haystack)) { contextTheme = 'nature'; contextLabel = 'Creation & Gratitude'; }
        } catch {}
      }
      const pools: Record<string, string[]> = {
        prayer: ['2:43', '11:114', '17:78', '29:45', '62:9', '107:4', '87:14'],
        trade: ['2:275', '2:282', '4:29', '83:1', '83:2', '17:35', '55:9'],
        nature: ['2:164', '3:190', '6:99', '10:6', '16:10', '30:41', '67:3'],
      };
      const pool = pools[contextTheme] || [];
      const available = pool.filter((key) => !exclude.has(key));
      const chosen = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : pool[Math.floor(Math.random() * pool.length)];
      const verseUrl = contextTheme === 'general' || !chosen
        ? `https://api.quran.com/api/v4/verses/random?language=${lang}&translations=${translationId}&fields=text_uthmani,text_uthmani_tajweed&audio=${encodeURIComponent(audioId)}&words=true&word_fields=text_uthmani`
        : `https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(chosen)}?language=${lang}&translations=${translationId}&fields=text_uthmani,text_uthmani_tajweed&audio=${encodeURIComponent(audioId)}&words=true&word_fields=text_uthmani`;
      const byKeyResp = await fetch(verseUrl);
      const byKeyRaw = await byKeyResp.text();
      const byKeyData: any = parseJsonSafe(byKeyRaw);
      if (!byKeyResp.ok || !byKeyData?.verse) {
        const resp = await fetch(`https://api.quran.com/api/v4/verses/random?language=${lang}&translations=${translationId}&fields=text_uthmani,text_uthmani_tajweed&audio=${encodeURIComponent(audioId)}&words=true&word_fields=text_uthmani`);
        const fallbackRaw = await resp.text();
        const fallback: any = parseJsonSafe(fallbackRaw);
        if (!resp.ok || !fallback?.verse) return res.status(502).json({ error: 'Failed to fetch fallback verse', provider: fallback });
        const verse = fallback?.verse || fallback;
        return res.json({ ...fallback, verse: { ...verse, metadata: { theme: contextTheme, contextLabel, isContextual: contextTheme !== 'general' } } });
      }
      byKeyData.verse.metadata = { ...(byKeyData.verse.metadata || {}), theme: contextTheme, contextLabel, isContextual: contextTheme !== 'general' };
      return res.json(byKeyData);
    }

    if (route.startsWith('verse-insight/')) {
      const verseKey = slugParts.slice(1).join('/');
      const lang = req.query.language === 'en' ? 'en' : 'id';
      const includeTafsir = String(req.query.tafsir || '0') === '1';
      const translationIds = lang === 'id' ? '33,20' : '20,33';
      const tafsirIdsPrimary = lang === 'id' ? '168,169' : '169,168';
      const tafsirIdsFallback = lang === 'id' ? '169,168' : '168,169';
      const verseResp = await fetch(`https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(verseKey)}?translations=${translationIds}&tafsirs=${tafsirIdsPrimary}&fields=text_uthmani,text_uthmani_tajweed&words=true&word_fields=text_uthmani`);
      const verseData = await verseResp.json();
      if (!verseResp.ok || !verseData?.verse) return res.status(verseResp.status || 500).json({ error: 'Failed to fetch verse insight', provider: verseData });
      const translations = verseData.verse.translations || [];
      let tafsirs = includeTafsir ? (verseData.verse.tafsirs || []) : [];
      const translation = translations.find((t: any) => (t?.language_name || '').toLowerCase().includes(lang === 'id' ? 'indones' : 'english'))?.text || translations[0]?.text || null;
      if (includeTafsir && (!tafsirs || tafsirs.length === 0)) {
        const tafsirFallbackResp = await fetch(`https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(verseKey)}?tafsirs=${tafsirIdsFallback}`);
        const fallbackData = await tafsirFallbackResp.json();
        tafsirs = fallbackData?.verse?.tafsirs || [];
      }
      const tafsirRaw = includeTafsir ? (tafsirs.find((t: any) => (t?.language_name || '').toLowerCase().includes(lang === 'id' ? 'indones' : 'english'))?.text || tafsirs[0]?.text || null) : null;
      const tafsir = includeTafsir ? ((tafsirRaw ? stripHtml(tafsirRaw) : null) || (translation ? `Verse meaning summary: ${stripHtml(translation)}` : null)) : null;
      return res.json({ translation: translation ? stripHtml(translation) : null, tafsir, lang });
    }

    return res.status(404).json({ error: 'Unknown Quran route', route });
  } catch (e: any) {
    return res.status(500).json({ error: 'Quran API failed', message: e?.message || 'Unknown error' });
  }
}
