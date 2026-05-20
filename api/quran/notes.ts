export default async function handler(req: any, res: any) {
  try {
    const authHeader = req.headers?.authorization;
    const accessToken = authHeader ? String(authHeader).replace(/^Bearer\s+/i, "") : null;
    if (!accessToken) return res.status(401).json({ error: 'Unauthorized' });
    const quranUserApiBaseRaw = process.env.QURAN_USER_API_BASE || "https://apis.quran.foundation";
    const quranUserApiBase = quranUserApiBaseRaw.includes("/quran-reflect")
      ? quranUserApiBaseRaw.replace(/\/+$/, "")
      : `${quranUserApiBaseRaw.replace(/\/+$/, "")}/quran-reflect`;
    const parseJsonSafe = (raw: string) => { try { return JSON.parse(raw); } catch { return { raw }; } };
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const candidates = [`${quranUserApiBase}/auth/v1/notes`, `${quranUserApiBase}/notes/v1/notes`];
    let lastFailure: { status: number; data: any } | null = null;
    for (const url of candidates) {
      const resp = await fetch(url, {
        method: req.method === 'POST' ? 'POST' : 'GET',
        headers: {
          ...(req.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          'x-auth-token': accessToken,
          'x-client-id': process.env.QURAN_CLIENT_ID || '',
        },
        ...(req.method === 'POST' ? { body: JSON.stringify(body) } : {}),
      });
      const raw = await resp.text();
      const data = parseJsonSafe(raw);
      if (resp.ok) return res.json(data);
      lastFailure = { status: resp.status, data };
      if (resp.status === 401 || resp.status === 403) break;
    }
    return res.status(lastFailure?.status || 502).json(lastFailure?.data || { error: 'No successful provider response' });
  } catch (e: any) {
    return res.status(500).json({ error: req.method === 'POST' ? 'Failed to save note' : 'Failed to fetch notes', message: e?.message || 'Unknown error' });
  }
}
