import { authFromHeader, proxyUserApiFirstSuccess, quranUserApiBase, readJsonBody } from "../_lib/common";

export default async function handler(req: any, res: any) {
  try {
    const accessToken = authFromHeader(req);
    if (!accessToken) return res.status(401).json({ error: 'Unauthorized' });
    const candidates = [`${quranUserApiBase}/auth/v1/goals`, `${quranUserApiBase}/goals/v1/goals`];
    const result = await proxyUserApiFirstSuccess({ accessToken, candidates, method: req.method === 'POST' ? 'POST' : 'GET', body: readJsonBody(req) });
    if (!result.ok) return res.status(result.status).json(result.data);
    return res.json(result.data);
  } catch (e: any) {
    return res.status(500).json({ error: req.method === 'POST' ? 'Failed to save goal' : 'Failed to fetch goals', message: e?.message || 'Unknown error' });
  }
}
