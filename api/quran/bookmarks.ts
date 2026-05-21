import handler from "./[...slug]";

export default function bookmarksHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["bookmarks"] };
  return handler(req, res);
}

