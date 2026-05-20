import { authFromHeader, parseJsonSafe, quranUserApiBase, readJsonBody, userApiHeaders } from "../_lib/common";

export default async function handler(req: any, res: any) {
  try {
    const accessToken = authFromHeader(req);
    if (!accessToken) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const mushafId = Number(req.query.mushafId || 4);
      const resp = await fetch(`${quranUserApiBase}/auth/v1/bookmarks?mushafId=${encodeURIComponent(String(mushafId))}&type=ayah&first=20`, {
        headers: userApiHeaders(accessToken),
      });
      const raw = await resp.text();
      const data = parseJsonSafe(raw);
      if (!resp.ok) return res.status(resp.status).json(data);
      return res.json(data);
    }

    if (req.method === 'POST') {
      const rawBody = readJsonBody(req);
      const verseKey = String(rawBody.verse_key || rawBody.verseKey || '').trim();
      const [surahNoStr, ayahNoStr] = verseKey.split(':');
      const surahNo = Number(surahNoStr);
      const ayahNo = Number(ayahNoStr);
      const normalizedBody = Number.isFinite(surahNo) && Number.isFinite(ayahNo)
        ? { type: 'ayah', key: surahNo, verseNumber: ayahNo, isReading: false, mushafId: 4, mushaf: 4 }
        : rawBody;

      const attempts = [
        { url: `${quranUserApiBase}/auth/v1/bookmarks`, body: normalizedBody },
        { url: `${quranUserApiBase}/bookmarks/v1/bookmarks`, body: normalizedBody },
        { url: `${quranUserApiBase}/auth/v1/collections/__default__/bookmarks`, body: normalizedBody },
        { url: `${quranUserApiBase}/v1/collections/__default__/bookmarks`, body: normalizedBody },
      ];

      let lastError: { status: number; data: any } | null = null;
      for (const attempt of attempts) {
        const resp = await fetch(attempt.url, {
          method: 'POST',
          headers: userApiHeaders(accessToken, true),
          body: JSON.stringify(attempt.body),
        });
        const raw = await resp.text();
        const data = parseJsonSafe(raw);
        if (resp.ok) return res.json(data);
        lastError = { status: resp.status, data };
      }
      return res.status(lastError?.status || 422).json(lastError?.data || { error: 'Failed to save bookmark' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to handle bookmarks', message: e?.message || 'Unknown error' });
  }
}
