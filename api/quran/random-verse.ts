import handler from "./[...slug]";

export default function randomVerseHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["random-verse"] };
  return handler(req, res);
}

