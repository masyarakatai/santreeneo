import handler from "../../[...slug]";

export default function versesByChapterHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["verses", "by_chapter", req.query.chapter_number] };
  return handler(req, res);
}

