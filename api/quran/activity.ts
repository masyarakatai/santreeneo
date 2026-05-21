import handler from "./[...slug]";

export default function activityHandler(req: any, res: any) {
  req.query = { ...req.query, slug: ["activity"] };
  return handler(req, res);
}

