export default async function handler(req: any, res: any) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing q' });
    const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'santreego/1.0 (location fallback)', 'Accept-Language': 'id,en' },
    });
    const raw = await geoResp.text();
    let data: any = [];
    try { data = JSON.parse(raw); } catch { data = []; }
    if (!geoResp.ok) return res.status(geoResp.status).json({ error: 'Geocoding failed', provider: data });
    const results = (Array.isArray(data) ? data : []).map((item: any) => ({ name: item.display_name, lat: Number(item.lat), lng: Number(item.lon) })).filter((item: any) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
    return res.json({ results });
  } catch (e: any) {
    return res.status(500).json({ error: 'Geocoding failed', message: e?.message || 'Unknown error' });
  }
}
