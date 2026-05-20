import * as dotenv from "dotenv";
import express from "express";
import path from "path";
import { createServerClient } from "@quranjs/api/server";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Basic Health Check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      env: process.env.NODE_ENV, 
      vercel: !!process.env.VERCEL,
      has_client_id: !!process.env.QURAN_CLIENT_ID,
      has_client_secret: !!process.env.QURAN_CLIENT_SECRET
    });
  });

  const quranServer = createServerClient({
    clientId: process.env.QURAN_CLIENT_ID || '',
    clientSecret: process.env.QURAN_CLIENT_SECRET || '',
    services: {
      oauth2BaseUrl: "https://prelive-oauth2.quran.foundation"
    }
  });

  // Auth Initiation
  app.get("/api/auth/quran", (req, res) => {
    try {
      const clientId = process.env.QURAN_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({ error: "Missing QURAN_CLIENT_ID" });
      }

      const protocol = process.env.VERCEL ? 'https' : (req.headers['x-forwarded-proto'] || req.protocol);
      const host = req.headers['host'] || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/quran/callback`;
      
      // Removed 'email' as the client is not authorized for it yet
      const scope = 'openid profile bookmarks activity';
      const state = Math.random().toString(36).substring(7);

      const authUrl = `https://prelive-oauth2.quran.foundation/oauth2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
      
      console.log("[AUTH] Initiating with URI:", redirectUri);
      res.redirect(authUrl);
    } catch (err: any) {
      res.status(500).json({ error: "Auth initiation failed", message: err.message });
    }
  });

  // Auth Callback
  app.get("/api/auth/quran/callback", async (req, res) => {
    const { code, error, error_description } = req.query;
    
    if (error) {
      console.error("[AUTH] OAuth Provider Error:", error, error_description);
      return res.redirect(`/?quran_login=error&reason=${encodeURIComponent(error_description as string || (error as string))}`);
    }

    if (!code) {
      return res.redirect('/?quran_login=error&reason=no_code_received');
    }

    try {
      const protocol = process.env.VERCEL ? 'https' : (req.headers['x-forwarded-proto'] || req.protocol);
      const host = req.headers['host'] || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/quran/callback`;

      const tokenResponse = await fetch('https://prelive-oauth2.quran.foundation/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: redirectUri,
          client_id: process.env.QURAN_CLIENT_ID!,
          client_secret: process.env.QURAN_CLIENT_SECRET!,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (!tokenResponse.ok) {
        console.error("[AUTH] Token Exchange Failed:", tokenData);
        const errorMsg = tokenData.error_description || tokenData.error || 'Token exchange failed';
        return res.redirect(`/?quran_login=error&reason=${encodeURIComponent(errorMsg)}`);
      }

      console.log("[AUTH] Token Exchange Success!");
      res.redirect(`/?quran_login=success&access_token=${tokenData.access_token}`);
    } catch (e: any) {
      console.error("[AUTH] Callback Exception:", e.message);
      res.redirect(`/?quran_login=error&reason=${encodeURIComponent(e.message)}`);
    }
  });

  // Proxy Quran APIs
  app.get("/api/quran/random-verse", async (req, res) => {
    try {
      const resp = await fetch('https://api.quran.com/api/v4/verses/random?language=id&translations=33&fields=text_uthmani,text_uthmani_tajweed&audio=7&words=true');
      res.json(await resp.json());
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.get("/api/quran/contextual-verse", async (req, res) => {
    try {
      const resp = await fetch('https://api.quran.com/api/v4/verses/random?language=id&translations=33&fields=text_uthmani,text_uthmani_tajweed&audio=7&words=true');
      res.json(await resp.json());
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.get("/api/quran/chapter-info/:chapterId", async (req, res) => {
    try {
      const info = await quranServer.content.v4.chapters.getInfo(req.params.chapterId as any);
      res.json(info);
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.post("/api/quran/activity", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const resp = await fetch('https://api-prelive.quran.com/api/v4/auth/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify(req.body)
        });
        if (resp.ok) return res.json(await resp.json());
      }
      res.json({ status: "success", source: "mock" });
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.get("/api/quran/bookmarks", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const resp = await fetch('https://api-prelive.quran.com/api/v4/auth/bookmarks', {
        headers: { 'Authorization': authHeader }
      });
      res.json(await resp.json());
    } catch (e) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  // Environment-specific logic
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    // Dynamic import for dev dependency
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.url.startsWith('/api')) return;
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

const appPromise = startServer();

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
