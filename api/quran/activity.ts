import { authFromHeader, quranUserApiBase, readJsonBody, userApiHeaders } from "../../lib/api-common";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const accessToken = authFromHeader(req);
    if (!accessToken) return res.json({ status: 'success', source: 'mock' });
    const resp = await fetch(`${quranUserApiBase}/auth/v1/activity`, {
      method: 'POST',
      headers: userApiHeaders(accessToken, true),
      body: JSON.stringify(readJsonBody(req)),
    });
    const raw = await resp.text();
    if (!resp.ok) return res.status(resp.status).json({ error: 'Activity provider failed', provider: raw });
    try { return res.json(JSON.parse(raw)); } catch { return res.json({ raw }); }
  } catch {
    return res.status(500).json({ error: 'Failed' });
  }
}
