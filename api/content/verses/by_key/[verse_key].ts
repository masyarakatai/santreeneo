import handler from "../../[...slug]";

export default function versesByKeyHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["verses", "by_key", req.query.verse_key] };
  return handler(req, res);
}

