export default function handler(_req: any, res: any) {
  res.status(200).json({
    status: "ok",
    env: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
    has_client_id: !!process.env.QURAN_CLIENT_ID,
    has_client_secret: !!process.env.QURAN_CLIENT_SECRET,
  });
}
