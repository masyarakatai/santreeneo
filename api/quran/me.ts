import handler from "./[...slug]";

export default function meHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["me"] };
  return handler(req, res);
}

