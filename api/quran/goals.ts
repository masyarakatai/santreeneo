import handler from "./[...slug]";

export default function goalsHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["goals"] };
  return handler(req, res);
}

