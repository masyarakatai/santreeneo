import handler from "../[...slug]";

export default function verseInsightHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["verse-insight", req.query.verse_key] };
  return handler(req, res);
}

