import handler from "./[...slug]";

export default function contextualVerseHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["contextual-verse"] };
  return handler(req, res);
}

