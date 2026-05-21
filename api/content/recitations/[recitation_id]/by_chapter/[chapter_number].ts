import handler from "../../../[...slug]";

export default function recitationsByChapterHandler(req: any, res: any) {
  req.query = {
    ...req.query,
    slug: ["recitations", req.query.recitation_id, "by_chapter", req.query.chapter_number],
  };
  return handler(req, res);
}

