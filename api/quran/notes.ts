import handler from "./[...slug]";

export default function notesHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["notes"] };
  return handler(req, res);
}

