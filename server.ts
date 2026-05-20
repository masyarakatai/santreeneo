import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServerClient } from "@quranjs/api/server";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
  });

  const quranServer = createServerClient({
    clientId: process.env.QURAN_CLIENT_ID || '',
    clientSecret: process.env.QURAN_CLIENT_SECRET || '',
    services: {
      oauth2BaseUrl: "https://prelive-oauth2.quran.foundation"
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // Proxy Quran Content API: Get random verse for discovery
  app.get("/api/quran/random-verse", async (req, res) => {
    try {
      const resp = await fetch('https://api.quran.com/api/v4/verses/random?language=id&translations=33&fields=text_uthmani&audio=7');
      if (!resp.ok) throw new Error('API Error');
      const data = await resp.json();
      res.json(data);
    } catch (error: any) {
      console.error("Quran API Error:", error.message);
      res.status(500).json({ error: 'Failed to fetch Quran verse' });
    }
  });

  app.get("/api/quran/contextual-verse", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);

      if (!lat || !lng) {
        return res.status(400).json({ error: 'lat and lng are required' });
      }

      // Check Time (server time as proxy, or local time if provided. Let's use server time localized somewhat, or just simple check)
      const hour = new Date().getUTCHours() + 7; // Assuming WIB/Jakarta for demonstration if no timezone provided
      const localHour = hour % 24;
      const isFajr = localHour >= 4 && localHour <= 6;

      // Check Weather
      let isRaining = false;
      try {
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
        if (weatherRes.ok) {
          const wData = await weatherRes.json();
          const code = wData.current_weather?.weathercode || 0;
          // Rain codes in WMO: 51-67, 80-82, 95-99
          if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) {
            isRaining = true;
          }
        }
      } catch (e) {
        console.error("Weather fetch failed:", e);
      }

      // Check Nearby Places (Overpass API - limit timeout and radius)
      let nearbyContext = 'none';
      try {
        const overpassQuery = `
          [out:json][timeout:1];
          (
            node["amenity"="place_of_worship"](around:200,${lat},${lng});
            node["leisure"="park"](around:200,${lat},${lng});
            node["natural"="water"](around:200,${lat},${lng});
          );
          out body 1;
        `;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        const overpassRes = await fetch(`https://overpass-api.de/api/interpreter`, {
          method: 'POST',
          body: overpassQuery,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (overpassRes.ok) {
          const oData = await overpassRes.json();
          if (oData.elements && oData.elements.length > 0) {
            const tags = oData.elements[0].tags;
            if (tags.amenity === 'place_of_worship') nearbyContext = 'mosque';
            else if (tags.leisure === 'park') nearbyContext = 'park';
            else if (tags.natural === 'water') nearbyContext = 'water';
          }
        }
      } catch (e: any) {
        // Silently fail and fallback to random verse if Overpass is blocked/timeouts
      }

      // Contextual Verse Mapping
      const thematicMapping: Record<string, string[]> = {
        rain: ["24:43", "30:48", "7:57"],
        fajr: ["89:1", "89:2", "89:3", "74:34"],
        mosque: ["9:18", "72:18", "24:36"],
        park: ["3:190", "13:3", "78:6", "6:99"],
        water: ["21:30", "25:54", "24:45"]
      };

      let selectedTheme = 'none';
      if (nearbyContext === 'mosque') selectedTheme = 'mosque';
      else if (isRaining) selectedTheme = 'rain';
      else if (isFajr) selectedTheme = 'fajr';
      else if (nearbyContext === 'water') selectedTheme = 'water';
      else if (nearbyContext === 'park') selectedTheme = 'park';

      let verseData = null;

      if (selectedTheme !== 'none') {
        const candidates = thematicMapping[selectedTheme];
        const verseKey = candidates[Math.floor(Math.random() * candidates.length)];
        const resp = await fetch(`https://api.quran.com/api/v4/verses/by_key/${verseKey}?language=id&translations=33&fields=text_uthmani&audio=7`);
        if (resp.ok) {
          verseData = await resp.json();
          verseData.verse.metadata = { theme: selectedTheme, isContextual: true };
        }
      }

      // Fallback to random verse if no context matched or fetch failed
      if (!verseData) {
        const resp = await fetch('https://api.quran.com/api/v4/verses/random?language=id&translations=33&fields=text_uthmani&audio=7');
        if (!resp.ok) throw new Error('API Error');
        verseData = await resp.json();
      }

      res.json(verseData);
    } catch (error: any) {
      console.error("Quran Contextual API Error:", error.message);
      res.status(500).json({ error: 'Failed to fetch contextual verse' });
    }
  });

  // Proxy Quran Content API: Get chapter info
  app.get("/api/quran/chapter-info/:chapterId", async (req, res) => {
    try {
      const { chapterId } = req.params;
      const info = await quranServer.content.v4.chapters.getInfo(chapterId as any);
      res.json(info);
    } catch (error: any) {
      console.error("Quran API Error:", error.message);
      res.status(500).json({ error: 'Failed to fetch chapter info' });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
