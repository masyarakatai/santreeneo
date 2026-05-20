# AyahQuest (Santree Go) - Quran Foundation Hackathon 2026

AyahQuest is a mobile-first, Pokémon GO-inspired adventure that strengthens your connection with the Quran through location-based discovery and interactive learning.

## 🚀 Hackathon Highlights
Built for the **Quran Foundation Hackathon**, AyahQuest implements a full loop of engagement using the Quran Foundation API ecosystem.

### 🗺️ Contextual Discovery (Content API)
Using the **Quran.com Content API**, we've implemented "Contextual Spawning":
*   **Mosque Hubs:** Find verses about prayer and community near places of worship.
*   **Weather Reactive:** Verses about rain and mercy appear when it's actually raining (via Open-Meteo).
*   **Time-Based:** Special Fajr quests during the early hours.
*   **Nature Discovery:** Verses about creation appear in parks and near water.

### 🎮 Interactive Learning (Content & User API)
*   **Tajweed Quest:** Collect verses and unlock the **Uthmani Tajweed** view (API: `/uthmani_tajweed`) to learn proper recitation.
*   **Word-by-Word Assembly:** Piece together the Arabic text (API: `words=true`) to understand the linguistic depth of each Ayah.
*   **Streak Tracking (User API):** Daily interaction is tracked via the **Quran Foundation User API** to build lasting habits.
*   **Collections (User API):** Discovered verses are synced to your Quran.com account for later reflection.

## 🛠️ Tech Stack
*   **Frontend:** React (Next.js/Vite), Tailwind CSS, Framer Motion (Motion).
*   **Maps:** Leaflet.js with real-time Geolocation.
*   **Backend:** Node.js Express proxy for Quran Foundation APIs.
*   **Database:** Firebase Auth & Firestore (for localized profile data).

## 📖 API Usage Description
1.  **Content API:**
    *   `/verses/by_key`: Fetching specific verses for thematic discovery.
    *   `/verses/random`: For general exploration nodes.
    *   `text_uthmani_tajweed`: For visual tajweed learning.
    *   `audio`: Autoplay recitation upon quest completion.
    *   `words`: Word-by-word translation and morphology.
2.  **User API:**
    *   `/activity`: Streak tracking and engagement logging.
    *   `/bookmarks`: Saving discovered verses to the user's permanent collection.

## 🏁 Getting Started
1. `npm install`
2. Set `QURAN_CLIENT_ID` and `QURAN_CLIENT_SECRET` in `.env`
3. `npm run dev`
