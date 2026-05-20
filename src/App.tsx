import React, { useState, useEffect, useMemo, useRef } from 'react';
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

const quranPublic = createPublicClient({
  clientId: import.meta.env.VITE_QURAN_CLIENT_ID || 'b952392b-b89f-4b66-93a8-60e2dfb82ae4',
  clientType: 'public',
  services: {
    oauth2BaseUrl: "https://prelive-oauth2.quran.foundation"
  }
});

// --- Components ---

const LoginOverlay = ({ onGuestLogin, onQuranLogin }: { onGuestLogin: () => void, onQuranLogin: () => void }) => {
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
          <p className="text-on-surface-variant font-label-bold uppercase tracking-widest text-[10px] text-center font-bold">A Journey to Enlightenment</p>
        </div>
        
        <div className="flex flex-col gap-4 w-full">
          {window.location.hostname === 'localhost' && (
            <button 
              onClick={() => {
                window.location.href = '/?quran_login=success&access_token=mock_token_for_dev';
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
            LOGIN WITH QURAN.COM
          </button>

          <button 
            onClick={onGuestLogin}
            className="w-full bg-surface text-on-surface font-label-bold py-3 rounded-xl flex items-center justify-center gap-3 neubrutalist-border hard-shadow neubrutalist-interaction transition-all border-dashed text-xs opacity-70"
          >
            CONTINUE AS GUEST
          </button>
        </div>

        <p className="text-[11px] text-on-surface-variant italic px-4 leading-relaxed">
          Unlock your Quranic potential. We use Quran.com to sync your progress, bookmarks, and streaks across the ecosystem.
        </p>
      </motion.div>
    </div>
  );
};

const XPHeader = ({ xp, rank, streak }: { xp: number, rank: string, streak: number }) => {
  const level = Math.floor(xp / 100) + 1;
  const currentLevelXP = xp % 100;

  return (
    <header className="fixed top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-2 pointer-events-none">
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
          <span className="text-on-primary font-label-bold text-[10px] uppercase tracking-wider mb-1">XP to Next Level</span>
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

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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
  onWaypointClick 
}: { 
  userCoords: [number, number], 
  waypoints: Waypoint[], 
  collectedIds: Set<string>,
  onWaypointClick: (wp: Waypoint) => void
}) => {
  
  // Custom Icon for Ayah
  const ayahIcon = new L.DivIcon({
    className: 'leaflet-div-icon',
    html: `
      <div class="relative flex flex-col items-center">
        <div class="w-16 h-16 bg-tertiary-fixed rounded-full neubrutalist-border flex items-center justify-center neubrutalism-shadow cursor-pointer transition-transform hover:-translate-y-2 relative marker-pulse">
            <span class="font-arabic-display text-arabic-display text-on-surface">آ</span>
        </div>
      </div>
    `
  });

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

          {/* Interactive Waypoints */}
          {waypoints.map((wp) => {
            const collected = collectedIds.has(wp.ayahKey);
            if (collected) return null; // Don't show collected

            return (
              <Marker 
                key={wp.id} 
                position={[wp.lat, wp.lng]} 
                icon={ayahIcon}
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

const AyahModal = ({ waypoint, onCollect, onClose }: { waypoint: Waypoint & { isFar?: boolean, distance?: number }, onCollect: () => void, onClose: () => void }) => {
  const [chapterName, setChapterName] = useState<string>('');
  const [words] = useState(() => (waypoint.arabicText || '').split(' ').filter(w => w.trim() !== ''));
  const [shuffledBank, setShuffledBank] = useState<{word: string, id: number}[]>([]);
  const [selectedWords, setSelectedWords] = useState<number[]>([]);
  const [isError, setIsError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (waypoint.audioUrl) {
      audioRef.current = new Audio(waypoint.audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [waypoint.audioUrl]);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };


  useEffect(() => {
    const fetchChap = async () => {
      try {
        const cId = waypoint.ayahKey.split(':')[0];
        if (!cId) return;
        // Use the backend proxy instead of direct SDK call to avoid frontend restrictions
        const res = await fetch(`/api/quran/chapter-info/${cId}`);
        if (!res.ok) throw new Error('Failed to fetch from proxy');
        const data = await res.json();
        if (data && data.chapter && data.chapter.name_simple) {
          setChapterName(data.chapter.name_simple);
        } else if (data && data.name_simple) {
           setChapterName(data.name_simple);
        }
      } catch(e) {
        console.warn("Failed to fetch chapter name", e);
      }
    };
    fetchChap();

    // Shuffle words for bank
    const bank = words.map((word, i) => ({ word, id: i })).sort(() => Math.random() - 0.5);
    setShuffledBank(bank);
  }, [waypoint.ayahKey, words]);

  const handleWordClick = (id: number) => {
    if (selectedWords.includes(id)) return;
    
    const nextExpectedWord = words[selectedWords.length];
    const clickedWord = shuffledBank.find(w => w.id === id)?.word;
    
    if (clickedWord === nextExpectedWord) {
      setSelectedWords(p => [...p, id]);
      playSound('open');
    } else {
      setIsError(true);
      playSound('error');
      setTimeout(() => setIsError(false), 500);
    }
  };

  const removeWord = (indexToRemove: number) => {
    // Only allow removing the last selected word
    if (indexToRemove !== selectedWords.length - 1) return;
    playSound('error');
    setSelectedWords(p => p.slice(0, -1));
  };

  const isComplete = selectedWords.length === words.length;

  if (isComplete) {
    return (
      <div className="fixed inset-0 z-[2000] bg-on-surface/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-primary-container text-on-primary-container border-4 border-on-surface shadow-[8px_8px_0px_0px_#181d17] rounded-xl w-full max-w-sm flex flex-col items-center p-6 gap-6 relative transform transition-transform animate-[popIn_0.3s_ease-out]">
          <button 
            onClick={onClose}
            aria-label="Close" 
            className="absolute top-2 right-2 w-10 h-10 flex items-center justify-center bg-surface text-on-surface border-4 border-on-surface rounded-full shadow-[2px_2px_0px_0px_#181d17] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          
          {waypoint.isFar ? (
             <div className="mt-4 bg-surface text-on-surface border-4 border-on-surface shadow-[4px_4px_0px_0px_#181d17] rounded-full px-4 py-2 flex items-center gap-2 rotate-[-2deg]">
                <span className="material-symbols-outlined text-[#ff5722]" style={{ fontVariationSettings: "'FILL' 1" }}>map</span>
                <span className="font-label-bold uppercase tracking-wider">Jarak Jauh</span>
             </div>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="bg-surface text-on-surface border-4 border-on-surface shadow-[4px_4px_0px_0px_#181d17] rounded-full px-4 py-2 flex items-center gap-2 rotate-[-2deg]">
                <span className="material-symbols-outlined text-[#ff5722]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                <span className="font-label-bold uppercase tracking-wider">Cahaya Langsung</span>
              </div>
              {waypoint.isContextual && (
                <div className="bg-brand-neon text-on-surface border-4 border-on-surface shadow-[2px_2px_0px_0px_#181d17] rounded-full px-3 py-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">nature_people</span>
                  <span className="font-label-bold uppercase tracking-wider text-[10px]">Context: {waypoint.theme}</span>
                </div>
              )}
            </div>
          )}

          <div className="text-center w-full">
            <h2 className="font-headline-lg text-3xl font-bold mb-1">Masha'Allah!</h2>
            <p className="font-body-md opacity-90">Quest Objective Complete.</p>
          </div>

          <div className="w-full bg-surface-container border-4 border-on-surface shadow-[4px_4px_0px_0px_#181d17] rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b-2 border-on-surface pb-2">
              <div className="flex items-center gap-2 text-on-surface">
                <span className="material-symbols-outlined">graphic_eq</span>
                <span className="font-label-bold">Surah {chapterName || 'Ayah'}</span>
              </div>
            </div>
            
            {waypoint.tajweedText ? (
              <div 
                className="font-arabic-display text-2xl text-center leading-relaxed py-2 max-h-32 overflow-y-auto"
                dir="rtl"
                dangerouslySetInnerHTML={{ __html: waypoint.tajweedText }}
              />
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
            
            <div className="flex justify-center gap-4 mt-1">
              <button disabled className="w-10 h-10 rounded-full border-4 border-on-surface bg-surface text-on-surface shadow-[2px_2px_0px_0px_#181d17] flex items-center justify-center opacity-50">
                <span className="material-symbols-outlined text-sm">replay_10</span>
              </button>
              <button 
                onClick={toggleAudio}
                disabled={!audioRef.current}
                className={cn(
                  "w-12 h-12 rounded-full border-4 border-on-surface bg-primary text-on-primary shadow-[2px_2px_0px_0px_#181d17] flex items-center justify-center hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all",
                  !audioRef.current && "opacity-50"
                )}
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>
              <button disabled className="w-10 h-10 rounded-full border-4 border-on-surface bg-surface text-on-surface shadow-[2px_2px_0px_0px_#181d17] flex items-center justify-center opacity-50">
                <span className="material-symbols-outlined text-sm">forward_10</span>
              </button>
            </div>
          </div>

          <button 
            onClick={onCollect}
            className="w-full bg-brand-neon text-on-surface border-4 border-on-surface shadow-[6px_6px_0px_0px_#181d17] rounded-xl py-4 px-4 font-headline-md font-bold uppercase tracking-wide hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all cursor-pointer mt-2 flex items-center justify-center gap-2 group"
          >
            KLAIM REWARD
            <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">star</span>
          </button>
        </div>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes popIn {
            0% { transform: scale(0.9); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}} />
      </div>
    );
  }

  // Enigma Panel
  return (
    <div className="fixed inset-0 z-[2000] flex flex-col justify-end pointer-events-auto overflow-hidden">
      <div className="absolute inset-0 bg-on-surface/20 backdrop-blur-[2px]" onClick={onClose} />
      
      <div className="relative z-10 w-full max-w-md bg-brand-secondary h-[80vh] border-t-[5px] border-on-surface rounded-t-[24px] shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)] flex flex-col mx-auto animate-[slideUp_0.3s_ease-out]">
        
        {/* Drag Handle Indicator */}
        <div className="w-full flex justify-center pt-4 pb-2" onClick={onClose}>
          <div className="w-16 h-1 bg-on-surface rounded-full opacity-50"></div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col gap-6" style={{ scrollbarWidth: 'none' }}>
          {/* Header Section */}
          <div className="flex flex-col items-center gap-4 mt-2">
            {/* Ribbon Banner */}
            <div className="bg-on-surface text-on-primary px-6 py-2 neubrutalist-border hard-shadow rounded-lg -mt-2 transform -rotate-1 relative z-20 w-[90%] mx-auto text-center shrink-0">
              <h2 className="font-headline-md text-sm md:text-lg text-brand-neon tracking-wide uppercase">
                 {chapterName ? `SURAH ${chapterName} : ${waypoint.ayahKey.split(':')[1]}` : `AYAH ${waypoint.ayahKey}`}
              </h2>
            </div>
            
            {/* Translation Box */}
            <div className="bg-surface p-4 neubrutalist-border hard-shadow w-full text-center rounded-xl bg-white mt-2 relative">
              <span className="absolute -top-3 -left-3 bg-brand-neon neubrutalist-border p-1 rounded-full z-10 w-8 h-8 flex items-center justify-center">
                <span className="material-symbols-outlined text-on-surface text-sm">translate</span>
              </span>
              <p className="font-body-lg text-lg text-on-surface italic">"{waypoint.translation}"</p>
            </div>
          </div>

          {/* Assembly Line (Drop Zones) */}
          <div className="bg-white p-4 rounded-xl neubrutalist-border w-full">
            <div className="flex flex-row-reverse flex-wrap gap-2 justify-center items-center min-h-[80px]" dir="rtl">
               {words.map((w, i) => {
                 const isFilled = i < selectedWords.length;
                 const filledWordId = isFilled ? selectedWords[i] : null;
                 const filledWordText = isFilled ? shuffledBank.find(b => b.id === filledWordId)?.word : null;
                 
                 return isFilled ? (
                   <div 
                     key={`drop-${i}`}
                     onClick={() => removeWord(i)}
                     className="min-h-16 px-4 bg-brand-primary text-on-primary neubrutalist-border hard-shadow rounded-lg flex items-center justify-center transform transition-transform cursor-pointer relative"
                   >
                     <span className="font-arabic-display text-3xl leading-none mt-2 pb-2">{filledWordText}</span>
                     {i === selectedWords.length - 1 && (
                       <div className="absolute -top-2 -right-2 bg-error text-on-error rounded-full w-6 h-6 flex items-center justify-center neubrutalist-border text-xs z-10">
                         <span className="material-symbols-outlined text-[14px]">close</span>
                       </div>
                     )}
                   </div>
                 ) : (
                   <div 
                     key={`drop-empty-${i}`} 
                     className={cn(
                       "w-20 h-16 border-2 border-dashed border-on-surface rounded-lg bg-surface-variant/30 flex items-center justify-center opacity-70",
                       isError && i === selectedWords.length && "border-error bg-error-container"
                     )}
                   >
                     <span className="material-symbols-outlined text-outline">add</span>
                   </div>
                 );
               })}
            </div>
          </div>

          <div className="w-full h-[2px] bg-on-surface opacity-10 my-1 shrink-0"></div>

          {/* Scrambled Grid (Word Blocks) */}
          <div className="grid grid-cols-2 gap-3 w-full pb-8 rtl" dir="rtl">
            {shuffledBank.map((item) => {
              const isUsed = selectedWords.includes(item.id);
              
              if (isUsed) {
                return (
                  <button 
                    key={`bank-used-${item.id}`}
                    disabled
                    className="h-20 bg-surface-variant text-on-surface/30 neubrutalist-border rounded-xl flex items-center justify-center cursor-not-allowed border-dashed opacity-50 relative overflow-hidden"
                  >
                    <span className="font-arabic-display text-4xl leading-none mt-2 pb-2">{item.word}</span>
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
                  className="h-24 bg-white text-on-surface neubrutalist-border hard-shadow rounded-xl flex flex-col items-center justify-center neubrutalism-active transition-all cursor-pointer hover:bg-brand-secondary active:scale-95 px-2"
                >
                  <span className="font-arabic-display text-3xl leading-none mt-2">{item.word}</span>
                  <span className="text-[10px] font-label-bold text-on-surface-variant uppercase mt-1 text-center line-clamp-1">
                    {waypoint.wordsData?.[item.id]?.translation || '...'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}} />
    </div>
  );
};

const BottomNav = ({ active, onChange }: { active: string, onChange: (val: string) => void }) => {
  const tabs = [
    { id: 'radar', iconName: 'map', label: 'Map' },
    { id: 'collection', iconName: 'menu_book', label: 'Scrolls' },
    { id: 'leaderboard', iconName: 'emoji_events', label: 'Leaders' },
    { id: 'profile', iconName: 'person', label: 'Profile' }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[1000] flex justify-around items-center h-24 pb-4 pointer-events-none">
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
                 ? "flex flex-col items-center justify-center w-14 h-14 bg-primary text-on-primary rounded-lg border-2 border-on-surface p-2 translate-x-1 translate-y-1 shadow-none transition-all" 
                 : "flex flex-col items-center justify-center w-14 h-14 text-on-secondary-container p-2 hover:bg-surface-variant transition-transform rounded-lg"
            )}
            title={tab.label}
          >
            <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: `'FILL' ${isActive ? '1' : '0'}` }}>
              {tab.iconName}
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
  const QURAN_AUTH_STORAGE_KEY = 'santree_quran_auth';
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ... (inside the component, before the return)
  
  const handleGuestLogin = () => {
    playSound('open');
    setUser({
      uid: 'guest-user',
      displayName: 'Guest Explorer',
      email: 'guest@ayahquest.com'
    });
  };

  const handleQuranLogin = () => {
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
  const [coords, setCoords] = useState<[number, number]>([-6.2088, 106.8456]); 
  const [locationStatus, setLocationStatus] = useState<'waiting' | 'found' | 'error'>('waiting');
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [rank, setRank] = useState('Seeker of Light');
  const [activeTab, setActiveTab] = useState('radar');
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());
  const [leaders, setLeaders] = useState<{name: string, xp: number, rank: string, isMe?: boolean, id: string}[]>([]);
  const [selectedWaypoint, setSelectedWaypoint] = useState<(Waypoint & { isFar?: boolean, distance?: number }) | null>(null);
  const [discoveryRange] = useState(25); // 25 meters proximity

  const [path, setPath] = useState(window.location.pathname);
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
        }
      } catch (_) {
        localStorage.removeItem(QURAN_AUTH_STORAGE_KEY);
      }
    }

    // Check for Quran.com login success in URL
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    
    if (urlParams.get('quran_login') === 'success') {
      const quranUser = {
        uid: 'quran-user-' + (accessToken ? accessToken.substring(0, 10) : Math.random().toString(36).substring(7)),
        displayName: 'Quran Explorer',
        email: 'user@quran.com',
        isQuranAuth: true,
        accessToken: accessToken
      };
      setUser(quranUser);
      setAuthLoading(false); // Crucial: Stop loading and enter dashboard
      localStorage.setItem(QURAN_AUTH_STORAGE_KEY, JSON.stringify(quranUser));
      
      // Load/Create Game Profile in Firebase based on Quran.com ID
      const syncProfile = async () => {
        const profileRef = doc(db, 'profiles', quranUser.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setXp(profileSnap.data().xp || 0);
          setStreak(profileSnap.data().streak || 0);
          setRank(profileSnap.data().rank || 'Seeker of Light');
          setCollectedIds(new Set(profileSnap.data().collectedIds || []));
        } else {
          await setDoc(profileRef, {
            xp: 0, streak: 0, rank: 'Seeker of Light',
            userId: quranUser.uid, name: quranUser.displayName, collectedIds: []
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
            setCollectedIds(new Set(ayahKeys));
          }
        })
        .catch(err => console.error("Failed to sync bookmarks", err));
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
          setStreak(profileSnap.data().streak || 0);
          setRank(profileSnap.data().rank || 'Seeker of Light');
          setCollectedIds(new Set(profileSnap.data().collectedIds || []));
        } else {
          await setDoc(profileRef, {
            xp: 0,
            streak: 0,
            rank: 'Seeker of Light',
            userId: u.uid,
            name: u.displayName || 'Anonymous Seeker',
            collectedIds: []
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
  }, []);

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
      
      if (wps.length === 0 || wps.some(w => !w.arabicText || w.arabicText === "Teks bahasa Arab tidak tersedia")) {
        // Generate random points with varying distances
        const newWaypoints: Waypoint[] = [];
        for (let i = 0; i < 7; i++) {
          // Angle in radians
          const angle = Math.random() * Math.PI * 2;
          // Distance in meters: some close (5-25m), some far (30-300m)
          const distanceMeters = i < 3 ? (5 + Math.random() * 20) : (30 + Math.random() * 270);
          // Approximate meters to degrees
          const rLat = distanceMeters / 111320;
          const rLng = distanceMeters / (111320 * Math.cos(coords[0] * Math.PI / 180));
          
          const lat = coords[0] + (rLat * Math.sin(angle));
          const lng = coords[1] + (rLng * Math.cos(angle));

          try {
            const verseRes = await fetch(`/api/quran/contextual-verse?lat=${lat}&lng=${lng}`);
            if (!verseRes.ok) throw new Error('API Error');
            const verseData = await verseRes.json();
            const ayah = verseData.verse || verseData;
            
            // The SDK usually unwraps the "verse" envelope and camelCases properties
            const verseKey = ayah.verseKey || ayah.verse_key;
            const arabicText = ayah.textUthmani || ayah.text_uthmani || ayah.text || "Teks bahasa Arab tidak tersedia";
            const tajweedText = ayah.textUthmaniTajweed || ayah.text_uthmani_tajweed;
            const translationText = ayah.translations?.[0]?.text?.replace(/<[^>]+>/g, '') || "Terjemahan tidak tersedia";
            const audioUrl = ayah.audio?.url ? `https://verses.quran.com/${ayah.audio.url}` : undefined;
            const wordsData = ayah.words?.map((w: any) => ({
              text: w.textUthmani || w.text_uthmani,
              translation: w.translation?.text,
              id: w.id
            })) || [];

            newWaypoints.push({
              id: Math.random().toString(36).substring(7),
              lat,
              lng,
              ayahKey: verseKey,
              arabicText: arabicText,
              tajweedText: tajweedText,
              translation: translationText,
              audioUrl: audioUrl,
              points: ayah.metadata?.isContextual ? 25 : 15,
              theme: ayah.metadata?.theme,
              isContextual: ayah.metadata?.isContextual,
              wordsData: wordsData
            } as any);
          } catch(e) {
             // Fallback in case API fails
             newWaypoints.push({
               id: Math.random().toString(36).substring(7),
               lat,
               lng,
               ayahKey: "2:255",
               arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
               translation: "Allah! Tidak ada tuhan selain Dia. Yang Mahahidup, Yang terus-menerus mengurus (makhluk-Nya).",
               points: 25
             });
          }
        }
        
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
  }, [user, locationStatus]);

  // Handle Location
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setCoords([pos.coords.latitude, pos.coords.longitude]);
          setLocationStatus('found');
        },
        (err) => {
          console.error(err);
          setLocationStatus('error');
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setLocationStatus('error');
    }
  }, []);

  const handleWaypointClick = (wp: Waypoint) => {
    if (collectedIds.has(wp.ayahKey)) return;
    
    // Distance helper
    const R = 6371e3;
    const f1 = coords[0] * Math.PI/180;
    const f2 = wp.lat * Math.PI/180;
    const df = (wp.lat-coords[0]) * Math.PI/180;
    const dl = (wp.lng-coords[1]) * Math.PI/180;
    const a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2) * Math.sin(dl/2);
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    playSound('open');
    setSelectedWaypoint({
      ...wp,
      isFar: dist > discoveryRange,
      distance: dist
    });
  };

  const onCollect = async () => {
    if (!selectedWaypoint || !user) return;
    
    // Base points for reading the ayat
    let awardedPoints = 15;
    
    // Bonus for actually walking to the location
    if (!selectedWaypoint.isFar) {
       awardedPoints = 50; 
    }

    const newXp = xp + awardedPoints;
    setXp(newXp);
    
    // Simple streak logic: increment for now to show the feature
    const newStreak = streak + 1;
    setStreak(newStreak);

    const newCollectedIds = new Set(collectedIds);
    newCollectedIds.add(selectedWaypoint.ayahKey);
    setCollectedIds(newCollectedIds);

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
          streak: newStreak,
          rank: newRank,
          name: user.displayName || 'Anonymous Seeker',
          collectedIds: Array.from(newCollectedIds)
        });
      }

      // SYNC WITH QURAN FOUNDATION USER API
      if (user.isQuranAuth && user.accessToken) {
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

    setSelectedWaypoint(null);
  };

  if (path === '/terms') {
    return (
      <div className="min-h-screen bg-surface p-8 overflow-y-auto font-body-md text-on-surface">
        <button onClick={() => { window.history.pushState({}, '', '/'); setPath('/'); }} className="mb-6 flex items-center gap-2 text-primary font-bold">
          <span className="material-symbols-outlined">arrow_back</span> BACK
        </button>
        <div className="max-w-2xl mx-auto bg-surface-container p-8 rounded-2xl neubrutalist-border shadow-md">
          <h1 className="text-3xl font-bold mb-6">Santree Go - Terms and Conditions</h1>
          <p><strong>Effective Date:</strong> May 20, 2026</p>
          <h2 className="text-xl font-bold mt-6 mb-2">1. Description of Service</h2>
          <p>Santree Go is an educational platform designed to encourage Quranic engagement through location-based discovery.</p>
          <h2 className="text-xl font-bold mt-6 mb-2">2. Use of Geolocation</h2>
          <p>Santree Go requires access to your device's GPS location to function correctly. This data is used solely to "spawn" Quranic verses in your vicinity.</p>
          <h2 className="text-xl font-bold mt-6 mb-2">3. Quranic Content</h2>
          <p>All Quranic text, translations, and audio are provided via the Quran Foundation API.</p>
          <h2 className="text-xl font-bold mt-6 mb-2">4. User Accounts</h2>
          <p>If you choose to use the "Login with Quran.com" feature, you agree to allow AyahQuest to sync your bookmarks and streaks.</p>
          <h2 className="text-xl font-bold mt-6 mb-2">5. Contact</h2>
          <p>Questions? Contact us at <strong>santreedigitalid@gmail.com</strong></p>
        </div>
      </div>
    );
  }

  if (path === '/privacy') {
    return (
      <div className="min-h-screen bg-surface p-8 overflow-y-auto font-body-md text-on-surface">
        <button onClick={() => { window.history.pushState({}, '', '/'); setPath('/'); }} className="mb-6 flex items-center gap-2 text-primary font-bold">
          <span className="material-symbols-outlined">arrow_back</span> BACK
        </button>
        <div className="max-w-2xl mx-auto bg-surface-container p-8 rounded-2xl neubrutalist-border shadow-md">
          <h1 className="text-3xl font-bold mb-6">Santree Go - Privacy Policy</h1>
          <p><strong>Effective Date:</strong> May 20, 2026</p>
          <h2 className="text-xl font-bold mt-6 mb-2">1. Information We Collect</h2>
          <p>At Santree Go, we access your GPS coordinates to display nearby Quranic verses. We collect basic profile info when you log in.</p>
          <h2 className="text-xl font-bold mt-6 mb-2">2. How We Use Data</h2>
          <p>To personalize your Quranic discovery experience and maintain your streaks.</p>
          <h2 className="text-xl font-bold mt-6 mb-2">3. Data Storage</h2>
          <p>We use Firebase and Quran Foundation API. We do not sell your personal data.</p>
          <h2 className="text-xl font-bold mt-6 mb-2">4. Contact Us</h2>
          <p>Questions? Contact us at <strong>santreedigitalid@gmail.com</strong></p>
        </div>
      </div>
    );
  }

  if (authLoading) return <div className="h-screen w-screen bg-surface flex items-center justify-center text-on-surface font-headline-md font-bold uppercase animate-pulse">GUIDING YOUR PATH...</div>;
  if (!user) return <LoginOverlay onGuestLogin={handleGuestLogin} onQuranLogin={handleQuranLogin} />;

  const handleSimulatedMove = (dLat: number, dLng: number) => {
    setCoords(prev => [prev[0] + dLat, prev[1] + dLng]);
    setLocationStatus('found');
  };

  return (
    <div className="h-screen w-screen relative bg-surface overflow-hidden select-none touch-none bg-pattern">
      <XPHeader xp={xp} rank={rank} streak={streak} />
      
      {locationStatus === 'error' && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1500] w-[90%] max-w-sm bg-error-container neubrutalist-border hard-shadow px-4 py-3 rounded-2xl flex items-start gap-3">
          <div className="text-xl">📍</div>
          <div>
            <h3 className="text-on-error-container font-headline-md font-bold text-sm tracking-tight mb-1">Gagal Menemukan Lokasi</h3>
            <p className="text-on-error-container/80 text-xs mb-2">Pastikan izin GPS (Lokasi) diberikan pada browser Anda. Jika Anda berada di preview AI Studio, coba buka aplikasi di tab baru.</p>
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
              Coba Lagi
            </button>
          </div>
        </div>
      )}

      {locationStatus === 'waiting' && activeTab === 'radar' && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1500] bg-surface neubrutalist-border hard-shadow px-4 py-2 rounded-full text-xs font-label-bold text-on-surface flex items-center gap-2 max-w-[90%]">
          <div className="w-2 h-2 rounded-full bg-primary animate-ping"></div>
          Mencari posisi asli...
        </div>
      )}

      {locationStatus === 'found' && activeTab === 'radar' && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1500] bg-surface-container-high neubrutalist-border hard-shadow px-4 py-2 rounded-full text-[10px] text-on-surface flex items-center gap-2 text-center max-w-[90%]">
          <span className="font-label-bold">ℹ️ Akurasi lokasi di PC/Laptop mungkin kurang tepat. Buka di HP untuk GPS asli.</span>
        </div>
      )}

      {activeTab === 'radar' ? (
        <>
          <SmartRadar 
            userCoords={coords} 
            waypoints={waypoints} 
            collectedIds={collectedIds} 
            onWaypointClick={handleWaypointClick}
          />
          <MovementSimulator onMove={handleSimulatedMove} />
        </>
      ) : activeTab === 'leaderboard' ? (
        <div className="absolute inset-0 z-10 flex flex-col p-6 pt-32 pb-32 overflow-y-auto bg-surface">
          <div className="max-w-xl mx-auto w-full">
            <h2 className="text-3xl font-headline-md font-bold text-on-surface mb-8 uppercase tracking-wide">Spiritual Leaders</h2>
            <div className="space-y-4">
              {leaders.map((lead, i) => (
                <div key={lead.id} className={cn(
                  "bg-surface-variant p-4 rounded-xl flex items-center gap-4 neubrutalist-border hard-shadow hover:-translate-y-1 transition-transform", 
                  lead.isMe && "bg-tertiary-fixed border-on-surface"
                )}>
                  <div className="w-12 h-12 rounded-full bg-surface neubrutalist-border flex items-center justify-center font-headline-md font-bold text-on-surface text-xl">#{i+1}</div>
                  <div className="flex-grow">
                    <div className="text-on-surface font-label-bold uppercase tracking-widest">{lead.name}</div>
                    <div className="text-on-surface-variant text-[10px] font-bold uppercase">{lead.rank}</div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <div className="text-xl font-headline-md font-bold text-on-surface">{lead.xp}</div>
                    <div className="text-[10px] font-label-bold text-on-surface-variant uppercase bg-surface px-2 rounded-full neubrutalist-border mt-1">NUR</div>
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
                <h2 className="text-3xl font-headline-md font-bold text-on-surface uppercase tracking-wide">My Collection</h2>
                <p className="text-on-surface-variant font-label-bold text-[10px] uppercase tracking-widest mt-1">Synced with Quran.com Bookmarks</p>
              </div>
              <div className="hidden sm:block">
                 <span className="material-symbols-outlined text-4xl text-tertiary">cloud_sync</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from(collectedIds).length === 0 && (
                <div className="col-span-1 sm:col-span-2 text-center p-8 bg-surface-variant rounded-xl neubrutalist-border border-dashed text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search</span>
                  <p className="font-label-bold">Belum ada ayat yang ditemukan.</p>
                  <button onClick={() => setActiveTab('radar')} className="mt-4 bg-primary text-on-primary font-label-bold px-6 py-2 rounded-full neubrutalist-border hard-shadow hover:-translate-y-1 transition-transform">Mulai Eksplorasi</button>
                </div>
              )}
              {Array.from(collectedIds).map((id, index) => (
                <div key={id} className="bg-parchment p-5 rounded-xl flex flex-col items-center gap-3 neubrutalist-border hard-shadow hover:-translate-y-1 transition-transform cursor-pointer relative overflow-hidden group">
                  <div className="absolute -top-3 -right-3 w-10 h-10 bg-error-container neubrutalist-border rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <span className="material-symbols-outlined text-error text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>bookmark</span>
                  </div>
                  <span className="material-symbols-outlined text-tertiary text-4xl">auto_stories</span>
                  <div className="text-center">
                    <div className="text-on-surface font-headline-md font-bold text-lg">{id.includes(':') ? `Surah ${id.split(':')[0]} Ayat ${id.split(':')[1]}` : `Ayat #${index + 1}`}</div>
                    <div className="text-on-surface-variant font-label-bold uppercase text-[10px] mt-1 shadow-sm px-2 py-0.5 rounded-full bg-surface-container neubrutalist-border inline-block">Disimpan ke Akun</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-surface overflow-y-auto pb-32">
          <div className="w-32 h-32 rounded-full border-4 border-on-surface bg-surface shadow-[6px_6px_0px_0px_rgba(34,26,20,1)] p-2 mb-6">
            <div className="w-full h-full rounded-full bg-primary-container flex items-center justify-center text-5xl">👦🏻</div>
          </div>
          <h2 className="text-3xl font-headline-md font-bold text-on-surface mb-2">{user?.email?.split('@')[0] || "Explorer"}</h2>
          <div className="bg-tertiary-fixed px-4 py-1 rounded-full neubrutalist-border shadow-[4px_4px_0px_0px_rgba(34,26,20,1)] text-on-surface font-label-bold uppercase tracking-[0.2em] text-xs mb-8">
            {rank}
          </div>
          
          <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-12">
            <div className="bg-surface-container-high p-6 rounded-2xl text-center neubrutalist-border hard-shadow flex flex-col justify-center items-center">
              <span className="material-symbols-outlined text-3xl text-primary mb-2">library_books</span>
              <div className="text-2xl font-headline-md font-bold text-on-surface">{collectedIds.size}</div>
              <div className="text-[10px] font-label-bold text-on-surface-variant uppercase mt-1">Scrolls</div>
            </div>
            <div className="bg-surface-container-high p-6 rounded-2xl text-center neubrutalist-border hard-shadow flex flex-col justify-center items-center">
              <span className="material-symbols-outlined text-3xl text-tertiary mb-2">hotel_class</span>
              <div className="text-2xl font-headline-md font-bold text-on-surface">LV. {Math.floor(xp / 100) + 1}</div>
              <div className="text-[10px] font-label-bold text-on-surface-variant uppercase mt-1">Mastery</div>
            </div>
          </div>
          
          <button 
            onClick={() => {
              playSound('error');
              auth.signOut();
            }}
            className="text-error font-label-bold uppercase tracking-widest flex items-center gap-2 px-6 py-3 rounded-full bg-error-container neubrutalist-border neubrutalist-interaction transition-all"
          >
            <span className="material-symbols-outlined">logout</span>
            Vanish from this Path
          </button>
        </div>
      )}

      <BottomNav active={activeTab} onChange={setActiveTab} />
      
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
  );
}
