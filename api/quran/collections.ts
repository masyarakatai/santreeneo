import handler from "./[...slug]";

export default function collectionsHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["collections"] };
  return handler(req, res);
}

