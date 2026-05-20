import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Star, 
  X,
  LogIn,
  Navigation,
  Compass,
  Map as MapIcon,
  RefreshCcw,
  Trophy
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  handleFirestoreError, 
  OperationType, 
  Waypoint 
} from './lib/firebase';
import { playSound } from './lib/sounds';
import { 
  onSnapshot, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createPublicClient } from '@quranjs/api/public';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

const quranPublic = createPublicClient({
  clientId: import.meta.env.VITE_QURAN_CLIENT_ID || 'b952392b-b89f-4b66-93a8-60e2dfb82ae4',
  clientType: 'public',
  services: {
    oauth2BaseUrl: import.meta.env.VITE_QURAN_OAUTH2_BASE_URL || "https://prelive-oauth2.quran.foundation"
  }
});

type AppLang = 'id' | 'en';
const APP_LANG_KEY = 'santree_app_lang';
const QURAN_AUTH_STORAGE_KEY = 'santree_quran_auth';
const QURAN_AUDIO_RECITER_KEY = 'santree_quran_audio_reciter';
const PROFILE_STYLE_KEY = 'santree_profile_style';
const QURAN_SYNC_QUEUE_KEY = 'santree_quran_sync_queue';
const DEFAULT_FALLBACK_COORDS: [number, number] = [-6.2088, 106.8456]; // Jakarta
const AUDIO_RECITERS = [
  { id: '7', label: 'Mishari Rashid Alafasy' },
  { id: '1', label: 'AbdulBaset AbdulSamad' },
  { id: '3', label: 'Mahmoud Khalil Al-Husary' },
  { id: '5', label: 'Saud Al-Shuraim' }
];
const PROFILE_STYLE_AVATAR: Record<string, string> = {
  ikhwan: '🧔🏻',
  akhwat: '🧕🏻',
  explorer: '🧭',
  seeker: '✨',
};
const verseInsightCache = new Map<string, string | null>();

type QuranGoal = { id: string; title: string; target: number; progress: number };
type QuranNote = { id: string; verseKey: string; content: string };
type QuranCollection = { id: string; name: string; count?: number };
type SyncStatus = 'idle' | 'synced' | 'pending' | 'failed' | 'syncing';
type SyncQueueItem = {
  id: string;
  endpoint: '/api/quran/goals' | '/api/quran/notes' | '/api/quran/collections';
  payload: any;
  method: 'POST';
};
type JourneyView = 'progress' | 'replay';

const SURAH_AYAH_COUNTS: number[] = [
  0,7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6
];

const UI_TEXT: Record<string, string> = {
  map: 'Map',
  scrolls: 'Journey',
  leaders: 'Rank',
  profile: 'Profile',
  loginQuran: 'LOGIN WITH QURAN.COM',
  guest: 'CONTINUE AS GUEST',
  guiding: 'GUIDING YOUR PATH...',
  language: 'Language',
  logout: 'LOG OUT',
  synced: 'Synced with Quran.com Bookmarks',
  claimReward: 'CLAIM REWARD',
  loginSubtitle: 'Unlock your Quranic potential. We use Quran.com to sync your progress, bookmarks, and streaks.',
  locationErrorTitle: 'Location Not Found',
  locationErrorBody: 'Ensure GPS permission is enabled in your browser. If you are in AI Studio preview, open the app in a new tab.',
  retry: 'Retry',
  searchingLocation: 'Finding your real position...',
  locationHint: 'Location accuracy on desktop may be limited. Use mobile for real GPS.',
  leaderboardTitle: 'Rank',
  collectionTitle: 'Journey',
  noAyah: 'No verses found yet.',
  startExplore: 'Start Exploring',
  savedToAccount: 'Saved to Account',
  scrollsStat: 'Scrolls',
  masteryStat: 'Mastery',
  back: 'BACK',
  termsTitle: 'Santree Go - Terms and Conditions',
  privacyTitle: 'Santree Go - Privacy Policy',
  effectiveDate: 'Effective Date',
  contactQ: 'Questions? Contact us at',
  manualLocation: 'Manual Location',
  manualLocationHint: 'GPS issue? Type your city/area and choose one location.',
  searchPlaceholder: 'Example: Jakarta, Bandung, Surabaya',
  search: 'Search',
  searching: 'Searching...',
  useThisLocation: 'Use This Location',
  noLocationResults: 'No locations found.',
  farMode: 'LONG-RANGE DISCOVERY',
  nearMode: 'SACRED ZONE BONUS',
  heartsLabel: 'Hearts',
  puzzleFailed: 'Out of hearts. Mission failed for this verse.',
  closeFailed: 'Find another scroll',
  qari: 'Qari / Reciter',
  profileStyle: 'Profile Style',
  ikhwan: 'Muslim Man',
  akhwat: 'Muslim Woman',
  xpToNext: 'XP to Next Level',
  modeArrange: 'Word Chain',
  modeContinue: 'Continue Verse',
  modeMeaning: 'Guess Meaning',
  modeAudio: 'Audio Surah Quiz',
  settings: 'Settings',
  impactPanel: 'Impact Panel',
  goalsReflections: 'Goals & Reflections',
  saveGoal: 'Save Goal',
  saveNote: 'Save Note',
  addCollection: 'Add',
  syncRetry: 'Retry Sync',
  journeyProgress: 'Surah Progress',
  journeyReplay: 'Replay Ayahs',
  yourRank: 'Your Rank',
  resetSync: 'Reset Sync',
  essence: 'Essence',
};

const SURAH_NAMES: Record<number, string> = {
  1: "Al-Fatihah", 2: "Al-Baqarah", 3: "Ali 'Imran", 4: "An-Nisa", 5: "Al-Ma'idah", 6: "Al-An'am",
  7: "Al-A'raf", 8: "Al-Anfal", 9: "At-Tawbah", 10: "Yunus", 11: "Hud", 12: "Yusuf",
  13: "Ar-Ra'd", 14: "Ibrahim", 15: "Al-Hijr", 16: "An-Nahl", 17: "Al-Isra", 18: "Al-Kahf",
  19: "Maryam", 20: "Ta-Ha", 21: "Al-Anbiya", 22: "Al-Hajj", 23: "Al-Mu'minun", 24: "An-Nur",
  25: "Al-Furqan", 26: "Ash-Shu'ara", 27: "An-Naml", 28: "Al-Qasas", 29: "Al-Ankabut", 30: "Ar-Rum",
  31: "Luqman", 32: "As-Sajdah", 33: "Al-Ahzab", 34: "Saba", 35: "Fatir", 36: "Ya-Sin",
  37: "As-Saffat", 38: "Sad", 39: "Az-Zumar", 40: "Ghafir", 41: "Fussilat", 42: "Ash-Shura",
  43: "Az-Zukhruf", 44: "Ad-Dukhan", 45: "Al-Jathiyah", 46: "Al-Ahqaf", 47: "Muhammad", 48: "Al-Fath",
  49: "Al-Hujurat", 50: "Qaf", 51: "Adh-Dhariyat", 52: "At-Tur", 53: "An-Najm", 54: "Al-Qamar",
  55: "Ar-Rahman", 56: "Al-Waqi'ah", 57: "Al-Hadid", 58: "Al-Mujadilah", 59: "Al-Hashr", 60: "Al-Mumtahanah",
  61: "As-Saff", 62: "Al-Jumu'ah", 63: "Al-Munafiqun", 64: "At-Taghabun", 65: "At-Talaq", 66: "At-Tahrim",
  67: "Al-Mulk", 68: "Al-Qalam", 69: "Al-Haqqah", 70: "Al-Ma'arij", 71: "Nuh", 72: "Al-Jinn",
  73: "Al-Muzzammil", 74: "Al-Muddaththir", 75: "Al-Qiyamah", 76: "Al-Insan", 77: "Al-Mursalat", 78: "An-Naba",
  79: "An-Nazi'at", 80: "Abasa", 81: "At-Takwir", 82: "Al-Infitar", 83: "Al-Mutaffifin", 84: "Al-Inshiqaq",
  85: "Al-Buruj", 86: "At-Tariq", 87: "Al-A'la", 88: "Al-Ghashiyah", 89: "Al-Fajr", 90: "Al-Balad",
  91: "Ash-Shams", 92: "Al-Layl", 93: "Ad-Duha", 94: "Ash-Sharh", 95: "At-Tin", 96: "Al-'Alaq",
  97: "Al-Qadr", 98: "Al-Bayyinah", 99: "Az-Zalzalah", 100: "Al-'Adiyat", 101: "Al-Qari'ah", 102: "At-Takathur",
  103: "Al-'Asr", 104: "Al-Humazah", 105: "Al-Fil", 106: "Quraysh", 107: "Al-Ma'un", 108: "Al-Kawthar",
  109: "Al-Kafirun", 110: "An-Nasr", 111: "Al-Masad", 112: "Al-Ikhlas", 113: "Al-Falaq", 114: "An-Nas"
};

// --- Components ---

const LoginOverlay = ({ onGuestLogin, onQuranLogin }: { onGuestLogin: () => void, onQuranLogin: () => void,   }) => {
  const t = UI_TEXT;
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-surface p-6 text-center overflow-hidden bg-pattern">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-surface-container-high neubrutalist-border hard-shadow w-full max-w-sm rounded-3xl p-10 flex flex-col items-center gap-8 relative"
      >
        <div className="w-24 h-24 bg-tertiary-fixed rounded-full neubrutalist-border flex items-center justify-center text-4xl shadow-[6px_6px_0px_0px_rgba(34,26,20,1)] hover:-translate-y-2 transition-transform cursor-pointer">
          🧭
        </div>
        <div>
          <h1 className="text-4xl font-headline-md font-bold text-on-surface uppercase mb-2 text-center">Santree Go</h1>
          <p className="text-on-surface font-label-bold uppercase tracking-widest text-[10px] text-center font-bold">A Journey to Enlightenment</p>
        </div>
        
        <div className="flex flex-col gap-4 w-full">
          {window.location.hostname === 'localhost' && (
            <button 
              onClick={() => {
                window.location.href = '/?quran_login=success#access_token=mock_token_for_dev';
              }}
              className="w-full bg-yellow-400 text-on-surface font-label-bold py-2 rounded-xl border-2 border-on-surface shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-[10px] mb-2 uppercase"
            >
              🛠️ DEV: MOCK QURAN LOGIN
            </button>
          )}
          <button 
            onClick={onQuranLogin}
            className="w-full bg-brand-neon text-on-surface font-headline-md font-bold py-5 rounded-2xl flex items-center justify-center gap-3 neubrutalist-border hard-shadow neubrutalist-interaction transition-all"
          >
            <img src="https://quran.com/images/logos/logo-quran.png" alt="Quran" className="w-8 h-8 invert" />
            {t.loginQuran}
          </button>

          <button 
            onClick={onGuestLogin}
            className="w-full bg-surface text-on-surface font-label-bold py-3 rounded-xl flex items-center justify-center gap-3 neubrutalist-border hard-shadow neubrutalist-interaction transition-all border-dashed text-xs opacity-70"
          >
            {t.guest}
          </button>
        </div>

        <p className="text-[11px] text-on-surface italic px-4 leading-relaxed">{t.loginSubtitle}</p>
      </motion.div>
    </div>
  );
};

const XPHeader = ({ xp, rank, streak }: { xp: number, rank: string, streak: number,   }) => {
  const t = UI_TEXT;
  const level = Math.floor(xp / 100) + 1;
  const currentLevelXP = xp % 100;

  return (
    <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[1000] flex items-center justify-between px-4 py-2 pointer-events-none">
      <div className="w-full rounded-full mx-2 mt-2 border-4 border-on-surface shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-primary flex items-center justify-between p-2 pointer-events-auto">
        {/* Left: Profile Badge */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="w-12 h-12 rounded-full border-2 border-on-surface overflow-hidden bg-brand-secondary text-2xl flex items-center justify-center">
            👦🏻
          </div>
          <div className="flex flex-col bg-surface-container rounded-lg px-2 py-0.5 border-2 border-on-surface">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[#ff5722] text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
              <span className="font-label-bold text-[10px] text-on-surface">{streak}</span>
            </div>
          </div>
        </div>
        
        {/* Center: Goal & Progress */}
        <div className="flex-1 px-4 flex flex-col justify-center items-center">
          <span className="text-on-primary font-label-bold text-[10px] uppercase tracking-wider mb-1">{t.xpToNext}</span>
          <div className="w-full h-4 bg-on-surface rounded-full border-2 border-on-surface overflow-hidden relative">
            <div className="absolute top-0 left-0 h-full bg-[#D4FF00] border-r-2 border-on-surface transition-all duration-1000" style={{ width: `${currentLevelXP}%` }}></div>
          </div>
        </div>
        
        {/* Right: Stats */}
        <div className="flex-shrink-0 flex items-center space-x-1 bg-surface-container rounded-full px-3 py-1 border-2 border-on-surface">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>stars</span>
          <span className="font-label-bold text-xs uppercase tracking-wider font-bold text-on-surface">LV {level}</span>
        </div>
      </div>
    </header>
  );
};

import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet markers in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// User Marker Component to auto-center
const UserLocationTracker = ({ coords }: { coords: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(coords, map.getZoom(), { animate: true });
  }, [coords, map]);
  return null;
};

// Re-center control component
const MapRecenterControl = ({ coords }: { coords: [number, number] }) => {
  const map = useMap();
  return (
    <div className="absolute right-6 bottom-32 z-[1000] flex flex-col gap-4">
      <button 
        onClick={(e) => {
          e.stopPropagation();
          playSound('open');
          map.setView(coords, 19, { animate: true });
        }}
        className="w-12 h-12 bg-surface rounded-full neubrutalist-border flex items-center justify-center neubrutalism-shadow neubrutalism-active transition-transform"
      >
        <span className="material-symbols-outlined text-on-surface">my_location</span>
      </button>
    </div>
  );
};

const SmartRadar = ({ 
  userCoords, 
  waypoints, 
  collectedIds, 
  onWaypointClick,
  nearRange,
  greenStartRange,
  lockRange,
  lockMaxRange
}: { 
  userCoords: [number, number], 
  waypoints: Waypoint[], 
  collectedIds: Set<string>,
  onWaypointClick: (wp: Waypoint) => void,
  nearRange: number,
  greenStartRange: number,
  lockRange: number,
  lockMaxRange: number
}) => {
  const getDistanceMeters = (from: [number, number], to: [number, number]) => {
    const R = 6371e3;
    const f1 = from[0] * Math.PI / 180;
    const f2 = to[0] * Math.PI / 180;
    const df = (to[0] - from[0]) * Math.PI / 180;
    const dl = (to[1] - from[1]) * Math.PI / 180;
    const a = Math.sin(df / 2) * Math.sin(df / 2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const offsetFrom = (origin: [number, number], angleRad: number, meters: number): [number, number] => {
    const dLat = (meters * Math.sin(angleRad)) / 111320;
    const dLng = (meters * Math.cos(angleRad)) / (111320 * Math.cos((origin[0] * Math.PI) / 180));
    return [origin[0] + dLat, origin[1] + dLng];
  };
  
  const createAyahIcon = (zone: 'gold' | 'green' | 'gray') => new L.DivIcon({
    className: 'leaflet-div-icon',
    html: `
      <div class="relative flex flex-col items-center">
        <div class="w-11 h-11 rounded-xl neubrutalist-border flex items-center justify-center cursor-pointer transition-transform hover:-translate-y-1 relative ${zone === 'gold' ? 'marker-gold-glow' : zone === 'green' ? 'marker-emerald-glow' : 'marker-gray-locked'}">
          <span class="text-xl leading-none">${zone === 'gray' ? '🔒' : '📜'}</span>
        </div>
      </div>
    `
  });
  const spreadOverlappingWaypoints = (items: Waypoint[]) => {
    const thresholdMeters = 8;
    const groups: Waypoint[][] = [];

    for (const wp of items) {
      let placed = false;
      for (const group of groups) {
        const anchor = group[0];
        const d = getDistanceMeters([anchor.lat, anchor.lng], [wp.lat, wp.lng]);
        if (d <= thresholdMeters) {
          group.push(wp);
          placed = true;
          break;
        }
      }
      if (!placed) groups.push([wp]);
    }

    const toLat = (meters: number) => meters / 111320;
    const toLng = (meters: number, lat: number) => meters / (111320 * Math.cos((lat * Math.PI) / 180));

    return groups.flatMap((group) => {
      if (group.length === 1) {
        const only = group[0] as Waypoint & { displayLat?: number; displayLng?: number };
        only.displayLat = only.lat;
        only.displayLng = only.lng;
        return [only];
      }

      const centerLat = group.reduce((s, w) => s + w.lat, 0) / group.length;
      const centerLng = group.reduce((s, w) => s + w.lng, 0) / group.length;
      // Smaller icons allow tighter cluster spread while still readable.
      const baseRadius = Math.max(10, Math.min(22, 7 + group.length * 1.5)); // meters

      return group.map((wp, idx) => {
        const angle = (2 * Math.PI * idx) / group.length;
        const ring = Math.floor(idx / 6);
        const r = baseRadius + ring * 8;
        const dLat = toLat(r * Math.sin(angle));
        const dLng = toLng(r * Math.cos(angle), centerLat);
        return {
          ...wp,
          displayLat: centerLat + dLat,
          displayLng: centerLng + dLng,
        };
      });
    });
  };

  const visibleWaypoints = spreadOverlappingWaypoints(
    waypoints.filter((wp) => {
      if (collectedIds.has(wp.ayahKey)) return false;
      const dist = getDistanceMeters(userCoords, [wp.lat, wp.lng]);
      if (dist > lockMaxRange) return false;
      // Leave a "quiet gap" between gold and green zones.
      return dist <= nearRange || dist >= greenStartRange;
    })
  );

  // Custom Icon for user
  const userIcon = new L.DivIcon({
    className: 'leaflet-div-icon',
    html: `
      <div class="relative flex flex-col items-center z-50">
        <div class="w-14 h-14 bg-primary-container rounded-full neubrutalist-border flex items-center justify-center neubrutalism-shadow">
          <span class="text-3xl">👦🏻</span>
        </div>
      </div>
    `
  });

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
      {/* Real Map Canvas Renderer via Leaflet */}
      <div className="absolute inset-0 z-20">
        <MapContainer 
          center={userCoords} 
          zoom={19} 
          zoomControl={false}
          style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
        >
          {/* Positron or Voyager maps */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          
          <UserLocationTracker coords={userCoords} />

          {/* User Marker */}
          <Marker position={userCoords} icon={userIcon} zIndexOffset={100} />
          <Circle
            center={userCoords}
            radius={nearRange}
            pathOptions={{
              color: '#0b6b1d',
              weight: 2,
              fillColor: '#82db7e',
              fillOpacity: 0.15,
              dashArray: '6 6'
            }}
          />

          {/* Interactive Waypoints */}
          {visibleWaypoints.map((wp) => {
            const dist = getDistanceMeters(userCoords, [wp.lat, wp.lng]);
            const zone: 'gold' | 'green' | 'gray' =
              dist <= nearRange ? 'gold' : (dist >= greenStartRange && dist <= lockRange ? 'green' : 'gray');
            const rawLat = (wp as any).displayLat ?? wp.lat;
            const rawLng = (wp as any).displayLng ?? wp.lng;
            const rawPos: [number, number] = [rawLat, rawLng];
            const minUserClearance = 22; // meters, keep waypoints visible around user marker
            const distFromUserToRaw = getDistanceMeters(userCoords, rawPos);
            let markerPos: [number, number] = rawPos;
            if (distFromUserToRaw < minUserClearance) {
              const angle = Math.atan2(rawPos[0] - userCoords[0], rawPos[1] - userCoords[1]);
              markerPos = offsetFrom(userCoords, angle, minUserClearance + Math.random() * 8);
            }

            return (
              <Marker 
                key={wp.id} 
                position={markerPos} 
                icon={createAyahIcon(zone)}
                eventHandlers={{
                  click: () => onWaypointClick(wp),
                }}
              />
            );
          })}

          <MapRecenterControl coords={userCoords} />
        </MapContainer>
      </div>
    </div>
  );
};

const AyahModal = ({ waypoint, onCollect, onClose }: { waypoint: Waypoint & { isFar?: boolean, distance?: number, replayOnly?: boolean }, onCollect: () => void, onClose: () => void,   }) => {
  type GameMode = 'arrange' | 'continue' | 'meaning' | 'audio';
  const t = UI_TEXT;
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightData, setInsightData] = useState<{ translation: string | null } | null>(null);
  const stripHtml = (input: string) => input.replace(/<[^>]*>/g, ' ');
  const removeTrailingAyahMarker = (input: string) =>
    input
      // Normalize nbsp
      .replace(/\u00A0/g, ' ')
      // Remove ending ayah symbol/marker patterns like: ۝٣٨ , ﴿٣٨﴾ , (38)
      .replace(/[\s]*[۝]?\s*[﴿(]?\s*[0-9٠-٩]{1,3}\s*[﴾)]?\s*$/u, '')
      .trim();
  const getCleanArabicText = () => {
    // Prefer plain Arabic text to avoid broken glyph shaping from stripped tajweed HTML.
    const source = (waypoint.arabicText || '').trim() || (waypoint.tajweedText || '').trim();
    return removeTrailingAyahMarker(stripHtml(source));
  };
  const normalizeArabicToken = (input: string) =>
    input
      // Remove Arabic diacritics and tatweel
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      // Remove punctuation/symbols and whitespace, but keep Arabic letters and Quranic signs for attachment logic
      .replace(/[^\u0621-\u063A\u0641-\u064A\u06D6-\u06ED]/g, '')
      .trim();
  const isWaqfOnlyToken = (input: string) => {
    const compact = input.replace(/\s+/g, '');
    return compact.length > 0 && /^[\u06D6-\u06ED]+$/.test(compact);
  };
  const mergeWaqfToPrevious = (pairs: { text: string; translation: string }[]) => {
    const merged: { text: string; translation: string }[] = [];
    for (const pair of pairs) {
      const text = (pair.text || '').trim();
      if (!text) continue;
      if (isWaqfOnlyToken(text) && merged.length > 0) {
        merged[merged.length - 1].text = `${merged[merged.length - 1].text}${text}`;
        continue;
      }
      merged.push({ text, translation: pair.translation || '' });
    }
    return merged;
  };
  const wordPairs = useMemo(() => {
    if (waypoint.wordsData && waypoint.wordsData.length > 0) {
      const fromWordsDataRaw = waypoint.wordsData
        .filter((w) => normalizeArabicToken(w?.text || '').length > 0)
        .map((w) => ({
          text: (w.text || '').trim(),
          translation: (w.translation || '').trim()
        }));
      const fromWordsData = mergeWaqfToPrevious(fromWordsDataRaw);
      if (fromWordsData.length > 0) return fromWordsData;
    }
    const rawArabic = (waypoint.arabicText || '').trim() || stripHtml(waypoint.tajweedText || '').trim();
    const fallbackRaw = rawArabic
      .split(' ')
      .map((w) => w.trim())
      .filter((w) => normalizeArabicToken(w).length > 0)
      .map((text) => ({ text, translation: '' }));
    return mergeWaqfToPrevious(fallbackRaw);
  }, [waypoint.wordsData, waypoint.arabicText, waypoint.tajweedText]);
  const words = useMemo(() => wordPairs.map((w) => w.text), [wordPairs]);
  const [shuffledBank, setShuffledBank] = useState<{word: string, translation: string, id: number}[]>([]);
  const [selectedWords, setSelectedWords] = useState<number[]>([]);
  const [isError, setIsError] = useState(false);
  const [hearts, setHearts] = useState(3);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false);
  const celebrationPlayedRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showFullAyah, setShowFullAyah] = useState(false);
  const [showFullTranslation, setShowFullTranslation] = useState(false);
  const [showTranslationPeek, setShowTranslationPeek] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>('arrange');
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [quizSelected, setQuizSelected] = useState<string | null>(null);
  const [quizCorrect, setQuizCorrect] = useState<string | null>(null);
  const [audioQuizPlaying, setAudioQuizPlaying] = useState(false);
  const [audioSnippetStage, setAudioSnippetStage] = useState(1);
  const [continueGapIndex, setContinueGapIndex] = useState<number>(-1);
  const randomizeGameMode = useCallback(() => {
    const modes: GameMode[] = ['arrange', 'continue', 'meaning', 'audio'];
    return modes[Math.floor(Math.random() * modes.length)];
  }, []);
  const maxHearts = gameMode === 'audio' || gameMode === 'continue' || gameMode === 'meaning' ? 2 : 3;

  useEffect(() => {
    if (waypoint.audioUrl) {
      audioRef.current = new Audio(waypoint.audioUrl);
      audioRef.current.onloadedmetadata = () => {
        setAudioDuration(Number.isFinite(audioRef.current?.duration) ? (audioRef.current?.duration || 0) : 0);
      };
      audioRef.current.ontimeupdate = () => {
        setAudioCurrentTime(audioRef.current?.currentTime || 0);
      };
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setAudioCurrentTime(audioRef.current?.duration || 0);
      };
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onloadedmetadata = null;
        audioRef.current.ontimeupdate = null;
        audioRef.current.onended = null;
        audioRef.current = null;
      }
    };
  }, [waypoint.audioUrl]);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };
  const formatPlaybackTime = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const shuffleArray = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);


  useEffect(() => {
    // Shuffle words for bank
    const bank = wordPairs.map((w, i) => ({ word: w.text, translation: w.translation, id: i })).sort(() => Math.random() - 0.5);
    setShuffledBank(bank);
  }, [wordPairs]);

  const handleWordClick = (id: number) => {
    if (hearts <= 0) return;
    if (selectedWords.includes(id)) return;
    
    const nextExpectedWord = words[selectedWords.length];
    const clickedWord = shuffledBank.find(w => w.id === id)?.word;
    
    if (clickedWord === nextExpectedWord) {
      setSelectedWords(p => [...p, id]);
      playSound('open');
    } else {
      setIsError(true);
      playSound('error');
      setHearts((prev) => Math.max(0, prev - 1));
      setTimeout(() => setIsError(false), 500);
    }
  };

  const removeWord = (indexToRemove: number) => {
    // Only allow removing the last selected word
    if (indexToRemove !== selectedWords.length - 1) return;
    playSound('error');
    setSelectedWords(p => p.slice(0, -1));
  };

  const hasArrangeWords = words.length > 0 && hearts > 0;
  const continuePromptWords = useMemo(
    () => words.map((w, i) => (i === continueGapIndex ? '__GAP__' : w)),
    [words, continueGapIndex]
  );
  const isComplete =
    (gameMode === 'arrange' && hasArrangeWords && selectedWords.length === words.length) ||
    (gameMode !== 'arrange' && !!quizCorrect && quizSelected === quizCorrect);
  const playbackCompleted = !audioRef.current || audioDuration === 0 || audioCurrentTime >= Math.max(0, audioDuration - 0.25);
  const cleanArabicText = getCleanArabicText();
  const isLongAyah = cleanArabicText.length > 180 || cleanArabicText.split(/\s+/).length > 24;
  const activeTranslation = insightData?.translation || waypoint.translation || 'Translation unavailable.';
  const isLongTranslation = activeTranslation.length > 170;
  const decoyTranslations = useMemo(() => ([
    'All praise is due to Allah, Lord of the worlds.',
    'So which of your Lord’s favors will you deny?',
    'Say: He is Allah, the One.',
    'It is You alone we worship and You alone we ask for help.',
    'Indeed, Allah is with the patient.'
  ]), []);
  const [surahNoStr] = (waypoint.ayahKey || '').split(':');
  const currentSurahNo = Number(surahNoStr) || 1;
  const currentSurahName = SURAH_NAMES[currentSurahNo] || `${currentSurahNo}`;

  const getLabelForMode = (mode: GameMode) => {
    if (mode === 'arrange') return t.modeArrange;
    if (mode === 'continue') return t.modeContinue;
    if (mode === 'meaning') return t.modeMeaning;
    return t.modeAudio;
  };
  const modePanelTone = (mode: GameMode) => {
    if (mode === 'arrange') return "from-[#f8fff2] to-[#eefde2]";
    if (mode === 'continue') return "from-[#f7fbff] to-[#e9f4ff]";
    if (mode === 'meaning') return "from-[#fffaf3] to-[#fff1dc]";
    return "from-[#f6f4ff] to-[#ede8ff]";
  };
  const closeLocked = !!quizSelected && quizSelected !== quizCorrect;
  const requestClose = () => {
    if (isClosing) return;
    if (closeLocked && hearts > 0) return; // Only lock if they still have hearts to play with
    setIsClosing(true);
    setTimeout(() => onClose(), 220);
  };
  const handleClaimAndClose = async () => {
    if (isClosing) return;
    setIsClosing(true);
    await onCollect();
    setTimeout(() => onClose(), 260);
  };
  const consumeHeart = () => {
    setIsError(true);
    playSound('error');
    setHearts((prev) => Math.max(0, prev - 1));
    setTimeout(() => setIsError(false), 700);
  };

  const buildContinueOptions = useCallback(() => {
    if (words.length === 0) return;
    let gapIdx = words.length - 1;
    if (words.length >= 4) {
      const min = 1;
      const max = words.length - 2;
      gapIdx = Math.floor(Math.random() * (max - min + 1)) + min;
    }
    const continueAnswer = words[gapIdx];
    if (!continueAnswer) return;
    setContinueGapIndex(gapIdx);
    const fallbackArabic = ['اللَّهُ', 'الرَّحْمَٰنُ', 'الْعَالَمِينَ', 'الصِّرَاطَ', 'الْكَوْثَرَ', 'النَّاسِ'];
    const pool = [...new Set(words.filter((w) => w !== continueAnswer).concat(fallbackArabic))].filter(Boolean);
    const distractors = shuffleArray(pool).slice(0, 3);
    const options = shuffleArray([continueAnswer, ...distractors]).slice(0, 4);
    setQuizCorrect(continueAnswer);
    setQuizOptions(options);
    setQuizSelected(null);
  }, [words]);

  const buildMeaningOptions = useCallback(() => {
    const correct = activeTranslation;
    const pool = decoyTranslations.filter((d) => d !== correct);
    const distractors = shuffleArray(pool).slice(0, 3);
    const options = shuffleArray([correct, ...distractors]).slice(0, 4);
    setQuizCorrect(correct);
    setQuizOptions(options);
    setQuizSelected(null);
  }, [activeTranslation, decoyTranslations]);

  const buildAudioSurahOptions = useCallback(() => {
    const indexes = Array.from({ length: 114 }, (_, i) => i + 1).filter((n) => n !== currentSurahNo);
    const distractorNos = shuffleArray(indexes).slice(0, 3);
    const options = shuffleArray([currentSurahNo, ...distractorNos]).map((n) => SURAH_NAMES[n] || String(n));
    setQuizCorrect(currentSurahName);
    setQuizOptions(options);
    setQuizSelected(null);
  }, [currentSurahNo, currentSurahName]);

  const playAudioSnippet = useCallback((stage?: number) => {
    if (!audioRef.current) return;
    const activeStage = stage ?? audioSnippetStage;
    const stageMap: Record<number, { start: number; durationMs: number }> = {
      1: { start: 0, durationMs: 8000 },
      2: { start: 8, durationMs: 12000 },
    };
    const cfg = stageMap[activeStage] || stageMap[1];
    try {
      audioRef.current.currentTime = cfg.start;
      audioRef.current.play().then(() => {
        setAudioQuizPlaying(true);
        setIsPlaying(true);
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
            setAudioQuizPlaying(false);
          }
        }, cfg.durationMs);
      }).catch(() => {});
    } catch {
      // no-op
    }
  }, [audioSnippetStage]);

  const handleQuizChoice = (choice: string) => {
    if (!quizCorrect || hearts <= 0 || quizSelected) return;
    setQuizSelected(choice);
    
    if (choice === quizCorrect) {
      playSound('open');
    } else {
      consumeHeart();
      
      // Allow trying another option after a delay
      setTimeout(() => {
        setQuizSelected(null);
        if (gameMode === 'audio' && hearts > 1 && audioSnippetStage < 2) {
          const nextStage = audioSnippetStage + 1;
          setAudioSnippetStage(nextStage);
          playAudioSnippet(nextStage);
        }
      }, 850);
    }
  };

  useEffect(() => {
    if (isComplete && !celebrationPlayedRef.current) {
      celebrationPlayedRef.current = true;

      confetti({
        particleCount: 140,
        spread: 80,
        angle: 60,
        origin: { x: 0.05, y: 0.75 },
        colors: ['#D4FF00', '#10B981', '#FFFFFF'],
        zIndex: 9999,
        disableForReducedMotion: false,
      });
      confetti({
        particleCount: 140,
        spread: 80,
        angle: 120,
        origin: { x: 0.95, y: 0.75 },
        colors: ['#D4FF00', '#10B981', '#FFFFFF'],
        zIndex: 9999,
        disableForReducedMotion: false,
      });

      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play()
          .then(() => {
            setIsPlaying(true);
            setAutoPlayBlocked(false);
          })
          .catch(() => {
            setAutoPlayBlocked(true);
          });
      }
    }

    if (!isComplete) {
      celebrationPlayedRef.current = false;
      setAutoPlayBlocked(false);
    }
  }, [isComplete, onCollect, isClosing]);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `en:${waypoint.ayahKey}`;
    if (verseInsightCache.has(cacheKey)) {
      const cachedTranslation = verseInsightCache.get(cacheKey);
      setInsightData({ translation: cachedTranslation ?? waypoint.translation ?? null });
      setInsightLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadInsight = async () => {
      // If we already have translation from waypoint payload, render instantly and refresh in background.
      setInsightLoading(!waypoint.translation);
      try {
        const res = await fetch(`/api/quran/verse-insight/${encodeURIComponent(waypoint.ayahKey)}?language=en&tafsir=0`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          const nextTranslation = data.translation || waypoint.translation || null;
          verseInsightCache.set(cacheKey, nextTranslation);
          setInsightData({
            translation: nextTranslation
          });
        }
      } catch {
        if (!cancelled) {
          setInsightData({
            translation: waypoint.translation || null
          });
        }
      } finally {
        if (!cancelled) setInsightLoading(false);
      }
    };
    loadInsight();
    return () => {
      cancelled = true;
    };
  }, [waypoint.ayahKey, waypoint.translation]);

  useEffect(() => {
    if (gameMode === 'continue') buildContinueOptions();
    if (gameMode === 'meaning') buildMeaningOptions();
    if (gameMode === 'audio') {
      buildAudioSurahOptions();
      setAudioSnippetStage(1);
      playAudioSnippet();
    }
  }, [gameMode, buildContinueOptions, buildMeaningOptions, buildAudioSurahOptions, playAudioSnippet]);

  useEffect(() => {
    if (gameMode === 'continue' && quizOptions.length === 0) buildContinueOptions();
    if (gameMode === 'meaning' && quizOptions.length === 0) buildMeaningOptions();
    if (gameMode === 'audio' && quizOptions.length === 0) buildAudioSurahOptions();
  }, [gameMode, quizOptions.length, buildContinueOptions, buildMeaningOptions, buildAudioSurahOptions]);

  useEffect(() => {
    const picked = randomizeGameMode();
    setGameMode(picked);
    setHearts(picked === 'audio' || picked === 'continue' || picked === 'meaning' ? 2 : 3);
    setSelectedWords([]);
    setQuizSelected(null);
    setQuizOptions([]);
    setQuizCorrect(null);
    setAudioSnippetStage(1);
    setContinueGapIndex(-1);
  }, [waypoint.id, randomizeGameMode]);

  if (waypoint.replayOnly) {
    return (
      <div className="fixed inset-0 z-[2000] bg-on-surface/80 backdrop-blur-sm flex items-center justify-center p-3">
        <div className="border-4 border-on-surface shadow-[8px_8px_0px_0px_#181d17] rounded-xl w-full max-w-sm max-h-[86vh] flex flex-col bg-brand-secondary overflow-hidden">
          <div className="shrink-0 px-4 py-3 border-b-2 border-on-surface/20 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-label-bold uppercase tracking-widest text-on-surface">Replay Ayah</p>
              <p className="text-xs font-label-bold text-on-surface">{waypoint.ayahKey}</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full border-2 border-on-surface bg-surface text-on-surface hard-shadow flex items-center justify-center"
              aria-label='Close replay'
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            <div className="bg-white border-2 border-on-surface rounded-xl p-3">
              <p className="font-arabic-display text-2xl leading-[2.05] text-right" dir="rtl">{cleanArabicText || '...'}</p>
            </div>

            <div className="bg-surface border-2 border-on-surface rounded-xl p-2.5">
              <p className="text-[10px] font-label-bold uppercase tracking-widest mb-1">Translation</p>
              <p className="text-xs italic">"{insightData?.translation || waypoint.translation || 'Translation unavailable.'}"</p>
            </div>

            <div className="bg-white border-2 border-on-surface rounded-xl p-3">
              <div className="flex justify-center mb-2">
                <button
                  onClick={toggleAudio}
                  disabled={!audioRef.current}
                  className={cn(
                    "w-10 h-10 rounded-full border-4 border-on-surface bg-primary text-on-primary shadow-[2px_2px_0px_0px_#181d17] flex items-center justify-center",
                    !audioRef.current && "opacity-50"
                  )}
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {isPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>
              </div>
              <div className="h-2 w-full bg-surface-container rounded-full border-2 border-on-surface overflow-hidden">
                <div className="h-full bg-primary transition-all duration-200" style={{ width: `${audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] font-label-bold text-on-surface">
                <span>{formatPlaybackTime(audioCurrentTime)}</span>
                <span>{formatPlaybackTime(audioDuration)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (hearts <= 0) {
    return (
      <div className="fixed inset-0 z-[2100] bg-on-surface/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-error-container border-4 border-on-surface shadow-[8px_8px_0px_0px_#181d17] rounded-2xl w-full max-w-sm p-6 text-center animate-[popIn_0.28s_ease-out]">
          <div className="text-5xl mb-3">💔</div>
          <h3 className="text-xl font-headline-md font-bold text-on-error-container mb-2">
            'Out of Hearts'
          </h3>
          <p className="text-sm text-on-error-container mb-4">{t.puzzleFailed}</p>
          <button
            onClick={requestClose}
            className="w-full bg-surface text-on-surface border-4 border-on-surface rounded-xl py-3 font-label-bold uppercase tracking-wider hard-shadow neubrutalist-interaction"
          >
            {t.closeFailed}
          </button>
        </div>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className={cn("fixed inset-0 z-[2000] bg-on-surface/80 backdrop-blur-sm flex items-center justify-center p-3", isClosing && "animate-[modalFadeOut_0.22s_ease-in_forwards]")}>
        <div
          className={cn(
            "border-4 border-on-surface shadow-[8px_8px_0px_0px_#181d17] rounded-xl w-full max-w-sm max-h-[84vh] flex flex-col relative transform transition-transform animate-[popIn_0.3s_ease-out] overflow-hidden",
            waypoint.isFar ? "text-on-primary-container" : "text-on-surface",
            waypoint.isFar ? "bg-primary-container" : "bg-[#FFE8A3]",
            isClosing && "animate-[modalCardOut_0.22s_ease-in_forwards]"
          )}
          style={waypoint.isFar ? undefined : {
            boxShadow: '8px 8px 0px 0px #181d17, 0 0 0 2px rgba(255, 214, 102, 0.8), 0 0 30px 8px rgba(255, 193, 7, 0.6)'
          }}
        >
          <div className={cn("shrink-0 px-4 pt-4 pb-2 flex flex-col items-center gap-2", waypoint.isFar ? "bg-primary-container" : "bg-[#FFE8A3]")}>
            {waypoint.isFar ? (
              <div className="mt-2 bg-surface text-on-surface border-4 border-on-surface shadow-[4px_4px_0px_0px_#181d17] rounded-full px-3 py-1.5 flex items-center gap-1.5 rotate-[-2deg]">
                <span className="material-symbols-outlined text-[#ff5722]" style={{ fontVariationSettings: "'FILL' 1" }}>map</span>
                <span className="font-label-bold uppercase tracking-wider text-[10px]">{t.farMode}</span>
              </div>
            ) : (
              <div className="mt-2 flex flex-col items-center gap-1.5">
                <div className="bg-surface text-on-surface border-4 border-on-surface shadow-[4px_4px_0px_0px_#181d17] rounded-full px-3 py-1.5 flex items-center gap-1.5 rotate-[-2deg]">
                  <span className="material-symbols-outlined text-[#ff5722]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                  <span className="font-label-bold uppercase tracking-wider text-[10px]">{t.nearMode}</span>
                </div>
                {waypoint.isContextual && (
                  <div className="bg-brand-neon text-on-surface border-4 border-on-surface shadow-[2px_2px_0px_0px_#181d17] rounded-full px-2.5 py-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">nature_people</span>
                    <span className="font-label-bold uppercase tracking-wider text-[10px]">Context: {waypoint.theme}</span>
                  </div>
                )}
              </div>
            )}
            <div className="text-center w-full">
              <h2 className="font-headline-lg text-2xl font-bold mb-0.5">Masha'Allah!</h2>
              <p className={cn("font-body-md text-sm", waypoint.isFar ? "opacity-90" : "text-on-surface")}>Quest Objective Complete.</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-2">
	          <div className="w-full bg-white border-4 border-on-surface shadow-[4px_4px_0px_0px_#181d17] rounded-xl p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b-2 border-on-surface pb-2">
              <div className="flex items-center gap-2 text-on-surface font-bold">
                <span className="material-symbols-outlined">graphic_eq</span>
                {(() => {
                  const [surahNoStr, ayahNo] = (waypoint.ayahKey || '').split(':');
                  const surahNo = Number(surahNoStr);
                  const surahName = SURAH_NAMES[surahNo] || surahNoStr || '?';
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-label-bold bg-surface px-2 py-0.5 rounded-md border-2 border-on-surface">
                        {`Surah ${surahName}`}
                      </span>
                      <span className="font-label-bold bg-brand-neon px-2 py-0.5 rounded-md border-2 border-on-surface">
                        {`Ayah ${ayahNo || '?'}`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
            
	            {getCleanArabicText() ? (
              <div 
                className={cn(
                  "font-arabic-display text-2xl text-on-surface text-center py-1.5 overflow-y-auto",
                  showFullAyah ? "max-h-[36vh] leading-[2.15]" : "max-h-28 leading-[2.05]"
                )}
                dir="rtl"
              >
                {cleanArabicText}
              </div>
	            ) : (
              <div className="flex items-end justify-center h-16 gap-1 w-full px-2 py-1">
                <div className={cn("visualizer-bar w-full max-w-[12px] bg-primary-fixed border-2 border-on-surface rounded-t-sm h-full", !isPlaying && "animation-play-paused")} style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}></div>
                <div className={cn("visualizer-bar w-full max-w-[12px] bg-primary border-2 border-on-surface rounded-t-sm h-full", !isPlaying && "animation-play-paused")} style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}></div>
                <div className={cn("visualizer-bar w-full max-w-[12px] bg-primary-fixed border-2 border-on-surface rounded-t-sm h-full", !isPlaying && "animation-play-paused")} style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}></div>
                <div className={cn("visualizer-bar w-full max-w-[12px] bg-primary border-2 border-on-surface rounded-t-sm h-full", !isPlaying && "animation-play-paused")} style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}></div>
                <div className={cn("visualizer-bar w-full max-w-[12px] bg-primary-fixed border-2 border-on-surface rounded-t-sm h-full", !isPlaying && "animation-play-paused")} style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}></div>
                <div className={cn("visualizer-bar w-full max-w-[12px] bg-primary border-2 border-on-surface rounded-t-sm h-full", !isPlaying && "animation-play-paused")} style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}></div>
                <div className={cn("visualizer-bar w-full max-w-[12px] bg-primary-fixed border-2 border-on-surface rounded-t-sm h-full", !isPlaying && "animation-play-paused")} style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}></div>
              </div>
	            )}
	            <div className="bg-surface p-2.5 rounded-lg border-2 border-on-surface">
	              {insightLoading ? (
	                <p className="font-body-lg text-xs text-on-surface italic text-center">
	                  'Loading...'
	                </p>
	              ) : (
	                <p className="font-body-lg text-xs text-on-surface italic text-center">
	                  "{insightData?.translation || waypoint.translation || 'Translation unavailable.'}"
	                </p>
	              )}
	            </div>
              {isLongAyah && (
                <button
                  onClick={() => setShowFullAyah((prev) => !prev)}
                  className="self-center text-[10px] font-label-bold uppercase tracking-widest px-3 py-1.5 rounded-full border-2 border-on-surface bg-brand-neon text-on-surface"
                >
                  {showFullAyah
                    ? 'Show Less'
                    : 'Show Full Ayah'}
                </button>
              )}
	            <div className="flex justify-center gap-3 mt-0.5">
              <button 
                onClick={toggleAudio}
                disabled={!audioRef.current}
                className={cn(
                  "w-10 h-10 rounded-full border-4 border-on-surface bg-primary text-on-primary shadow-[2px_2px_0px_0px_#181d17] flex items-center justify-center hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all",
                  !audioRef.current && "opacity-50"
                )}
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>
	            </div>
              {autoPlayBlocked && (
                <button
                  onClick={toggleAudio}
                  className="mt-1 w-full bg-primary text-on-primary border-2 border-on-surface rounded-lg py-2 text-xs font-label-bold uppercase hard-shadow flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">play_arrow</span>
                  Tap to play recitation
                </button>
              )}
	            <div className="mt-1">
                <div className="h-2 w-full bg-surface-container rounded-full border-2 border-on-surface overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] font-label-bold text-on-surface">
                  <span>{formatPlaybackTime(audioCurrentTime)}</span>
                  <span>{formatPlaybackTime(audioDuration)}</span>
                </div>
	            </div>
	          </div>
          </div>

          <div className={cn("shrink-0 px-4 pt-2 pb-4 border-t-2 border-on-surface/20", waypoint.isFar ? "bg-primary-container" : "bg-[#FFE8A3]")}>
	          <button 
	            onClick={handleClaimAndClose}
                disabled={!playbackCompleted}
	            className={cn(
                  "w-full text-on-surface border-4 border-on-surface shadow-[6px_6px_0px_0px_#181d17] rounded-xl py-3 px-3 font-headline-md font-bold uppercase tracking-wide transition-all mt-1.5 flex items-center justify-center gap-2 group relative overflow-hidden",
                  playbackCompleted ? "hover:translate-x-1 hover:translate-y-1 cursor-pointer reward-glow-sweep" : "opacity-55 cursor-not-allowed"
                )}
	            style={{
	              background: 'linear-gradient(180deg, #FFF3B0 0%, #FFD54F 45%, #F6B10A 100%)',
	              boxShadow: '0 0 0 2px rgba(255, 214, 102, 0.75), 0 0 22px 5px rgba(255, 193, 7, 0.55), 6px 6px 0px 0px #181d17'
	            }}
	          >
	            {t.claimReward}
	            <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">star</span>
	          </button>
              {!playbackCompleted && (
                <p className="text-[10px] font-label-bold text-on-surface text-center -mt-3">
                  'Wait until audio finishes to claim reward.'
                </p>
              )}
          </div>
	        </div>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes popIn {
            0% { transform: scale(0.9); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes modalFadeOut {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }
          @keyframes modalCardOut {
            0% { transform: scale(1) translateY(0); opacity: 1; }
            100% { transform: scale(0.96) translateY(12px); opacity: 0; }
          }
          .reward-glow-sweep::before {
            content: '';
            position: absolute;
            top: -20%;
            left: -35%;
            width: 28%;
            height: 140%;
            transform: rotate(18deg);
            background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0) 100%);
            animation: rewardSweep 2.2s ease-in-out infinite;
            pointer-events: none;
          }
          @keyframes rewardSweep {
            0% { left: -35%; opacity: 0; }
            10% { opacity: 1; }
            55% { left: 110%; opacity: 1; }
            100% { left: 110%; opacity: 0; }
          }
        `}} />
      </div>
    );
  }

  // Enigma Panel
  return (
    <div className={cn("fixed inset-0 z-[2000] pointer-events-auto overflow-hidden bg-brand-secondary", isClosing && "animate-[modalFadeOut_0.22s_ease-in_forwards]")}>
      <div className="absolute top-3 left-3 z-20 bg-surface px-2.5 py-1.5 rounded-lg border-2 border-on-surface hard-shadow">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-label-bold uppercase tracking-wider">{t.heartsLabel}</span>
            <div className="flex items-center gap-1.5">
            {Array.from({ length: maxHearts }, (_, idx) => (
              <span key={idx} className={cn("text-base", hearts > idx ? "opacity-100" : "opacity-30 grayscale")}>❤️</span>
            ))}
            </div>
          </div>
        </div>
      <button
        onClick={requestClose}
        disabled={closeLocked}
        className={cn("absolute top-4 right-4 z-20 w-11 h-11 rounded-full border-2 border-on-surface bg-surface text-on-surface hard-shadow flex items-center justify-center", closeLocked && "opacity-40 cursor-not-allowed")}
        aria-label='Close without taking waypoint'
      >
        <span className="material-symbols-outlined">close</span>
      </button>
      
      <div className="relative z-10 h-full px-3 pt-16 pb-4" style={{ scrollbarWidth: 'none' }}>
        <div className="w-full max-w-3xl mx-auto h-full flex flex-col gap-2 min-h-0">
          {/* Header Section */}
          <div className="shrink-0 pt-1 pb-1 bg-brand-secondary flex flex-col items-center gap-1.5">
            {/* Ribbon Banner */}
            <div className="bg-on-surface text-on-primary px-2.5 py-1.5 neubrutalist-border hard-shadow rounded-lg -mt-1 transform -rotate-1 relative z-20 w-[94%] mx-auto shrink-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-headline-md text-[10px] sm:text-xs md:text-sm text-brand-neon tracking-wide uppercase text-center flex-1">
                  {(() => {
                    const [surahNoStr, ayahNo] = (waypoint.ayahKey || '').split(':');
                    const surahNo = Number(surahNoStr);
                    const surahName = SURAH_NAMES[surahNo] || surahNoStr || '?';
                    return false
                      ? `SURAT ${surahName} AYAT ${ayahNo || '?'}`
                      : `SURAH ${surahName} AYAH ${ayahNo || '?'}`;
                  })()}
                </h2>
                <span className="text-[8px] font-label-bold uppercase tracking-wide bg-surface text-on-surface border-2 border-on-surface rounded-full px-2 py-0.5 shrink-0">
                  {getLabelForMode(gameMode)}
                </span>
                <button
                  onClick={() => setShowTranslationPeek((prev) => !prev)}
                  className="w-7 h-7 rounded-full border-2 border-on-surface bg-brand-neon text-on-surface flex items-center justify-center shrink-0"
                  aria-label='View translation'
                >
                  <span className="material-symbols-outlined text-sm">translate</span>
                </button>
              </div>
            </div>
            {showTranslationPeek && (
              <div className="bg-surface p-2.5 sm:p-3 neubrutalist-border hard-shadow w-full text-center rounded-xl bg-white mt-1 relative">
                {insightLoading ? (
                  <p className="font-body-lg text-xs text-on-surface italic">
                    'Loading...'
                  </p>
                ) : (
                  <p className={cn("font-body-lg text-xs sm:text-sm text-on-surface italic", !showFullTranslation && "line-clamp-2")}>
                    "{activeTranslation}"
                  </p>
                )}
                {!insightLoading && isLongTranslation && (
                  <button
                    onClick={() => setShowFullTranslation((prev) => !prev)}
                    className="mt-2 text-[10px] font-label-bold uppercase tracking-widest px-3 py-1 rounded-full border-2 border-on-surface bg-brand-neon text-on-surface"
                  >
                    {showFullTranslation
                      ? 'Show Less'
                      : 'Show Full'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
          <div className="min-h-full flex flex-col justify-center gap-3 py-2">
          {gameMode === 'arrange' ? (
            <>
              {/* Assembly Line (Drop Zones) */}
              <div className={cn("bg-gradient-to-b p-3 rounded-xl neubrutalist-border w-full shrink-0 hard-shadow", modePanelTone(gameMode))}>
                <div
                  className="flex flex-wrap gap-2 justify-start content-start items-start min-h-[72px] sm:min-h-[88px]"
                  dir="rtl"
                  style={{ direction: 'rtl' }}
                >
                  {words.map((w, i) => {
                    const isFilled = i < selectedWords.length;
                    const filledWordId = isFilled ? selectedWords[i] : null;
                    const filledWordText = isFilled ? shuffledBank.find(b => b.id === filledWordId)?.word : null;
                    
                    return isFilled ? (
                      <div 
                        key={`drop-${i}`}
                        onClick={() => removeWord(i)}
                        className="h-11 sm:h-12 px-2.5 sm:px-3.5 bg-brand-primary text-on-primary neubrutalist-border hard-shadow rounded-lg flex items-center justify-center transform transition-transform cursor-pointer relative"
                      >
                        <span className="font-arabic-display text-xl sm:text-2xl leading-none mt-1 pb-1">{filledWordText}</span>
                        {i === selectedWords.length - 1 && (
                          <div className="absolute -top-1.5 -right-1.5 bg-error text-on-error rounded-full w-5 h-5 flex items-center justify-center neubrutalist-border text-xs z-10">
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div 
                        key={`drop-empty-${i}`} 
                        className={cn(
                          "w-12 sm:w-16 h-11 sm:h-12 border-2 border-dashed border-on-surface rounded-lg bg-surface-variant/30 flex items-center justify-center opacity-70",
                          isError && i === selectedWords.length && "border-error bg-error-container"
                        )}
                      >
                        <span className="material-symbols-outlined text-outline">add</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className={cn("bg-gradient-to-b p-3 rounded-xl neubrutalist-border w-full space-y-3 hard-shadow", modePanelTone(gameMode))}>
              {gameMode === 'continue' && (
                <div className="text-right" dir="rtl">
                  <p className="text-[10px] uppercase tracking-wider font-label-bold text-on-surface mb-2.5 bg-surface border-2 border-on-surface rounded-full px-2.5 py-1 inline-flex">
                    'Choose the correct next word'
                  </p>
                  <div className="font-arabic-display text-xl leading-[2.05] bg-surface rounded-lg p-3 border-2 border-on-surface/20 flex flex-wrap gap-2">
                    {continuePromptWords.map((token, idx) =>
                      token === '__GAP__' ? (
                        <span key={`gap-${idx}`} className="inline-flex items-center justify-center min-w-12 h-8 px-2 rounded-lg border-2 border-error bg-error-container text-error font-label-bold text-[10px] tracking-widest">
                          ?
                        </span>
                      ) : (
                        <span key={`word-${idx}`}>{token}</span>
                      )
                    )}
                  </div>
                </div>
              )}
              {gameMode === 'meaning' && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-label-bold text-on-surface mb-2.5 bg-surface border-2 border-on-surface rounded-full px-2.5 py-1 inline-flex">
                    'Guess the meaning of this verse'
                  </p>
                  <p className="font-arabic-display text-xl text-right leading-[2.05] bg-surface rounded-lg p-3 border-2 border-on-surface/20" dir="rtl">
                    {cleanArabicText}
                  </p>
                </div>
              )}
              {gameMode === 'audio' && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-label-bold text-on-surface mb-2.5 bg-surface border-2 border-on-surface rounded-full px-2.5 py-1 inline-flex">
                    'Listen to the audio snippet and guess the surah'
                  </p>
                  <button
                    onClick={playAudioSnippet}
                    className="w-full bg-primary text-on-primary border-2 border-on-surface rounded-lg py-2 font-label-bold uppercase text-[11px] hard-shadow flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base">{audioQuizPlaying ? 'volume_up' : 'play_arrow'}</span>
                    {false
                      ? `Putar Ulang Snippet ${audioSnippetStage} (${audioSnippetStage === 1 ? '8s' : '12s'})`
                      : `Replay Snippet ${audioSnippetStage} (${audioSnippetStage === 1 ? '8s' : '12s'})`}
                  </button>
                  <div className="grid grid-cols-2 gap-2.5 mt-2">
                    <button onClick={() => playAudioSnippet(1)} className="bg-surface border-2 border-on-surface rounded-lg py-2 text-[10px] font-label-bold uppercase">
                      'Snippet 1'
                    </button>
                    <button onClick={() => playAudioSnippet(2)} className="bg-surface border-2 border-on-surface rounded-lg py-2 text-[10px] font-label-bold uppercase">
                      'Snippet 2'
                    </button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-2">
                {quizOptions.length === 0 && (
                  <div className="p-3 rounded-lg border-2 border-on-surface/30 bg-surface text-xs font-label-bold uppercase tracking-wider text-on-surface text-center">
                    'Preparing choices...'
                  </div>
                )}
                {quizOptions.map((choice, idx) => {
                  const isPicked = quizSelected === choice;
                  const isAnswer = quizCorrect === choice;
                  return (
                    <button
                      key={`${choice}-${idx}`}
                      onClick={() => handleQuizChoice(choice)}
                      disabled={!!quizSelected || hearts <= 0}
                      className={cn(
                        "p-3 rounded-lg border-2 transition-all hard-shadow min-h-11",
                        gameMode === 'continue' ? "text-right font-arabic-display text-base" : "text-left font-body-md text-xs sm:text-sm",
                        isPicked && isAnswer && "bg-[#d8ffe0] border-[#0b6b1d]",
                        isPicked && !isAnswer && "bg-error-container border-error animate-[shake_0.28s_ease-in-out_2]",
                        !isPicked && "bg-surface border-on-surface/40 hover:bg-surface-variant hover:-translate-y-0.5"
                      )}
                      dir={gameMode === 'continue' ? 'rtl' : 'ltr'}
                    >
                      {choice}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="w-full h-[2px] bg-on-surface opacity-10 my-1 shrink-0"></div>

          {hearts <= 0 && (
            <div className="w-full bg-error-container border-2 border-on-surface rounded-xl p-3 text-center">
              <p className="text-sm font-label-bold text-on-error-container">{t.puzzleFailed}</p>
              <button
                onClick={requestClose}
                className="mt-2 bg-surface text-on-surface px-3 py-1 rounded-lg border-2 border-on-surface text-xs font-label-bold uppercase"
              >
                {t.closeFailed}
              </button>
            </div>
          )}

          {gameMode === 'arrange' && (
            <div className="w-full flex-1 min-h-[140px] overflow-y-auto pr-1 pb-1">
              <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-2.5 w-full pb-1.5 rtl" dir="rtl">
                {shuffledBank.map((item) => {
                  const isUsed = selectedWords.includes(item.id);
                  
                  if (isUsed) {
                    return (
                      <button 
                        key={`bank-used-${item.id}`}
                        disabled
                        className="h-14 sm:h-16 bg-surface-variant text-on-surface/30 neubrutalist-border rounded-xl flex items-center justify-center cursor-not-allowed border-dashed opacity-50 relative overflow-hidden"
                      >
                        <span className="font-arabic-display text-xl sm:text-2xl leading-none mt-1 pb-1">{item.word}</span>
                        <div className="absolute inset-0 bg-on-surface/5 flex items-center justify-center backdrop-blur-[1px]">
                          <span className="material-symbols-outlined text-on-surface/50">check</span>
                        </div>
                      </button>
                    );
                  }

                  return (
                    <button 
                      key={`bank-${item.id}`}
                      onClick={() => handleWordClick(item.id)}
                      disabled={hearts <= 0}
                      className="h-16 sm:h-20 bg-white text-on-surface neubrutalist-border hard-shadow rounded-xl flex flex-col items-center justify-center neubrutalism-active transition-all cursor-pointer hover:bg-brand-secondary hover:-translate-y-0.5 active:scale-95 px-1.5 sm:px-2"
                    >
                      <span className="font-arabic-display text-xl sm:text-2xl leading-none mt-1">{item.word}</span>
                      <span className="text-[9px] sm:text-[10px] font-label-bold text-on-surface uppercase mt-1 text-center line-clamp-1">
                        {item.translation || '...'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const BottomNav = ({ active, onChange }: { active: string, onChange: (val: string) => void,   }) => {
  const t = UI_TEXT;
  const tabs = [
    { id: 'radar', iconName: 'map', label: t.map },
    { id: 'collection', iconName: 'menu_book', label: t.scrolls },
    { id: 'leaderboard', iconName: 'emoji_events', label: t.leaders },
    { id: 'profile', iconName: 'person', label: t.profile }
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[1000] flex justify-around items-center h-24 pb-4 pointer-events-none">
      <div className="rounded-xl mx-auto border-4 border-on-surface w-[90%] max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] bg-secondary-container pointer-events-auto flex justify-around items-center px-2 py-2">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => {
              if (!isActive) playSound('open');
              onChange(tab.id);
            }}
            className={cn(
               isActive 
                 ? "flex flex-col items-center justify-center w-16 h-16 bg-primary text-on-primary rounded-lg border-2 border-on-surface p-2 translate-x-1 translate-y-1 shadow-none transition-all" 
                 : "flex flex-col items-center justify-center w-16 h-16 text-on-secondary-container p-2 hover:bg-surface-variant transition-transform rounded-lg"
            )}
            title={tab.label}
          >
            <span className="material-symbols-outlined text-xl leading-none" style={{ fontVariationSettings: `'FILL' ${isActive ? '1' : '0'}` }}>
              {tab.iconName}
            </span>
            <span className={cn(
              "mt-1 text-[10px] font-label-bold uppercase tracking-wide leading-none",
              isActive ? "text-on-primary" : "text-on-secondary-container"
            )}>
              {tab.label}
            </span>
          </button>
        );
      })}
      </div>
    </nav>
  );
};

// Movement Simulator Component for local testing
const MovementSimulator = ({ onMove }: { onMove: (lat: number, lng: number) => void }) => {
  const step = 0.0001; // Approx 10 meters
  return (
    <div className="fixed left-6 bottom-32 z-[1000] flex flex-col gap-2">
      <div className="flex justify-center">
        <button onClick={() => onMove(step, 0)} className="w-10 h-10 bg-surface rounded-lg neubrutalist-border flex items-center justify-center neubrutalism-shadow active:translate-y-1">
          <span className="material-symbols-outlined">expand_less</span>
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onMove(0, -step)} className="w-10 h-10 bg-surface rounded-lg neubrutalist-border flex items-center justify-center neubrutalism-shadow active:translate-y-1">
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <button onClick={() => onMove(-step, 0)} className="w-10 h-10 bg-surface rounded-lg neubrutalist-border flex items-center justify-center neubrutalism-shadow active:translate-y-1">
          <span className="material-symbols-outlined">expand_more</span>
        </button>
        <button onClick={() => onMove(0, step)} className="w-10 h-10 bg-surface rounded-lg neubrutalist-border flex items-center justify-center neubrutalism-shadow active:translate-y-1">
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
      <div className="bg-surface p-1 rounded-md neubrutalist-border text-[8px] font-bold text-center uppercase">Sim Mode</div>
    </div>
  );
};

export default function App() {
  const DEFAULT_RESPAWN_MS = 5 * 60 * 1000;
  const NEAR_RESPAWN_MS = 60 * 1000;
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [audioReciterId, setAudioReciterId] = useState<string>(() => localStorage.getItem(QURAN_AUDIO_RECITER_KEY) || '7');
  const [profileStyle, setProfileStyle] = useState<string>(() => localStorage.getItem(PROFILE_STYLE_KEY) || 'ikhwan');
  const t = UI_TEXT;

  const onQuranLogin = () => {
    playSound('open');
    const cachedQuranAuthRaw = localStorage.getItem(QURAN_AUTH_STORAGE_KEY);
    if (cachedQuranAuthRaw) {
      try {
        const cachedQuranAuth = JSON.parse(cachedQuranAuthRaw);
        if (cachedQuranAuth?.accessToken && cachedQuranAuth?.uid) {
          setUser(cachedQuranAuth);
          setAuthLoading(false);
          return;
        }
      } catch (_) {
        localStorage.removeItem(QURAN_AUTH_STORAGE_KEY);
      }
    }
    // Redirect to real backend OAuth initiator
    window.location.href = '/api/auth/quran';
  };

  const onGuestLogin = () => {
    playSound('open');
    setUser({
      uid: 'guest-user',
      displayName: 'Guest Explorer',
      email: 'guest@ayahquest.com'
    });
  };
  const [coords, setCoords] = useState<[number, number]>([-6.2088, 106.8456]); 
  const [locationStatus, setLocationStatus] = useState<'waiting' | 'found' | 'error'>('waiting');
  const [manualLocationQuery, setManualLocationQuery] = useState('');
  const [manualLocationLoading, setManualLocationLoading] = useState(false);
  const [manualLocationResults, setManualLocationResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [xp, setXp] = useState(0);
  const [essence, setEssence] = useState(0);
  const [streak, setStreak] = useState(0);
  const [rank, setRank] = useState('Seeker of Light');
  const [activeTab, setActiveTab] = useState('radar');
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());
  const [collectedAtMap, setCollectedAtMap] = useState<Record<string, number>>({});
  const [collectedCooldownMap, setCollectedCooldownMap] = useState<Record<string, number>>({});
  const [quranBookmarkIds, setQuranBookmarkIds] = useState<Set<string>>(new Set());
  const [goals, setGoals] = useState<QuranGoal[]>([]);
  const [notes, setNotes] = useState<QuranNote[]>([]);
  const [collectionsData, setCollectionsData] = useState<QuranCollection[]>([]);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalGoal, setGoalGoal] = useState(7);
  const [noteText, setNoteText] = useState('');
  const [noteVerseKey, setNoteVerseKey] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [journeyView, setJourneyView] = useState<JourneyView>('progress');
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(() => {
    try {
      const raw = localStorage.getItem(QURAN_SYNC_QUEUE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [leaders, setLeaders] = useState<{name: string, xp: number, rank: string, isMe?: boolean, id: string}[]>([]);
  const [selectedWaypoint, setSelectedWaypoint] = useState<(Waypoint & { isFar?: boolean, distance?: number }) | null>(null);
  const [discoveryRange] = useState(25); // 25 meters proximity
  const [nearRange] = useState(30);
  const [greenStartRange] = useState(50);
  const [lockRange] = useState(600);
  const [lockMaxRange] = useState(3000);
  const [showLocationInfo, setShowLocationInfo] = useState(false);
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const [xpGain, setXpGain] = useState<number | null>(null);
  const [essenceGain, setEssenceGain] = useState<number | null>(null);

  const [path, setPath] = useState(window.location.pathname);
  const isTopUpRunningRef = useRef(false);
  useEffect(() => {
  }, );
  useEffect(() => {
    localStorage.setItem(QURAN_AUDIO_RECITER_KEY, audioReciterId);
  }, [audioReciterId]);
  useEffect(() => {
    localStorage.setItem(PROFILE_STYLE_KEY, profileStyle);
  }, [profileStyle]);
  useEffect(() => {
    localStorage.setItem(QURAN_SYNC_QUEUE_KEY, JSON.stringify(syncQueue));
    if (syncQueue.length > 0 && syncStatus !== 'syncing') setSyncStatus('pending');
  }, [syncQueue, syncStatus]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const extractList = (data: any, preferredKey: string) => {
    if (Array.isArray(data?.[preferredKey])) return data[preferredKey];
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data)) return data;
    return [];
  };

  const queueSyncItem = (endpoint: SyncQueueItem['endpoint'], payload: any) => {
    setSyncQueue((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), endpoint, payload, method: 'POST' },
    ]);
    setSyncStatus('pending');
  };

  const loadQuranUserData = useCallback(async (accessToken: string) => {
    try {
      const [goalsRes, notesRes, collectionsRes] = await Promise.all([
        fetch('/api/quran/goals', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/quran/notes', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/quran/collections', { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      const [goalsData, notesData, collectionsDataRaw] = await Promise.all([
        goalsRes.json().catch(() => ({})),
        notesRes.json().catch(() => ({})),
        collectionsRes.json().catch(() => ({})),
      ]);

      const mappedGoals = extractList(goalsData, 'goals').map((g: any, idx: number) => ({
        id: String(g?.id || g?.uuid || `goal-${idx}`),
        title: String(g?.title || g?.name || 'Daily Goal'),
        target: Number(g?.target || g?.target_count || 7),
        progress: Number(g?.progress || g?.progress_count || 0),
      }));
      const mappedNotes = extractList(notesData, 'notes').map((n: any, idx: number) => ({
        id: String(n?.id || n?.uuid || `note-${idx}`),
        verseKey: String(n?.verse_key || n?.verseKey || n?.reference || '-'),
        content: String(n?.content || n?.note || n?.text || ''),
      }));
      const mappedCollections = extractList(collectionsDataRaw, 'collections').map((c: any, idx: number) => ({
        id: String(c?.id || c?.uuid || `collection-${idx}`),
        name: String(c?.name || c?.title || `Collection ${idx + 1}`),
        count: Number(c?.count || c?.items_count || 0),
      }));

      if (goalsRes.ok) setGoals(mappedGoals);
      if (notesRes.ok) setNotes(mappedNotes);
      if (collectionsRes.ok) setCollectionsData(mappedCollections);
      setSyncStatus(syncQueue.length > 0 ? 'pending' : 'synced');
    } catch {
      setSyncStatus(syncQueue.length > 0 ? 'pending' : 'failed');
    }
  }, [syncQueue.length]);

  const retrySyncQueue = useCallback(async () => {
    if (!user?.isQuranAuth || !user?.accessToken || syncQueue.length === 0) return;
    setSyncStatus('syncing');
    const remaining: SyncQueueItem[] = [];
    for (const item of syncQueue) {
      try {
        const res = await fetch(item.endpoint, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.accessToken}`,
          },
          body: JSON.stringify(item.payload),
        });
        if (!res.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    setSyncQueue(remaining);
    setSyncStatus(remaining.length ? 'failed' : 'synced');
    if (remaining.length === 0) await loadQuranUserData(user.accessToken);
  }, [loadQuranUserData, syncQueue, user]);
  useEffect(() => {
    const handleLocationChange = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      const fetchLeaders = async () => {
        try {
          const { collection, query, orderBy, limit, getDocs } = await import('firebase/firestore');
          const q = query(collection(db, 'profiles'), orderBy('xp', 'desc'), limit(50));
          const snap = await getDocs(q);
          const fetchedLeaders = snap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || 'Anonymous',
            xp: doc.data().xp || 0,
            rank: doc.data().rank || 'Seeker of Light',
            isMe: user ? doc.id === user.uid : false
          }));
          setLeaders(fetchedLeaders);
        } catch (e) {
          console.error("Failed to fetch leaders", e);
        }
      };
      fetchLeaders();
    }
  }, [activeTab, user]);

  // Handle Auth state
  useEffect(() => {
    const cachedQuranAuthRaw = localStorage.getItem(QURAN_AUTH_STORAGE_KEY);
    if (cachedQuranAuthRaw) {
      try {
        const cachedQuranAuth = JSON.parse(cachedQuranAuthRaw);
        if (cachedQuranAuth?.accessToken && cachedQuranAuth?.uid) {
          setUser(cachedQuranAuth);
          setAuthLoading(false);
          if (cachedQuranAuth.isQuranAuth && cachedQuranAuth.accessToken !== 'mock_token_for_dev') {
            fetch('/api/quran/me', {
              headers: { Authorization: `Bearer ${cachedQuranAuth.accessToken}` }
            })
              .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
              .then(({ ok, data }) => {
                if (!ok || !data?.profile) return;
                const p = data.profile;
                const refreshedUser = {
                  ...cachedQuranAuth,
                  uid: p.id ? `quran-user-${String(p.id)}` : cachedQuranAuth.uid,
                  displayName: p.username || p.name || (p.email ? String(p.email).split('@')[0] : cachedQuranAuth.displayName),
                  email: p.email || cachedQuranAuth.email,
                  photoURL: p.avatar || cachedQuranAuth.photoURL || '',
                };
                if (refreshedUser.displayName === 'Quran Explorer' && refreshedUser.email) {
                  refreshedUser.displayName = String(refreshedUser.email).split('@')[0];
                }
                setUser(refreshedUser);
                localStorage.setItem(QURAN_AUTH_STORAGE_KEY, JSON.stringify(refreshedUser));
              })
              .catch(() => {});
          }
        }
      } catch (_) {
        localStorage.removeItem(QURAN_AUTH_STORAGE_KEY);
      }
    }

    // Check for Quran.com login success in URL
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hashParams.get('access_token');
    const idToken = hashParams.get('id_token');
    
    if (urlParams.get('quran_login') === 'success') {
      const quranUser: any = {
        uid: 'quran-user-' + (accessToken ? accessToken.substring(0, 10) : Math.random().toString(36).substring(7)),
        displayName: 'Quran Explorer',
        email: 'user@quran.com',
        photoURL: '',
        isQuranAuth: true,
        accessToken: accessToken
      };
        if (idToken) {
        const claims = decodeJwtPayload(idToken);
        if (claims) {
          quranUser.uid = claims.sub ? `quran-user-${String(claims.sub)}` : quranUser.uid;
          quranUser.displayName = claims.name || claims.preferred_username || quranUser.displayName;
          quranUser.email = claims.email || quranUser.email;
          quranUser.photoURL = claims.picture || '';
        }
      }
      const bootstrapQuranUser = async () => {
        // Try to enrich with real Quran.com profile
        if (accessToken && accessToken !== 'mock_token_for_dev') {
          try {
            const meResp = await fetch('/api/quran/me', {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const meData = await meResp.json();
            if (meResp.ok && meData?.profile) {
              const p = meData.profile;
              quranUser.uid = p.id ? `quran-user-${String(p.id)}` : quranUser.uid;
              quranUser.displayName = p.username || p.name || (p.email ? String(p.email).split('@')[0] : quranUser.displayName);
              quranUser.email = p.email || quranUser.email;
              quranUser.photoURL = p.avatar || '';
            }
          } catch {
            // keep fallback profile if provider profile call fails
          }
        }
        setUser(quranUser);
        setAuthLoading(false); // Crucial: Stop loading and enter dashboard
        if (quranUser.displayName === 'Quran Explorer' && quranUser.email && quranUser.email !== 'user@quran.com') {
          quranUser.displayName = String(quranUser.email).split('@')[0];
        }
        localStorage.setItem(QURAN_AUTH_STORAGE_KEY, JSON.stringify(quranUser));
      };
      bootstrapQuranUser();
      
      // Load/Create Game Profile in Firebase based on Quran.com ID
      const syncProfile = async () => {
        const profileRef = doc(db, 'profiles', quranUser.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setXp(profileSnap.data().xp || 0);
          setEssence(profileSnap.data().essence || 0);
          setStreak(profileSnap.data().streak || 0);
          setRank(profileSnap.data().rank || 'Seeker of Light');
          setCollectedIds(new Set(profileSnap.data().collectedIds || []));
          setCollectedAtMap(profileSnap.data().collectedAtMap || {});
          setCollectedCooldownMap(profileSnap.data().collectedCooldownMap || {});
        } else {
          await setDoc(profileRef, {
            xp: 0, streak: 0, rank: 'Seeker of Light',
            essence: 0,
            userId: quranUser.uid, name: quranUser.displayName, email: quranUser.email || null, avatar: quranUser.photoURL || null, collectedIds: [], collectedAtMap: {}, collectedCooldownMap: {}
          });
        }
      };
      syncProfile();

      // Clean up URL
      window.history.replaceState({}, document.title, "/");

      // Fetch Live Bookmarks if we have a token
      if (accessToken && accessToken !== 'mock_token_for_dev') {
        fetch('/api/quran/bookmarks', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        .then(res => res.json())
        .then(data => {
          if (data.bookmarks) {
            const ayahKeys = data.bookmarks.map((b: any) => `${b.verse_key}`);
            setQuranBookmarkIds(new Set(ayahKeys));
          }
        })
        .catch(err => console.error("Failed to sync bookmarks", err));
        loadQuranUserData(accessToken).catch(() => {});
      }
      return; // Stop here, don't let Firebase listener take over yet
    }

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        localStorage.removeItem(QURAN_AUTH_STORAGE_KEY);
        const profileRef = doc(db, 'profiles', u.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setXp(profileSnap.data().xp || 0);
          setEssence(profileSnap.data().essence || 0);
          setStreak(profileSnap.data().streak || 0);
          setRank(profileSnap.data().rank || 'Seeker of Light');
          setCollectedIds(new Set(profileSnap.data().collectedIds || []));
          setCollectedAtMap(profileSnap.data().collectedAtMap || {});
          setCollectedCooldownMap(profileSnap.data().collectedCooldownMap || {});
        } else {
          await setDoc(profileRef, {
            xp: 0,
            essence: 0,
            streak: 0,
            rank: 'Seeker of Light',
            userId: u.uid,
            name: u.displayName || 'Anonymous Seeker',
            collectedIds: [],
            collectedAtMap: {},
            collectedCooldownMap: {}
          });
        }
      } else {
        // Only set loading false and user null if we are NOT in the middle of a Quran login
        const params = new URLSearchParams(window.location.search);
        if (params.get('quran_login') !== 'success') {
          setUser(null);
        }
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [loadQuranUserData]);

  useEffect(() => {
    if (user?.isQuranAuth && user?.accessToken && user.accessToken !== 'mock_token_for_dev') {
      loadQuranUserData(user.accessToken).catch(() => {});
    }
  }, [loadQuranUserData, user]);

  const createGoal = async () => {
    if (!user?.isQuranAuth || !user?.accessToken) return;
    const payload = { title: goalTitle || 'Daily Ayah Goal', target: Number(goalGoal) || 7 };
    try {
      const res = await fetch('/api/quran/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.accessToken}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('goal sync failed');
      setGoalTitle('');
      await loadQuranUserData(user.accessToken);
      setSyncStatus(syncQueue.length > 0 ? 'pending' : 'synced');
    } catch {
      queueSyncItem('/api/quran/goals', payload);
      setGoals((prev) => [...prev, { id: `local-goal-${Date.now()}`, title: payload.title, target: payload.target, progress: 0 }]);
      setGoalTitle('');
    }
  };

  const createNote = async () => {
    if (!user?.isQuranAuth || !user?.accessToken) return;
    const verseKey = noteVerseKey || selectedWaypoint?.ayahKey || Array.from(collectedIds)[0] || '2:255';
    const payload = { verse_key: verseKey, content: noteText };
    if (!payload.content.trim()) return;
    try {
      const res = await fetch('/api/quran/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.accessToken}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('note sync failed');
      setNoteText('');
      setNoteVerseKey('');
      await loadQuranUserData(user.accessToken);
      setSyncStatus(syncQueue.length > 0 ? 'pending' : 'synced');
    } catch {
      queueSyncItem('/api/quran/notes', payload);
      setNotes((prev) => [...prev, { id: `local-note-${Date.now()}`, verseKey, content: payload.content }]);
      setNoteText('');
      setNoteVerseKey('');
    }
  };

  const createCollection = async () => {
    if (!user?.isQuranAuth || !user?.accessToken || !collectionName.trim()) return;
    const payload = { name: collectionName.trim() };
    try {
      const res = await fetch('/api/quran/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.accessToken}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('collection sync failed');
      setCollectionName('');
      await loadQuranUserData(user.accessToken);
      setSyncStatus(syncQueue.length > 0 ? 'pending' : 'synced');
    } catch {
      queueSyncItem('/api/quran/collections', payload);
      setCollectionsData((prev) => [...prev, { id: `local-col-${Date.now()}`, name: payload.name, count: 0 }]);
      setCollectionName('');
    }
  };

  // Sync waypoints and generate real ones if none exist
  useEffect(() => {
    if (!user || locationStatus !== 'found') return;
    
    // We only want to generate waypoints if Firestore is truly empty for this user/area.
    // To prevent waypoints from moving when the user moves, we only seed them ONCE.
    let isSubscribed = true;
    
    const unsubscribe = onSnapshot(collection(db, 'waypoints'), async (snapshot) => {
      if (!isSubscribed) return;
      
      const wps: Waypoint[] = [];
      snapshot.forEach((doc) => {
        wps.push({ id: doc.id, ...doc.data() } as Waypoint);
      });
      
      if (wps.length === 0 || wps.some(w => !w.arabicText || w.arabicText === "Arabic text unavailable")) {
        // Generate random points with varying distances
        const waypointPromises = Array.from({ length: 60 }, async (_, i) => {
          // Angle in radians
          const angle = Math.random() * Math.PI * 2;
          
          // distance logic:
          // near: 5-30m (gold, 20% = first 12), quiet gap: 30-50m, active: 50m-600m (green, 55% = next 33), locked: 600m-3km (gray, 25% = last 15)
          const distanceMeters =
            i < 12 ? (5 + Math.random() * 25) : 
            i < 45 ? (50 + Math.random() * 550) :
            (600 + Math.random() * 2400);

          // Approximate meters to degrees
          const rLat = distanceMeters / 111320;
          const rLng = distanceMeters / (111320 * Math.cos(coords[0] * Math.PI / 180));
          
          const lat = coords[0] + (rLat * Math.sin(angle));
          const lng = coords[1] + (rLng * Math.cos(angle));

          try {
            const verseRes = await fetch(`/api/quran/contextual-verse?lat=${lat}&lng=${lng}&audio=${encodeURIComponent(audioReciterId)}&language=en`);
            if (!verseRes.ok) throw new Error('API Error');
            const verseData = await verseRes.json();
            const ayah = verseData.verse || verseData;
            
            const verseKey = ayah.verseKey || ayah.verse_key;
            const arabicText = ayah.textUthmani || ayah.text_uthmani || ayah.text || "Arabic text unavailable";
            const tajweedText = ayah.textUthmaniTajweed || ayah.text_uthmani_tajweed;
            const translationText = ayah.translations?.[0]?.text?.replace(/<[^>]+>/g, '') || "Translation unavailable";
            const audioUrl = ayah.audio?.url ? `https://verses.quran.com/${ayah.audio.url}` : undefined;
            const wordsData = ayah.words?.map((w: any) => ({
              text: w.textUthmani || w.text_uthmani,
              translation: w.translation?.text,
              id: w.id
            })) || [];

            return {
              id: Math.random().toString(36).substring(7),
              lat,
              lng,
              ayahKey: verseKey,
              arabicText: arabicText,
              tajweedText: tajweedText,
              translation: translationText,
              audioUrl: audioUrl,
              points: ayah.metadata?.isContextual ? 25 : 15,
              theme: ayah.metadata?.contextLabel || ayah.metadata?.theme,
              isContextual: ayah.metadata?.isContextual,
              wordsData: wordsData
            } as any;
          } catch(e) {
             // Fallback
             return {
               id: Math.random().toString(36).substring(7),
               lat,
               lng,
               ayahKey: "2:255",
               arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
               translation: "Allah! There is no deity except Him, the Ever-Living, the Sustainer of all existence.",
               points: 25
             } as any;
          }
        });

        const newWaypoints = await Promise.all(waypointPromises);
        
        if (isSubscribed) {
          setWaypoints(newWaypoints);
        }
      } else {
        setWaypoints(wps);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'waypoints');
    });
    
    return () => {
      isSubscribed = false;
      unsubscribe();
    };
    // ONLY depend on user and locationStatus transitioning to found
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, locationStatus, audioReciterId]);

  const generateDynamicWaypoint = useCallback(async (baseCoords: [number, number]) => {
    const angle = Math.random() * Math.PI * 2;
    const typeRoll = Math.random();
    // Balanced distribution: 25% near (gold), quiet gap 30-50m, 55% active (green), 20% far (gray)
    const distanceMeters =
      typeRoll < 0.25 ? (5 + Math.random() * 25) : 
      typeRoll < 0.80 ? (50 + Math.random() * 550) :
      (600 + Math.random() * 2400);

    const rLat = distanceMeters / 111320;
    const rLng = distanceMeters / (111320 * Math.cos(baseCoords[0] * Math.PI / 180));
    const lat = baseCoords[0] + (rLat * Math.sin(angle));
    const lng = baseCoords[1] + (rLng * Math.cos(angle));

    try {
      const verseRes = await fetch(`/api/quran/contextual-verse?lat=${lat}&lng=${lng}&audio=${encodeURIComponent(audioReciterId)}&language=en`);
      if (!verseRes.ok) throw new Error('API Error');
      const verseData = await verseRes.json();
      const ayah = verseData.verse || verseData;
      const verseKey = ayah.verseKey || ayah.verse_key || `${Math.floor(Math.random() * 114) + 1}:1`;
      const arabicText = ayah.textUthmani || ayah.text_uthmani || ayah.text || "تجربة";
      const tajweedText = ayah.textUthmaniTajweed || ayah.text_uthmani_tajweed;
      const translationText = ayah.translations?.[0]?.text?.replace(/<[^>]+>/g, '') || "Translation unavailable";
      const audioUrl = ayah.audio?.url ? `https://verses.quran.com/${ayah.audio.url}` : undefined;
      const wordsData = ayah.words?.map((w: any) => ({
        text: w.textUthmani || w.text_uthmani,
        translation: w.translation?.text,
        id: w.id
      })) || [];
      return {
        id: Math.random().toString(36).substring(7),
        lat,
        lng,
        ayahKey: verseKey,
        arabicText,
        tajweedText,
        translation: translationText,
        audioUrl,
        points: ayah.metadata?.isContextual ? 25 : 15,
        theme: ayah.metadata?.contextLabel || ayah.metadata?.theme,
        isContextual: ayah.metadata?.isContextual,
        wordsData
      } as any as Waypoint;
    } catch {
      return {
        id: Math.random().toString(36).substring(7),
        lat,
        lng,
        ayahKey: `${Math.floor(Math.random() * 114) + 1}:${Math.floor(Math.random() * 7) + 1}`,
        arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
        translation: "Allah, there is no deity except Him.",
        points: 20
      } as Waypoint;
    }
  }, [audioReciterId]);

  const activeCollectedIds = useMemo(() => {
    const active = new Set<string>();
    for (const id of collectedIds) {
      const takenAt = collectedAtMap[id] || 0;
      const cooldown = collectedCooldownMap[id] || DEFAULT_RESPAWN_MS;
      if (nowTs - takenAt < cooldown) active.add(id);
    }
    return active;
  }, [collectedIds, collectedAtMap, collectedCooldownMap, nowTs]);

  const availableWaypointCount = useMemo(
    () => waypoints.filter((wp) => !activeCollectedIds.has(wp.ayahKey)).length,
    [waypoints, activeCollectedIds]
  );
  const nextRespawnMs = useMemo(() => {
    let minRemaining = Number.POSITIVE_INFINITY;
    for (const wp of waypoints) {
      if (!activeCollectedIds.has(wp.ayahKey)) continue;
      const takenAt = collectedAtMap[wp.ayahKey] || 0;
      const cooldown = collectedCooldownMap[wp.ayahKey] || DEFAULT_RESPAWN_MS;
      const remaining = Math.max(0, cooldown - (nowTs - takenAt));
      if (remaining < minRemaining) minRemaining = remaining;
    }
    return Number.isFinite(minRemaining) ? minRemaining : 0;
  }, [waypoints, activeCollectedIds, collectedAtMap, collectedCooldownMap, nowTs]);

  const topUpWaypoints = useCallback(async () => {
    if (!user || locationStatus !== 'found') return;
    if (isTopUpRunningRef.current) return;
    const activeCount = waypoints.filter((wp) => !activeCollectedIds.has(wp.ayahKey)).length;
      const minActiveGoal = 24;
    if (activeCount >= minActiveGoal) return;
    isTopUpRunningRef.current = true;
    try {
      const toCreate = Math.min(8, minActiveGoal - activeCount);
      const created = await Promise.all(
        Array.from({ length: toCreate }, () => generateDynamicWaypoint(coords))
      );
      setWaypoints((prev) => {
        const keys = new Set(prev.map((p) => p.ayahKey));
        const unique = created.filter((c) => !keys.has(c.ayahKey));
        return [...prev, ...unique];
      });
    } finally {
      isTopUpRunningRef.current = false;
    }
  }, [activeCollectedIds, coords, generateDynamicWaypoint, locationStatus, user, waypoints]);

  useEffect(() => {
    if (!user || locationStatus !== 'found') return;
    topUpWaypoints().catch(() => {});
    const timer = window.setInterval(() => {
      topUpWaypoints().catch(() => {});
    }, 12000);
    return () => window.clearInterval(timer);
  }, [user, locationStatus, topUpWaypoints]);
  const formatCountdown = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Handle Location
  useEffect(() => {
    if ("geolocation" in navigator) {
      let didResolveLocation = false;
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          didResolveLocation = true;
          setCoords([pos.coords.latitude, pos.coords.longitude]);
          setLocationStatus('found');
        },
        (err) => {
          // GPS timeout is common on desktop/weak signal; avoid noisy hard errors.
          console.warn('Geolocation issue:', err?.message || err);
          // Timeout on some devices/browsers is common; try one-shot fallback first.
          if (err.code === err.TIMEOUT && !didResolveLocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                didResolveLocation = true;
                setCoords([pos.coords.latitude, pos.coords.longitude]);
                setLocationStatus('found');
              },
              () => {
                // Final fallback so map still renders even when GPS keeps timing out.
                setCoords(DEFAULT_FALLBACK_COORDS);
                setLocationStatus('found');
              },
              { enableHighAccuracy: false, maximumAge: 300000, timeout: 30000 }
            );
            return;
          }
          // Non-timeout errors still show fallback manual panel, but map remains usable.
          setCoords(DEFAULT_FALLBACK_COORDS);
          setLocationStatus('found');
        },
        { enableHighAccuracy: true, maximumAge: 60000, timeout: 20000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setLocationStatus('error');
    }
  }, []);

  const handleWaypointClick = (wp: Waypoint) => {
    if (activeCollectedIds.has(wp.ayahKey)) return;
    
    // Distance helper
    const R = 6371e3;
    const f1 = coords[0] * Math.PI/180;
    const f2 = wp.lat * Math.PI/180;
    const df = (wp.lat-coords[0]) * Math.PI/180;
    const dl = (wp.lng-coords[1]) * Math.PI/180;
    const a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2) * Math.sin(dl/2);
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    if (dist > lockMaxRange) {
      setLockNotice(false
        ? 'This waypoint is outside radar range (max 10 km).'
        : 'This waypoint is outside radar range (max 10 km).');
      setTimeout(() => setLockNotice(null), 2200);
      playSound('error');
      return;
    }
    if (dist > lockRange) {
      setLockNotice(false
        ? 'Too far. Move closer to unlock this waypoint.'
        : 'Too far. Move closer to unlock this waypoint.');
      setTimeout(() => setLockNotice(null), 2200);
      playSound('error');
      return;
    }

    playSound('open');
    setSelectedWaypoint({
      ...wp,
      isFar: dist > discoveryRange,
      distance: dist
    });
  };

  const searchManualLocation = async () => {
    if (!manualLocationQuery.trim()) return;
    setManualLocationLoading(true);
    try {
      const res = await fetch(`/api/location/search?q=${encodeURIComponent(manualLocationQuery.trim())}`);
      const data = await res.json();
      if (res.ok) {
        setManualLocationResults(Array.isArray(data.results) ? data.results : []);
      } else {
        setManualLocationResults([]);
      }
    } catch {
      setManualLocationResults([]);
    } finally {
      setManualLocationLoading(false);
    }
  };

  const useManualLocation = (lat: number, lng: number) => {
    setCoords([lat, lng]);
    setLocationStatus('found');
    setManualLocationResults([]);
  };
  const onCollect = async () => {
    if (!selectedWaypoint || !user) return;
    const isDuplicateCollect = collectedIds.has(selectedWaypoint.ayahKey);
    
    // Base points for reading the ayat
    let awardedPoints = isDuplicateCollect ? 5 : 15;
    let awardedEssence = isDuplicateCollect ? 2 : 0;
    
    // Bonus for actually walking to the location
    if (!selectedWaypoint.isFar) {
       awardedPoints = isDuplicateCollect ? 8 : 50; 
    }

    const newXp = xp + awardedPoints;
    const newEssence = essence + awardedEssence;
    setXp(newXp);
    setEssence(newEssence);
    setXpGain(awardedPoints);
    if (awardedEssence > 0) {
      setEssenceGain(awardedEssence);
      window.setTimeout(() => setEssenceGain(null), 1200);
    }
    window.setTimeout(() => setXpGain(null), 1200);
    
    // Simple streak logic: increment for now to show the feature
    const newStreak = streak + 1;
    setStreak(newStreak);
    setGoals((prev) => prev.map((g) => ({ ...g, progress: Math.min(g.target, (g.progress || 0) + 1) })));

    const newCollectedIds = new Set(collectedIds);
    newCollectedIds.add(selectedWaypoint.ayahKey);
    setCollectedIds(newCollectedIds);
    const collectedAt = Date.now();
    const newCollectedAtMap = { ...collectedAtMap, [selectedWaypoint.ayahKey]: collectedAt };
    setCollectedAtMap(newCollectedAtMap);
    const randomizedCooldown = (selectedWaypoint.distance || Infinity) <= nearRange
      ? NEAR_RESPAWN_MS + Math.floor(Math.random() * (2 * 60 * 1000))
      : (60 * 1000) + Math.floor(Math.random() * (4 * 60 * 1000));
    const perWaypointCooldown = randomizedCooldown;
    const newCollectedCooldownMap = { ...collectedCooldownMap, [selectedWaypoint.ayahKey]: perWaypointCooldown };
    setCollectedCooldownMap(newCollectedCooldownMap);

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10B981', '#F59E0B', '#FFFFFF'],
    });

    let newRank = rank;
    if (newXp > 300) newRank = 'Mufassir';
    else if (newXp > 100) newRank = 'Seeker of Knowledge';
    setRank(newRank);

    if (newRank !== rank) {
      playSound('levelUp');
    } else {
      playSound('collect');
    }

    try {
      if (user.uid !== 'guest-user') {
        const profileRef = doc(db, 'profiles', user.uid);
        await updateDoc(profileRef, { 
          xp: newXp, 
          essence: newEssence,
          streak: newStreak,
          rank: newRank,
          name: user.displayName || 'Anonymous Seeker',
          collectedIds: Array.from(newCollectedIds),
          collectedAtMap: newCollectedAtMap,
          collectedCooldownMap: newCollectedCooldownMap
        });
      }

      // SYNC WITH QURAN FOUNDATION USER API
      if (user.isQuranAuth && user.accessToken) {
        setQuranBookmarkIds((prev) => new Set([...Array.from(prev), selectedWaypoint.ayahKey]));
        fetch('/api/quran/bookmarks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.accessToken}`
          },
          body: JSON.stringify({ verse_key: selectedWaypoint.ayahKey })
        })
          .then(async (res) => {
            if (!res.ok) {
              setSyncStatus('failed');
            } else {
              setSyncStatus(syncQueue.length > 0 ? 'pending' : 'synced');
            }
          })
          .catch(() => {
            setSyncStatus('failed');
          });
        fetch('/api/quran/activity', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.accessToken}`
          },
          body: JSON.stringify({ activity: 'ayah_collected', verse_key: selectedWaypoint.ayahKey })
        }).then(() => console.log("Real sync with Quran Foundation API successful"));
      } else {
        fetch('/api/quran/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid, activity: 'ayah_collected' })
        }).then(() => console.log("Demo sync log recorded"));
      }

    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `profiles/${user.uid}`);
    }

  };
  const getSurahNoFromAyahKey = (ayahKey: string) => {
    const [surahNoStr] = String(ayahKey || '').split(':');
    const surahNo = Number(surahNoStr);
    return Number.isFinite(surahNo) ? surahNo : 0;
  };
  const sortedCollectedAyahs = useMemo(
    () => Array.from(collectedIds as Set<string>).sort((a: string, b: string) => {
      const [sa, va] = String(a).split(':').map(Number);
      const [sb, vb] = String(b).split(':').map(Number);
      return sa - sb || va - vb;
    }),
    [collectedIds]
  );
  const surahProgress = useMemo(() => {
    const counter: Record<number, number> = {};
    for (const ayahKey of collectedIds) {
      const surahNo = getSurahNoFromAyahKey(ayahKey);
      if (!surahNo) continue;
      counter[surahNo] = (counter[surahNo] || 0) + 1;
    }
    return Object.entries(counter)
      .map(([surahNoRaw, unlocked]) => {
        const surahNo = Number(surahNoRaw);
        const total = SURAH_AYAH_COUNTS[surahNo] || unlocked;
        const percent = Math.min(100, Math.round((unlocked / Math.max(1, total)) * 100));
        return { surahNo, unlocked, total, percent, surahName: SURAH_NAMES[surahNo] || String(surahNo) };
      })
      .sort((a, b) => a.surahNo - b.surahNo);
  }, [collectedIds]);
  const myRankPosition = useMemo(() => {
    if (!user) return null;
    const idx = leaders.findIndex((l) => l.id === user.uid);
    return idx >= 0 ? idx + 1 : null;
  }, [leaders, user]);

  if (path === '/terms') {
    return (
      <div className="min-h-screen bg-surface p-8 overflow-y-auto font-body-md text-on-surface">
        <button onClick={() => { window.history.pushState({}, '', '/'); setPath('/'); }} className="mb-6 flex items-center gap-2 text-primary font-bold">
          <span className="material-symbols-outlined">arrow_back</span> {t.back}
        </button>
        <div className="max-w-2xl mx-auto bg-surface-container p-8 rounded-2xl neubrutalist-border shadow-md">
          <h1 className="text-3xl font-bold mb-6">{t.termsTitle}</h1>
          <p><strong>{t.effectiveDate}:</strong> May 20, 2026</p>
          {false ? (
            <>
              <h2 className="text-xl font-bold mt-6 mb-2">1. Description of Service</h2>
              <p>Santree Go is an educational platform designed to encourage Quranic engagement through location-based discovery.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">2. Use of Geolocation</h2>
              <p>Santree Go requires access to your device&apos;s GPS location to function correctly. This data is used solely to surface Quranic verses in your vicinity.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">3. Quranic Content</h2>
              <p>All Quranic text, translations, and audio are provided via the Quran Foundation API.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">4. User Accounts</h2>
              <p>If you choose to use the "Login with Quran.com" feature, you agree to sync your bookmarks and streaks.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">5. Contact</h2>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold mt-6 mb-2">1. Description of Service</h2>
              <p>Santree Go is an educational platform designed to encourage Quranic engagement through location-based discovery.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">2. Use of Geolocation</h2>
              <p>Santree Go requires access to your device&apos;s GPS location to function correctly. This data is used solely to surface Quranic verses in your vicinity.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">3. Quranic Content</h2>
              <p>All Quranic text, translations, and audio are provided via the Quran Foundation API.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">4. User Accounts</h2>
              <p>If you choose to use the "Login with Quran.com" feature, you agree to sync your bookmarks and streaks.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">5. Contact</h2>
            </>
          )}
          <p>{t.contactQ} <strong>santreedigitalid@gmail.com</strong></p>
        </div>
      </div>
    );
  }

  if (path === '/privacy') {
    return (
      <div className="min-h-screen bg-surface p-8 overflow-y-auto font-body-md text-on-surface">
        <button onClick={() => { window.history.pushState({}, '', '/'); setPath('/'); }} className="mb-6 flex items-center gap-2 text-primary font-bold">
          <span className="material-symbols-outlined">arrow_back</span> {t.back}
        </button>
        <div className="max-w-2xl mx-auto bg-surface-container p-8 rounded-2xl neubrutalist-border shadow-md">
          <h1 className="text-3xl font-bold mb-6">{t.privacyTitle}</h1>
          <p><strong>{t.effectiveDate}:</strong> May 20, 2026</p>
          {false ? (
            <>
              <h2 className="text-xl font-bold mt-6 mb-2">1. Information We Collect</h2>
              <p>At Santree Go, we access your GPS coordinates to display nearby Quranic verses. We collect basic profile information when you log in.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">2. How We Use Data</h2>
              <p>To personalize your Quranic discovery experience and maintain your streaks.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">3. Data Storage</h2>
              <p>We use Firebase and Quran Foundation API. We do not sell your personal data.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">4. Contact Us</h2>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold mt-6 mb-2">1. Information We Collect</h2>
              <p>At Santree Go, we access your GPS coordinates to display nearby Quranic verses. We collect basic profile information when you log in.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">2. How We Use Data</h2>
              <p>To personalize your Quranic discovery experience and maintain your streaks.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">3. Data Storage</h2>
              <p>We use Firebase and Quran Foundation API. We do not sell your personal data.</p>
              <h2 className="text-xl font-bold mt-6 mb-2">4. Contact Us</h2>
            </>
          )}
          <p>{t.contactQ} <strong>santreedigitalid@gmail.com</strong></p>
        </div>
      </div>
    );
  }

  if (authLoading) return <div className="h-screen w-screen bg-surface flex items-center justify-center text-on-surface font-headline-md font-bold uppercase animate-pulse">{t.guiding}</div>;
  if (!user) return <LoginOverlay onGuestLogin={onGuestLogin} onQuranLogin={onQuranLogin} />;

  const handleSimulatedMove = (dLat: number, dLng: number) => {
    setCoords(prev => [prev[0] + dLat, prev[1] + dLng]);
    setLocationStatus('found');
  };
  const openReplayAyah = (ayahKey: string) => {
    const wp = waypoints.find((w) => w.ayahKey === ayahKey);
    if (wp) {
      setSelectedWaypoint({ ...wp, isFar: false, distance: 0, replayOnly: true });
      return;
    }
    setSelectedWaypoint({
      id: `replay-${ayahKey}`,
      lat: coords[0],
      lng: coords[1],
      ayahKey,
      arabicText: '',
      translation: '',
      points: 0,
      isFar: false,
      distance: 0,
      replayOnly: true,
    } as any);
  };
  const resetSyncNow = async () => {
    if (!user?.isQuranAuth || !user?.accessToken) return;
    setSyncStatus('syncing');
    try {
      localStorage.removeItem(QURAN_SYNC_QUEUE_KEY);
      setSyncQueue([]);
      await Promise.all([
        loadQuranUserData(user.accessToken),
        fetch('/api/quran/bookmarks?mushafId=4', { headers: { Authorization: `Bearer ${user.accessToken}` } })
          .then((r) => r.json())
          .then((data) => {
            const ayahKeys = Array.isArray(data?.data)
              ? data.data
                  .map((b: any) => `${b?.key}:${b?.verseNumber}`)
                  .filter((k: any) => typeof k === 'string' && k.includes(':'))
              : (data?.bookmarks || []).map((b: any) => String(b.verse_key || ''));
            if (ayahKeys.length > 0) setQuranBookmarkIds(new Set(ayahKeys));
          }),
      ]);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('failed');
    }
  };
  const showSimMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  return (
    <div className="h-screen w-screen bg-surface overflow-hidden select-none touch-none flex justify-center">
      <div className="relative h-screen w-full max-w-md bg-pattern bg-surface overflow-hidden">
      <XPHeader xp={xp} rank={rank} streak={streak}   />
      {xpGain !== null && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[1600] bg-brand-neon text-on-surface border-2 border-on-surface rounded-full px-3 py-1 text-xs font-label-bold uppercase animate-[floatUp_1.1s_ease-out_forwards]">
          +{xpGain} XP
        </div>
      )}
      {essenceGain !== null && (
        <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[1600] bg-surface text-on-surface border-2 border-on-surface rounded-full px-3 py-1 text-xs font-label-bold uppercase animate-[floatUp_1.1s_ease-out_forwards]">
          +{essenceGain} {t.essence}
        </div>
      )}
      
      {locationStatus === 'error' && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1500] w-[90%] max-w-sm bg-error-container neubrutalist-border hard-shadow px-4 py-3 rounded-2xl flex items-start gap-3">
          <div className="text-xl">📍</div>
          <div>
            <h3 className="text-on-error-container font-headline-md font-bold text-sm tracking-tight mb-1">{t.locationErrorTitle}</h3>
            <p className="text-on-error-container/80 text-xs mb-2">{t.locationErrorBody}</p>
            <button 
              onClick={() => {
                setLocationStatus('waiting');
                if ("geolocation" in navigator) {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      setCoords([pos.coords.latitude, pos.coords.longitude]);
                      setLocationStatus('found');
                    },
                    () => setLocationStatus('error'),
                    { enableHighAccuracy: true }
                  );
                }
              }}
              className="bg-surface text-on-surface text-xs font-label-bold uppercase tracking-wider px-3 py-1.5 rounded-full neubrutalist-border hard-shadow neubrutalist-interaction transition-all"
            >
              {t.retry}
            </button>
            <div className="mt-3 p-3 bg-surface-container rounded-xl border-2 border-on-surface">
              <p className="text-[10px] font-label-bold uppercase tracking-wider mb-2">{t.manualLocation}</p>
              <p className="text-[11px] text-on-surface mb-2">{t.manualLocationHint}</p>
              <div className="flex gap-2">
                <input
                  value={manualLocationQuery}
                  onChange={(e) => setManualLocationQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="flex-1 bg-surface px-2 py-1.5 rounded-lg border-2 border-on-surface text-xs"
                />
                <button
                  onClick={searchManualLocation}
                  disabled={manualLocationLoading}
                  className="bg-primary text-on-primary text-xs font-label-bold uppercase px-3 py-1.5 rounded-lg border-2 border-on-surface"
                >
                  {manualLocationLoading ? t.searching : t.search}
                </button>
              </div>
              {manualLocationResults.length > 0 ? (
                <div className="mt-2 max-h-36 overflow-y-auto space-y-2">
                  {manualLocationResults.map((loc) => (
                    <div key={`${loc.lat}-${loc.lng}`} className="bg-surface rounded-lg border-2 border-on-surface p-2">
                      <p className="text-[11px] text-on-surface mb-1 line-clamp-2">{loc.name}</p>
                      <button
                        onClick={() => useManualLocation(loc.lat, loc.lng)}
                        className="text-[10px] font-label-bold uppercase bg-brand-neon px-2 py-1 rounded-md border-2 border-on-surface"
                      >
                        {t.useThisLocation}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                manualLocationQuery.trim().length > 0 && !manualLocationLoading && (
                  <p className="mt-2 text-[11px] text-on-surface">{t.noLocationResults}</p>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {locationStatus === 'waiting' && activeTab === 'radar' && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1500] bg-surface neubrutalist-border hard-shadow px-4 py-2 rounded-full text-xs font-label-bold text-on-surface flex items-center gap-2 max-w-[90%]">
          <div className="w-2 h-2 rounded-full bg-primary animate-ping"></div>
          {t.searchingLocation}
        </div>
      )}

      {activeTab === 'radar' && (
        <div className="absolute top-24 left-4 z-[1500]">
          <button
            onClick={() => setShowLocationInfo((v) => !v)}
            className="w-9 h-9 bg-surface neubrutalist-border hard-shadow rounded-full flex items-center justify-center text-on-surface"
            aria-label="Location accuracy info"
          >
            <span className="material-symbols-outlined text-sm">info</span>
          </button>
          {showLocationInfo && (
            <div className="mt-2 w-64 bg-surface-container-high neubrutalist-border hard-shadow p-3 rounded-xl text-[11px] text-on-surface">
              {t.locationHint}
            </div>
          )}
        </div>
      )}

      {activeTab === 'radar' ? (
        <>
          <SmartRadar 
            userCoords={coords} 
            waypoints={waypoints} 
            collectedIds={activeCollectedIds} 
            onWaypointClick={handleWaypointClick}
            nearRange={nearRange}
            greenStartRange={greenStartRange}
            lockRange={lockRange}
            lockMaxRange={lockMaxRange}
          />
          {lockNotice && (
            <div className="absolute top-40 left-1/2 -translate-x-1/2 z-[1600] bg-error-container border-2 border-on-surface rounded-xl px-4 py-2 text-[11px] font-label-bold text-on-error-container hard-shadow">
              {lockNotice}
            </div>
          )}
          {waypoints.length === 0 && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1500] w-[92%] max-w-md bg-surface neubrutalist-border hard-shadow rounded-2xl p-4 text-on-surface">
              <h3 className="font-headline-md font-bold text-sm uppercase tracking-wide">
                'Preparing waypoints...'
              </h3>
              <p className="text-[11px] mt-1">
                'Please wait, we are preparing nearby verses for you.'
              </p>
            </div>
          )}
          {waypoints.length > 0 && availableWaypointCount === 0 && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1500] w-[92%] max-w-md bg-surface neubrutalist-border hard-shadow rounded-2xl p-4 text-on-surface">
              <h3 className="font-headline-md font-bold text-sm uppercase tracking-wide">
                'Nearby waypoints are completed'
              </h3>
              <p className="text-[11px] mt-1">
                {false
                  ? 'Walk to other areas (GPS) to find new waypoints, or wait for respawn.'
                  : 'Walk to another area (GPS) to discover more waypoints, or wait for respawn.'}
              </p>
              <div className="mt-3 text-[11px] font-label-bold uppercase tracking-wider bg-brand-neon text-on-surface rounded-lg border-2 border-on-surface px-3 py-2 inline-flex">
                {false ? `Next respawn: ${formatCountdown(nextRespawnMs)}` : `Next respawn: ${formatCountdown(nextRespawnMs)}`}
              </div>
            </div>
          )}
          {showSimMode && <MovementSimulator onMove={handleSimulatedMove} />}
        </>
      ) : activeTab === 'leaderboard' ? (
        <div className="absolute inset-0 z-10 flex flex-col p-6 pt-32 pb-32 overflow-y-auto bg-surface">
          <div className="max-w-xl mx-auto w-full">
            <div className="mb-6 bg-surface-container-high neubrutalist-border hard-shadow rounded-2xl p-4">
              <h2 className="text-3xl font-headline-md font-bold text-on-surface uppercase tracking-wide">{t.leaderboardTitle}</h2>
              <p className="text-[11px] font-label-bold uppercase tracking-widest text-on-surface mt-1">
                'Climb by earning the highest XP.'
              </p>
              <div className="mt-2 inline-flex px-2 py-1 rounded-lg border-2 border-on-surface bg-brand-neon text-[10px] font-label-bold uppercase">
                {t.yourRank}: {myRankPosition ? `#${myRankPosition}` : '-'}
              </div>
            </div>
            <div className="space-y-3">
              {leaders.map((lead, i) => (
                <div key={lead.id} className={cn(
                  "p-4 rounded-xl flex items-center gap-4 neubrutalist-border hard-shadow transition-transform relative overflow-hidden",
                  i === 0 && "bg-[#FFE082] hover:-translate-y-1 leaderboard-top1",
                  i === 1 && "bg-[#E0E0E0] hover:-translate-y-1 leaderboard-top2",
                  i === 2 && "bg-[#FFD7B0] hover:-translate-y-1 leaderboard-top3",
                  i > 2 && "bg-surface-variant hover:-translate-y-0.5",
                  lead.isMe && "ring-4 ring-brand-neon"
                )}>
                  <div className="w-14 h-14 rounded-xl bg-surface neubrutalist-border flex flex-col items-center justify-center">
                    <span className="text-[10px] font-label-bold uppercase">{i < 3 ? 'Top' : 'Rank'}</span>
                    <span className="font-headline-md font-bold text-lg">#{i+1}</span>
                  </div>
                  <div className="flex-grow">
                    <div className="text-on-surface font-label-bold uppercase tracking-widest">{lead.name}</div>
                    <div className="text-on-surface text-[10px] font-bold uppercase inline-flex mt-1 px-2 py-0.5 rounded-full bg-surface neubrutalist-border">
                      {lead.rank}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <div className="text-2xl font-headline-md font-bold text-on-surface leading-none">{lead.xp}</div>
                    <div className="text-[10px] font-label-bold text-on-surface uppercase bg-surface px-2 py-0.5 rounded-full neubrutalist-border mt-1">
                      XP
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === 'collection' ? (
        <div className="absolute inset-0 z-10 flex flex-col p-6 pt-32 pb-32 overflow-y-auto bg-surface">
          <div className="max-w-xl mx-auto w-full">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-3xl font-headline-md font-bold text-on-surface uppercase tracking-wide">{t.collectionTitle}</h2>
                <p className="text-on-surface font-label-bold text-[10px] uppercase tracking-widest mt-1">{t.synced}</p>
              </div>
              <div className="hidden sm:block">
                 <span className="material-symbols-outlined text-4xl text-tertiary">cloud_sync</span>
              </div>
            </div>
            <div className="bg-surface-container-high rounded-xl neubrutalist-border p-2 mb-4 grid grid-cols-2 gap-2">
              <button onClick={() => setJourneyView('progress')} className={cn("px-3 py-2 rounded-lg text-xs font-label-bold uppercase border-2 border-on-surface", journeyView === 'progress' ? "bg-brand-neon" : "bg-surface")}>{t.journeyProgress}</button>
              <button onClick={() => setJourneyView('replay')} className={cn("px-3 py-2 rounded-lg text-xs font-label-bold uppercase border-2 border-on-surface", journeyView === 'replay' ? "bg-brand-neon" : "bg-surface")}>{t.journeyReplay}</button>
            </div>
            <div className="mb-4 bg-surface-container-high rounded-xl neubrutalist-border p-3 flex items-center justify-between">
              <span className="text-xs font-label-bold uppercase">{t.essence}</span>
              <span className="text-lg font-headline-md font-bold">{essence}</span>
            </div>
            {journeyView === 'progress' ? (
              <div className="space-y-2">
                {surahProgress.length === 0 && (
                  <div className="text-center p-8 bg-surface-variant rounded-xl neubrutalist-border border-dashed text-on-surface">
                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search</span>
                    <p className="font-label-bold">{t.noAyah}</p>
                  </div>
                )}
                {surahProgress.map((s) => (
                  <div key={`surah-${s.surahNo}`} className="bg-surface p-3 rounded-xl neubrutalist-border">
                    <div className="flex justify-between text-xs font-label-bold uppercase">
                      <span>{`Surah ${s.surahName}`}</span>
                      <span>{s.percent}%</span>
                    </div>
                    <div className="mt-2 h-3 bg-surface-container rounded-full border-2 border-on-surface overflow-hidden">
                      <div className="h-full bg-brand-neon" style={{ width: `${s.percent}%` }} />
                    </div>
                    <div className="mt-1 text-[10px] uppercase font-label-bold">{s.unlocked}/{s.total}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sortedCollectedAyahs.length === 0 && (
                  <div className="col-span-1 sm:col-span-2 text-center p-8 bg-surface-variant rounded-xl neubrutalist-border border-dashed text-on-surface">
                    <p className="font-label-bold">{t.noAyah}</p>
                  </div>
                )}
                {sortedCollectedAyahs.map((id: string, index) => (
                  <button key={id} onClick={() => openReplayAyah(id)} className="bg-parchment p-4 rounded-xl flex flex-col items-center gap-2 neubrutalist-border hard-shadow text-left">
                    <span className="material-symbols-outlined text-tertiary text-3xl">replay</span>
                    <div className="text-on-surface font-headline-md font-bold text-base">
                      {(() => {
                        if (!id.includes(':')) return false ? `Ayah #${index + 1}` : `Ayah #${index + 1}`;
                        const [surahNoStr, ayahNo] = id.split(':');
                        const surahName = SURAH_NAMES[Number(surahNoStr)] || surahNoStr;
                        return false ? `Surah ${surahName} Ayah ${ayahNo}` : `Surah ${surahName} Ayah ${ayahNo}`;
                      })()}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-8">
              <h3 className="text-sm font-label-bold uppercase tracking-widest mb-3 text-on-surface">Quran Bookmarks (Synced)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from(quranBookmarkIds).length === 0 && (
                  <div className="col-span-1 sm:col-span-2 text-center p-6 bg-surface-variant rounded-xl neubrutalist-border border-dashed text-on-surface">
                    <p className="font-label-bold text-xs">No synced bookmarks yet.</p>
                  </div>
                )}
                {Array.from(quranBookmarkIds).map((id: string) => (
                  <div key={`bm-${id}`} className="bg-surface-container p-4 rounded-xl neubrutalist-border">
                    <div className="text-on-surface font-headline-md font-bold text-base">
                      {(() => {
                        const [surahNoStr, ayahNo] = id.split(':');
                        const surahName = SURAH_NAMES[Number(surahNoStr)] || surahNoStr;
                        return false
                          ? `Surah ${surahName} Ayah ${ayahNo}`
                          : `Surah ${surahName} Ayah ${ayahNo}`;
                      })()}
                    </div>
                    <div className="text-on-surface font-label-bold uppercase text-[10px] mt-1">Synced Bookmark</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 z-10 p-6 pt-28 pb-32 bg-surface overflow-y-auto">
          <div className="max-w-xl mx-auto w-full space-y-6">
            <div className="bg-surface-container-high rounded-3xl neubrutalist-border hard-shadow p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl border-4 border-on-surface bg-primary-container flex items-center justify-center text-4xl shadow-[4px_4px_0px_0px_rgba(34,26,20,1)]">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    PROFILE_STYLE_AVATAR[profileStyle] || '👦🏻'
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl sm:text-3xl font-headline-md font-bold text-on-surface truncate">
                    {user?.displayName || user?.email?.split('@')[0] || "Explorer"}
                  </h2>
                  <p className="text-xs font-label-bold uppercase tracking-wider text-on-surface mt-1">
                    {user?.email || 'guest@ayahquest.com'}
                  </p>
                  <div className="inline-flex mt-3 bg-tertiary-fixed px-3 py-1 rounded-full neubrutalist-border text-on-surface font-label-bold uppercase tracking-wider text-[10px]">
                    {rank}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-surface-container-high p-5 rounded-2xl text-center neubrutalist-border hard-shadow">
                <span className="material-symbols-outlined text-3xl text-primary mb-2">library_books</span>
                <div className="text-2xl font-headline-md font-bold text-on-surface">{collectedIds.size}</div>
                <div className="text-[10px] font-label-bold text-on-surface uppercase mt-1">{t.scrollsStat}</div>
              </div>
              <div className="bg-surface-container-high p-5 rounded-2xl text-center neubrutalist-border hard-shadow">
                <span className="material-symbols-outlined text-3xl text-tertiary mb-2">hotel_class</span>
                <div className="text-2xl font-headline-md font-bold text-on-surface">LV. {Math.floor(xp / 100) + 1}</div>
                <div className="text-[10px] font-label-bold text-on-surface uppercase mt-1">{t.masteryStat}</div>
              </div>
              <div className="bg-surface-container-high p-5 rounded-2xl text-center neubrutalist-border hard-shadow">
                <span className="material-symbols-outlined text-3xl text-primary mb-2">diamond</span>
                <div className="text-2xl font-headline-md font-bold text-on-surface">{essence}</div>
                <div className="text-[10px] font-label-bold text-on-surface uppercase mt-1">{t.essence}</div>
              </div>
            </div>

            <div className="bg-surface-container-high p-5 rounded-2xl neubrutalist-border hard-shadow">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-label-bold uppercase tracking-widest text-on-surface">{t.impactPanel}</h3>
                <span className={cn(
                  "text-[10px] px-2 py-1 rounded-full border-2 border-on-surface font-label-bold uppercase",
                  syncStatus === 'synced' && "bg-[#B9F6CA] text-on-surface",
                  syncStatus === 'pending' && "bg-[#FFF59D] text-on-surface",
                  syncStatus === 'failed' && "bg-error-container text-error",
                  syncStatus === 'syncing' && "bg-surface-variant text-on-surface",
                  syncStatus === 'idle' && "bg-surface text-on-surface"
                )}>
                  Sync: {syncStatus}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-surface rounded-xl neubrutalist-border p-2">
                  <div className="text-lg font-headline-md font-bold">{streak}</div>
                  <div className="text-[10px] font-label-bold uppercase">Streak</div>
                </div>
                <div className="bg-surface rounded-xl neubrutalist-border p-2">
                  <div className="text-lg font-headline-md font-bold">{notes.length}</div>
                  <div className="text-[10px] font-label-bold uppercase">Notes</div>
                </div>
                <div className="bg-surface rounded-xl neubrutalist-border p-2">
                  <div className="text-lg font-headline-md font-bold">{collectionsData.length}</div>
                  <div className="text-[10px] font-label-bold uppercase">Collections</div>
                </div>
              </div>
              <button
                onClick={retrySyncQueue}
                disabled={syncQueue.length === 0 || syncStatus === 'syncing'}
                className="mt-3 w-full bg-brand-neon text-on-surface rounded-lg neubrutalist-border px-3 py-2 text-xs font-label-bold uppercase disabled:opacity-50"
              >
                {t.syncRetry} ({syncQueue.length})
              </button>
              <button
                onClick={resetSyncNow}
                disabled={syncStatus === 'syncing' || !user?.isQuranAuth}
                className="mt-2 w-full bg-surface rounded-lg neubrutalist-border px-3 py-2 text-xs font-label-bold uppercase disabled:opacity-50"
              >
                {t.resetSync}
              </button>
            </div>

            <div className="bg-surface-container-high p-5 rounded-2xl neubrutalist-border hard-shadow space-y-4">
              <h3 className="text-sm font-label-bold uppercase tracking-widest text-on-surface">{t.goalsReflections}</h3>
              <div className="space-y-2">
                <label className="text-[10px] font-label-bold uppercase tracking-widest">'Goal'</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder='Daily Ayah Goal'
                    className="col-span-2 bg-surface border-2 border-on-surface rounded-lg px-2 py-2 text-xs"
                  />
                  <input
                    type="number"
                    min={1}
                    value={goalGoal}
                    onChange={(e) => setGoalGoal(Number(e.target.value) || 1)}
                    className="bg-surface border-2 border-on-surface rounded-lg px-2 py-2 text-xs"
                  />
                </div>
                <button onClick={createGoal} className="w-full bg-surface rounded-lg neubrutalist-border px-3 py-2 text-xs font-label-bold uppercase">{t.saveGoal}</button>
                <div className="space-y-1">
                  {goals.slice(0, 3).map((g) => (
                    <div key={g.id} className="bg-surface rounded-lg border-2 border-on-surface p-2">
                      <div className="text-xs font-label-bold">{g.title}</div>
                      <div className="text-[10px] uppercase">{g.progress}/{g.target}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-label-bold uppercase tracking-widest">'Notes'</label>
                <input
                  value={noteVerseKey}
                  onChange={(e) => setNoteVerseKey(e.target.value)}
                  placeholder={false ? 'Verse key (e.g. 2:255)' : 'Verse key (e.g. 2:255)'}
                  className="w-full bg-surface border-2 border-on-surface rounded-lg px-2 py-2 text-xs"
                />
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder='Write your reflection...'
                  className="w-full bg-surface border-2 border-on-surface rounded-lg px-2 py-2 text-xs min-h-20"
                />
                <button onClick={createNote} className="w-full bg-surface rounded-lg neubrutalist-border px-3 py-2 text-xs font-label-bold uppercase">{t.saveNote}</button>
                <div className="space-y-1">
                  {notes.slice(0, 3).map((n) => (
                    <div key={n.id} className="bg-surface rounded-lg border-2 border-on-surface p-2">
                      <div className="text-[10px] font-label-bold uppercase">{n.verseKey}</div>
                      <div className="text-xs line-clamp-2">{n.content}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-label-bold uppercase tracking-widest">'Collections'</label>
                <div className="flex gap-2">
                  <input
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                    placeholder='Collection name'
                    className="flex-1 bg-surface border-2 border-on-surface rounded-lg px-2 py-2 text-xs"
                  />
                  <button onClick={createCollection} className="bg-surface rounded-lg neubrutalist-border px-3 py-2 text-xs font-label-bold uppercase">{t.addCollection}</button>
                </div>
                <div className="space-y-1">
                  {collectionsData.slice(0, 3).map((c) => (
                    <div key={c.id} className="bg-surface rounded-lg border-2 border-on-surface p-2 flex justify-between text-xs">
                      <span className="font-label-bold">{c.name}</span>
                      <span>{c.count || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-surface-container-high p-5 rounded-2xl neubrutalist-border hard-shadow">
              <h3 className="text-sm font-label-bold uppercase tracking-widest mb-3 text-on-surface">{t.settings}</h3>
              <label className="block text-[10px] font-label-bold uppercase tracking-widest mt-4 mb-2">{t.qari}</label>
              <select
                value={audioReciterId}
                onChange={(e) => setAudioReciterId(e.target.value)}
                className="w-full bg-surface text-on-surface p-2 rounded-lg border-2 border-on-surface font-label-bold"
              >
                {AUDIO_RECITERS.map((reciter) => (
                  <option key={reciter.id} value={reciter.id}>{reciter.label}</option>
                ))}
              </select>
              <label className="block text-[10px] font-label-bold uppercase tracking-widest mt-4 mb-2">{t.profileStyle}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'ikhwan', label: t.ikhwan },
                  { id: 'akhwat', label: t.akhwat },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setProfileStyle(item.id)}
                    className={cn(
                      "px-2 py-2 rounded-lg border-2 border-on-surface text-xs font-label-bold uppercase flex items-center justify-center gap-2",
                      profileStyle === item.id ? "bg-brand-neon text-on-surface" : "bg-surface text-on-surface"
                    )}
                  >
                    <span>{PROFILE_STYLE_AVATAR[item.id]}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={() => {
                playSound('error');
                localStorage.removeItem(QURAN_AUTH_STORAGE_KEY);
                setUser(null);
                setXp(0);
                setEssence(0);
                setStreak(0);
                setRank('Seeker of Light');
                setCollectedIds(new Set());
                auth.signOut().catch(() => {});
              }}
              className="w-full text-error font-label-bold uppercase tracking-widest flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-error-container neubrutalist-border neubrutalist-interaction transition-all"
            >
              <span className="material-symbols-outlined">logout</span>
              {t.logout}
            </button>
          </div>
        </div>
      )}

      <BottomNav active={activeTab} onChange={setActiveTab}   />
      
      {/* Removed compass and exp display from bottom */}

      <AnimatePresence>
        {selectedWaypoint && (
          <AyahModal 
            waypoint={selectedWaypoint}
            onCollect={onCollect}
            onClose={() => setSelectedWaypoint(null)}
             
          />
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .pulse-ring {
          border: 2px solid rgba(16, 185, 129, 0.4);
          border-radius: 50%;
          animation: pulse 2.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        @keyframes floatUp {
          0% { transform: translate(-50%, 0); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translate(-50%, -24px); opacity: 0; }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out infinite;
        }
        .animate-spin-slow {
          animation: spin 6s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}} />
      </div>
    </div>
  );
}
