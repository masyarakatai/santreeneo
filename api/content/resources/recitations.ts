import handler from "../[...slug]";

export default function recitationsHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["resources", "recitations"] };
  return handler(req, res);
}

