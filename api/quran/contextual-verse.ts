export default async function handler(req: any, res: any) {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const audioId = String(req.query.audio || '7');
    const lang = req.query.language === 'en' ? 'en' : 'id';
    const translationId = lang === 'id' ? '33' : '20';
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    let contextTheme: 'prayer' | 'trade' | 'nature' | 'general' = 'general';
    let contextLabel = 'General Reflection';

    if (hasCoords) {
      try {
        const rev = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`, {
          headers: { 'User-Agent': 'santreego/1.0 (contextual verse)', 'Accept-Language': 'id,en' },
        });
        const revData: any = await rev.json();
        const haystack = `${revData?.display_name || ''} ${Object.values(revData?.address || {}).join(' ')}`.toLowerCase();
        if (/(masjid|mosque|musalla|mushola|surau)/.test(haystack)) { contextTheme = 'prayer'; contextLabel = 'Prayer & Worship'; }
        else if (/(market|pasar|shop|mall|commercial|retail)/.test(haystack)) { contextTheme = 'trade'; contextLabel = 'Honesty & Trade Ethics'; }
        else if (/(park|taman|garden|forest|river|lake|beach|mountain|alam)/.test(haystack)) { contextTheme = 'nature'; contextLabel = 'Creation & Gratitude'; }
      } catch {}
    }

    const themedVersePools: Record<string, string[]> = {
      prayer: ['2:43', '11:114', '17:78', '29:45', '62:9', '107:4', '87:14'],
      trade: ['2:275', '2:282', '4:29', '83:1', '83:2', '17:35', '55:9'],
      nature: ['2:164', '3:190', '6:99', '10:6', '16:10', '30:41', '67:3'],
      general: ['1:1', '2:255', '39:53', '94:5', '94:6', '93:4', '112:1'],
    };

    const pool = themedVersePools[contextTheme] || themedVersePools.general;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const byKeyResp = await fetch(`https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(chosen)}?language=${lang}&translations=${translationId}&fields=text_uthmani,text_uthmani_tajweed&audio=${encodeURIComponent(audioId)}&words=true`);
    const byKeyData: any = await byKeyResp.json();

    if (!byKeyResp.ok || !byKeyData?.verse) {
      const resp = await fetch(`https://api.quran.com/api/v4/verses/random?language=${lang}&translations=${translationId}&fields=text_uthmani,text_uthmani_tajweed&audio=${encodeURIComponent(audioId)}&words=true`);
      const fallback: any = await resp.json();
      const verse = fallback?.verse || fallback;
      return res.json({ ...fallback, verse: { ...verse, metadata: { theme: contextTheme, contextLabel, isContextual: contextTheme !== 'general' } } });
    }

    byKeyData.verse.metadata = { ...(byKeyData.verse.metadata || {}), theme: contextTheme, contextLabel, isContextual: contextTheme !== 'general' };
    return res.json(byKeyData);
  } catch {
    return res.status(500).json({ error: 'Failed' });
  }
}
