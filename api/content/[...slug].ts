import { QuranContentApiClient } from "../../lib/quran-content-api";

const normalizeQuery = (query: any) => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query || {})) {
    if (k === "slug") continue;
    if (v === undefined || v === null) continue;
    const first = Array.isArray(v) ? v[0] : v;
    if (first === undefined || first === null) continue;
    out[k] = String(first);
  }
  return out;
};

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Allow", "GET,OPTIONS");
      return res.status(200).end();
    }
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const slugParts = Array.isArray(req.query?.slug)
      ? req.query.slug
      : String(req.query?.slug || "").split("/").filter(Boolean);

    const client = new QuranContentApiClient();
    const q = normalizeQuery(req.query);

    // Routes:
    // - /api/content/verses/by_chapter/:chapter_number
    // - /api/content/verses/by_key/:verse_key
    // - /api/content/resources/recitations
    // - /api/content/recitations/:recitation_id/by_chapter/:chapter_number
    if (slugParts[0] === "verses" && slugParts[1] === "by_chapter" && slugParts[2]) {
      const data = await client.getVersesByChapter(slugParts[2], q);
      return res.json(data);
    }
    if (slugParts[0] === "verses" && slugParts[1] === "by_key" && slugParts[2]) {
      const data = await client.getVerseByKey(slugParts[2], q);
      return res.json(data);
    }
    if (slugParts[0] === "resources" && slugParts[1] === "recitations" && slugParts.length === 2) {
      const data = await client.getRecitations(q);
      return res.json(data);
    }
    if (slugParts[0] === "recitations" && slugParts[1] && slugParts[2] === "by_chapter" && slugParts[3]) {
      const data = await client.getRecitationsByChapter(slugParts[1], slugParts[3], q);
      return res.json(data);
    }

    return res.status(404).json({ error: "Unknown content route", route: slugParts.join("/") });
  } catch (e: any) {
    return res.status(502).json({ error: "Content API failed", message: e?.message || "Unknown error" });
  }
}

