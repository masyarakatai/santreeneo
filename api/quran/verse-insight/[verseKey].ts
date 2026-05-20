import { stripHtml } from "../../_lib/common";

export default async function handler(req: any, res: any) {
  try {
    const verseKey = String(req.query.verseKey || '');
    const lang = req.query.language === 'en' ? 'en' : 'id';
    const includeTafsir = String(req.query.tafsir || '0') === '1';
    const translationIds = lang === 'id' ? '33,20' : '20,33';
    const tafsirIdsPrimary = lang === 'id' ? '168,169' : '169,168';
    const tafsirIdsFallback = lang === 'id' ? '169,168' : '168,169';

    const verseResp = await fetch(`https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(verseKey)}?translations=${translationIds}&tafsirs=${tafsirIdsPrimary}&fields=text_uthmani,text_uthmani_tajweed`);
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
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to fetch verse insight', message: e?.message || 'Unknown error' });
  }
}
