import handler from "../[...slug]";

export default function chapterInfoHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["chapter-info", req.query.chapter_id] };
  return handler(req, res);
}

