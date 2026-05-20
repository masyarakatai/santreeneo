import { createServerClient } from "@quranjs/api/server";
import * as dotenv from "dotenv";

dotenv.config();

async function test() {
  const quranServer = createServerClient({
    clientId: process.env.QURAN_CLIENT_ID || '',
    clientSecret: process.env.QURAN_CLIENT_SECRET || '',
    services: {
      oauth2BaseUrl: "https://prelive-oauth2.quran.foundation",
      contentBaseUrl: "https://api-prelive.quran.com",
    }
  });
  try {
    const verse = await quranServer.content.v4.verses.random({
      translations: "33",
      fields: "text_uthmani",
    } as any);
    console.log(JSON.stringify(verse, null, 2));
  } catch(e) {
    console.error(e);
  }
}

test();
