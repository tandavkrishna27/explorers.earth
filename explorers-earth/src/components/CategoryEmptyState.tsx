import React from "react";
import { motion } from "framer-motion";
import Button from "./ui/Button";

interface CategoryEmptyStateProps {
  category: string;
  onAddClick: () => void;
}

const CATEGORY_META: Record<string, { label: string; addLabel: string; tagline: string; sub: string }> = {
  places: {
    label: "Places List",
    addLabel: "+ Add Places List",
    tagline: "Map your world",
    sub: "Pin the places that shaped you. Build curated lists of destinations, spots & hidden gems you love.",
  },
  movies: {
    label: "Movies List",
    addLabel: "+ Add Movies List",
    tagline: "Your personal cinema",
    sub: "Curate the films that moved you. Share your watch-lists, favorites and guilty pleasures with the world.",
  },
  books: {
    label: "Books List",
    addLabel: "+ Add Books List",
    tagline: "Build your library",
    sub: "Collect the reads that changed your thinking. Share curated lists on any genre or theme.",
  },
  games: {
    label: "Games List",
    addLabel: "+ Add Games List",
    tagline: "Level up your lists",
    sub: "From indie gems to AAA epics — curate your game recommendations and share them with fellow players.",
  },
  music: {
    label: "Music Playlist",
    addLabel: "+ Add Music List",
    tagline: "Set the soundtrack",
    sub: "Share the songs, albums and artists that define your taste. Build playlists for every mood.",
  },
  guides: {
    label: "Guide",
    addLabel: "+ Add Guide",
    tagline: "Write the itinerary",
    sub: "Craft travel guides and day-by-day itineraries. Help others explore the world the way you did.",
  },
  apps: {
    label: "Apps List",
    addLabel: "+ Add Apps & Tools List",
    tagline: "Your stack, curated",
    sub: "Share the apps and tools you actually use. Build your digital toolkit for others to discover.",
  },
  products: {
    label: "Products List",
    addLabel: "+ Add Products List",
    tagline: "Showcase your picks",
    sub: "Recommend the products worth buying. From gear to gadgets — curate lists your followers will love.",
  },
  people: {
    label: "Persons List",
    addLabel: "+ Add People List",
    tagline: "Celebrate great minds",
    sub: "Compile lists of thinkers, creators and leaders worth following. Share your inspirations.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PLACES — 7 well-spaced real cities; projected into a tight viewBox
// so the cluster is centered in the visible area with no overlap.
// Raw Mercator coords (lon+180)*(1000/360), (90-lat)*(500/180)
// then the SVG viewBox is cropped to [50,60,900,360] which frames exactly
// the bounding box of all 7 points with generous padding.
// ─────────────────────────────────────────────────────────────────────────────
const CITIES = [
  { name: "New York",  lon: -74.0,  lat:  40.7,  color: "#38bdf8" },
  { name: "London",    lon:  -0.1,  lat:  51.5,  color: "#818cf8" },
  { name: "Dubai",     lon:  55.3,  lat:  25.2,  color: "#fbbf24" },
  { name: "Tokyo",     lon: 139.7,  lat:  35.7,  color: "#34d399" },
  { name: "Sydney",    lon: 151.2,  lat: -33.9,  color: "#fb7185" },
  { name: "São Paulo", lon: -46.6,  lat: -23.5,  color: "#f97316" },
  { name: "Nairobi",   lon:  36.8,  lat:  -1.3,  color: "#a78bfa" },
];

// Project into a 1000×500 logical canvas
const project = (lon: number, lat: number): [number, number] => [
  (lon + 180) * (1000 / 360),
  (90 - lat)  * (500  / 180),
];

const arcPath = (
  x1: number, y1: number,
  x2: number, y2: number
): string => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 45;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
};

// Connections between the 7 cities (indices)
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 6], [6, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 2], [6, 5],
];

const PlacesIllustration = () => {
  // Compute projected points
  const pts = CITIES.map(c => project(c.lon, c.lat));

  // Compute bounding box of points and derive a padded viewBox
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 60;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = (maxX - minX) + pad * 2;
  const vbH = (maxY - minY) + pad * 2;
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-[#050d1a] border border-cyan-900/30" style={{ height: 220 }}>
      {/* Subtle grid — uses same derived viewBox so it scales with the map */}
      <svg className="absolute inset-0 w-full h-full opacity-20" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="pg" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(56,189,248,0.15)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#pg)" />
      </svg>

      {/* Atmosphere glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,rgba(6,182,212,0.08)_0%,transparent_70%)]" />

      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        fill="none"
      >
        <defs>
          <linearGradient id="arcG1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#38bdf8" stopOpacity="0"/>
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.65"/>
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0"/>
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Arc connections */}
        {CONNECTIONS.map(([a, b], i) => {
          const [x1, y1] = pts[a];
          const [x2, y2] = pts[b];
          return (
            <motion.path
              key={i}
              d={arcPath(x1, y1, x2, y2)}
              stroke="url(#arcG1)"
              strokeWidth="1.2"
              strokeDasharray="6 5"
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: -44 }}
              transition={{ repeat: Infinity, ease: "linear", duration: 4 + i * 0.4 }}
            />
          );
        })}

        {/* City nodes */}
        {CITIES.map((city, i) => {
          const [cx, cy] = pts[i];
          return (
            <motion.g key={city.name} filter="url(#glow)">
              {/* Ripple */}
              <motion.circle
                cx={cx} cy={cy} r={14}
                stroke={city.color} strokeWidth="1" fill="none"
                initial={{ r: 10, opacity: 0.6 }}
                animate={{ r: [10, 22], opacity: [0.6, 0] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: "easeOut", delay: i * 0.28 }}
              />
              {/* Ring */}
              <circle cx={cx} cy={cy} r={6.5} fill={city.color} fillOpacity={0.15} stroke={city.color} strokeWidth="1" strokeOpacity={0.5} />
              {/* Core */}
              <circle cx={cx} cy={cy} r={3} fill={city.color} />
              {/* Label */}
              <text x={cx + 10} y={cy + 4} fontSize="10" fill={city.color} fillOpacity={0.85}
                fontFamily="'Inter', sans-serif" fontWeight="600">
                {city.name}
              </text>
            </motion.g>
          );
        })}

        {/* Animated flight dots */}
        {CONNECTIONS.slice(0, 5).map(([a, b], i) => {
          const [x1, y1] = pts[a];
          const [x2, y2] = pts[b];
          const d = arcPath(x1, y1, x2, y2);
          return (
            <motion.circle key={"dot" + i} r={2.5} fill="#fff" fillOpacity={0.85}>
              <animateMotion path={d} dur={`${3.5 + i * 0.55}s`} repeatCount="indefinite" calcMode="linear"/>
            </motion.circle>
          );
        })}
      </svg>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#050d1a] to-transparent" />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MOVIES — Film projector with light beam, frames & floating posters
// ─────────────────────────────────────────────────────────────────────────────
const MoviesIllustration = () => (
  <div className="relative w-full overflow-hidden rounded-2xl bg-[#0c0a1a] border border-purple-900/30" style={{ aspectRatio: "2/1", minHeight: 180 }}>
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_20%_50%,rgba(139,92,246,0.12)_0%,transparent_70%)]" />
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" fill="none">
      <defs>
        <linearGradient id="beam" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
        </linearGradient>
        <radialGradient id="projGlow" cx="20%" cy="50%" r="30%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
        </radialGradient>
        <filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>
        <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>

      {/* Projector beam */}
      <motion.polygon
        points="90,180 90,220 680,320 680,80"
        fill="url(#beam)"
        animate={{ opacity: [0.3, 0.55, 0.3] }}
        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
      />
      {/* Dust particles in beam */}
      {[...Array(12)].map((_, i) => (
        <motion.circle
          key={i} r={1.2}
          cx={100 + i * 50} cy={150 + (i % 3) * 40}
          fill="white" fillOpacity={0.25}
          animate={{ y: [-8, 8, -8], x: [-4, 4, -4], opacity: [0.1, 0.35, 0.1] }}
          transition={{ repeat: Infinity, duration: 2.5 + i * 0.2, ease: "easeInOut", delay: i * 0.15 }}
        />
      ))}

      {/* Projector body */}
      <rect x="30" y="155" width="80" height="50" rx="8" fill="#1e1b4b" stroke="#7c3aed" strokeWidth="1.5"/>
      <rect x="105" y="165" width="20" height="30" rx="4" fill="#312e81" stroke="#7c3aed" strokeWidth="1"/>
      <circle cx="70" cy="180" r="16" fill="#2e1065" stroke="#a855f7" strokeWidth="1.5"/>
      <motion.circle cx="70" cy="180" r="10" fill="#7c3aed"
        animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}/>
      <circle cx="70" cy="180" r="4" fill="#e9d5ff"/>
      {/* Lens gleam */}
      <motion.circle cx="64" cy="174" r="3" fill="white" fillOpacity={0.4}
        animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ repeat: Infinity, duration: 2 }}/>

      {/* Film strip */}
      <rect x="30" y="195" width="80" height="14" rx="2" fill="#312e81" stroke="#6d28d9" strokeWidth="0.5"/>
      {[0,1,2,3,4].map(i => (
        <rect key={i} x={36 + i * 14} y="198" width="8" height="8" rx="1" fill="#1e1b4b" stroke="#7c3aed" strokeWidth="0.5"/>
      ))}

      {/* Screen / movie poster cards */}
      {[
        { x: 280, y: 80,  w: 110, h: 150, color: "#7c3aed" },
        { x: 420, y: 60,  w: 130, h: 175, color: "#6366f1" },
        { x: 580, y: 85,  w: 110, h: 145, color: "#a855f7" },
      ].map((p, i) => (
        <motion.g key={i}
          style={{ transformOrigin: `${p.x + p.w / 2}px ${p.y + p.h / 2}px` }}
          animate={{ y: [-5, 5, -5] }}
          transition={{ repeat: Infinity, duration: 3 + i * 0.5, ease: "easeInOut", delay: i * 0.4 }}
        >
          {/* Card — no visible border/stroke */}
          <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="6" fill="#0f0d1f" stroke="none"/>
          {/* Poster art area — no outlines at all */}
          <rect x={p.x + 8} y={p.y + 8} width={p.w - 16} height={p.h * 0.55} rx="4" fill={p.color} fillOpacity={0.14}/>
          {/* Meta lines */}
          <rect x={p.x + 8} y={p.y + p.h * 0.72} width={p.w * 0.6} height="6" rx="3" fill="white" fillOpacity={0.07}/>
          <rect x={p.x + 8} y={p.y + p.h * 0.82} width={p.w * 0.4} height="5" rx="2" fill="white" fillOpacity={0.04}/>
        </motion.g>
      ))}
    </svg>
    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0c0a1a] to-transparent"/>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// BOOKS — Dramatic open tome with radiating golden light & floating pages
// ─────────────────────────────────────────────────────────────────────────────
const BooksIllustration = () => (
  <div className="relative w-full overflow-hidden rounded-2xl bg-[#0d0a00] border border-amber-900/30" style={{ aspectRatio: "2/1", minHeight: 180 }}>
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_70%,rgba(251,191,36,0.12)_0%,transparent_70%)]"/>
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" fill="none">
      <defs>
        <radialGradient id="bookGlow" cx="50%" cy="75%" r="40%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
        <linearGradient id="pageL" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7"/>
          <stop offset="100%" stopColor="#d97706"/>
        </linearGradient>
        <linearGradient id="pageR" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7"/>
          <stop offset="100%" stopColor="#d97706"/>
        </linearGradient>
      </defs>

      {/* Halo light */}
      <ellipse cx="400" cy="310" rx="200" ry="30" fill="url(#bookGlow)"/>

      {/* Open book — left page */}
      <motion.path
        d="M 400 320 C 370 310 280 295 200 305 C 200 305 200 180 200 165 C 280 155 370 170 400 185 Z"
        fill="#1c1400" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity={0.6}
      />
      {/* Text lines left */}
      {[0,1,2,3,4,5,6].map(i => (
        <line key={i} x1={220} y1={200 + i * 15} x2={370 - (i % 3) * 20} y2={200 + i * 15}
          stroke="#fbbf24" strokeOpacity={0.12} strokeWidth="1.5"/>
      ))}
      {/* Drop cap */}
      <text x="220" y="222" fontSize="32" fill="#f59e0b" fillOpacity={0.4} fontWeight="bold" fontFamily="Georgia">T</text>

      {/* Open book — right page */}
      <motion.path
        d="M 400 320 C 430 310 520 295 600 305 C 600 305 600 180 600 165 C 520 155 430 170 400 185 Z"
        fill="#1c1400" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity={0.6}
      />
      {[0,1,2,3,4,5,6].map(i => (
        <line key={i} x1={430 + (i % 3) * 15} y1={200 + i * 15} x2={580} y2={200 + i * 15}
          stroke="#fbbf24" strokeOpacity={0.12} strokeWidth="1.5"/>
      ))}

      {/* Spine shadow */}
      <line x1="400" y1="185" x2="400" y2="320" stroke="#fbbf24" strokeWidth="3" strokeOpacity={0.3}/>

      {/* Floating torn pages */}
      {[
        { x: 260, y: 130, rot: -18, delay: 0 },
        { x: 380, y: 90,  rot: 5,   delay: 0.6 },
        { x: 490, y: 115, rot: 14,  delay: 1.1 },
        { x: 610, y: 140, rot: -6,  delay: 0.3 },
      ].map((pg, i) => (
        <motion.g key={i}
          style={{ transformOrigin: `${pg.x}px ${pg.y}px` }}
          animate={{ y: [-12, 12, -12], rotate: [pg.rot - 4, pg.rot + 4, pg.rot - 4] }}
          transition={{ repeat: Infinity, duration: 4 + i * 0.5, ease: "easeInOut", delay: pg.delay }}
        >
          <rect x={pg.x - 20} y={pg.y - 28} width="40" height="56" rx="3"
            fill="#1c1400" stroke="#f59e0b" strokeWidth="1" strokeOpacity={0.4}/>
          {[0,1,2].map(l => (
            <line key={l} x1={pg.x - 13} y1={pg.y - 14 + l * 10} x2={pg.x + 13} y2={pg.y - 14 + l * 10}
              stroke="#fbbf24" strokeOpacity={0.2} strokeWidth="1"/>
          ))}
        </motion.g>
      ))}

      {/* Floating sparkles */}
      {[
        { cx: 320, cy: 120, r: 3, delay: 0 },
        { cx: 480, cy: 100, r: 2, delay: 0.8 },
        { cx: 400, cy: 80,  r: 4, delay: 0.4 },
        { cx: 560, cy: 130, r: 2.5, delay: 1.2 },
      ].map((s, i) => (
        <motion.circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#fbbf24"
          animate={{ y: [0, -30], opacity: [0, 0.9, 0], scale: [0.5, 1.4, 0.5] }}
          transition={{ repeat: Infinity, duration: 2.5 + i * 0.3, ease: "easeOut", delay: s.delay }}
        />
      ))}
    </svg>
    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0d0a00] to-transparent"/>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// GAMES — Neon cyberpunk HUD with controller, health bar & XP elements
// ─────────────────────────────────────────────────────────────────────────────
const GamesIllustration = () => (
  <div className="relative w-full overflow-hidden rounded-2xl bg-[#080010] border border-pink-900/30" style={{ aspectRatio: "2/1", minHeight: 180 }}>
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(236,72,153,0.08)_0%,transparent_70%)]"/>
    {/* Scanlines */}
    <div className="absolute inset-0 opacity-10"
      style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 4px)" }}/>
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" fill="none">
      <defs>
        <linearGradient id="neonPink" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f43f5e"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <linearGradient id="neonCyan" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4"/>
          <stop offset="100%" stopColor="#6366f1"/>
        </linearGradient>
        <filter id="neonBlur"><feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Retro grid floor */}
      {[0,1,2,3,4,5].map(i => (
        <line key={"v" + i} x1={i * 160} y1={400} x2={400} y2={260} stroke="#ec4899" strokeOpacity={0.06} strokeWidth="1"/>
      ))}
      {[270,300,330,360,390].map((y, i) => {
        const t = (y - 260) / 140;
        return <line key={"h" + i} x1={400 - t * 400} y1={y} x2={400 + t * 400} y2={y} stroke="#ec4899" strokeOpacity={0.06} strokeWidth="1"/>;
      })}

      {/* HUD top bar */}
      <rect x="40" y="30" width="180" height="28" rx="4" fill="#0d0020" stroke="#f43f5e" strokeWidth="1" strokeOpacity={0.5}/>
      <text x="54" y="49" fontSize="11" fill="#f43f5e" fontFamily="monospace" fontWeight="bold">HP</text>
      <motion.rect x="78" y="37" height="14" rx="3" fill="url(#neonPink)"
        initial={{ width: 80 }}
        animate={{ width: [80, 90, 70, 85, 80] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
      />
      <rect x="78" y="37" width="102" height="14" rx="3" stroke="#f43f5e" strokeWidth="0.5" strokeOpacity={0.4} fill="none"/>

      <rect x="580" y="30" width="180" height="28" rx="4" fill="#0d0020" stroke="#06b6d4" strokeWidth="1" strokeOpacity={0.5}/>
      <text x="594" y="49" fontSize="11" fill="#06b6d4" fontFamily="monospace" fontWeight="bold">XP</text>
      <motion.rect x="618" y="37" height="14" rx="3" fill="url(#neonCyan)"
        initial={{ width: 60 }}
        animate={{ width: [60, 110, 75, 95, 60] }}
        transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
      />
      <rect x="618" y="37" width="102" height="14" rx="3" stroke="#06b6d4" strokeWidth="0.5" strokeOpacity={0.4} fill="none"/>

      {/* Score */}
      <text x="320" y="50" fontSize="20" fill="white" fillOpacity={0.8} fontFamily="monospace" fontWeight="bold" textAnchor="middle">00 : 00</text>
      <text x="480" y="50" fontSize="20" fill="white" fillOpacity={0.8} fontFamily="monospace" fontWeight="bold" textAnchor="middle">LVL 1</text>

      {/* Controller */}
      <motion.g style={{ transformOrigin: "400px 200px" }}
        animate={{ y: [-6, 6, -6] }}
        transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
        filter="url(#neonBlur)"
      >
        {/* Body */}
        <path d="M 270 175 C 260 145 280 125 310 120 L 490 120 C 520 125 540 145 530 175 L 510 240 C 500 265 470 275 450 265 L 400 255 L 350 265 C 330 275 300 265 290 240 Z"
          fill="#0d0020" stroke="url(#neonPink)" strokeWidth="2"/>

        {/* D-Pad */}
        <rect x="295" y="165" width="50" height="18" rx="4" fill="#1a0030" stroke="#f43f5e" strokeWidth="1"/>
        <rect x="310" y="150" width="18" height="50" rx="4" fill="#1a0030" stroke="#f43f5e" strokeWidth="1"/>
        <circle cx="320" cy="190" r="6" fill="#f43f5e" fillOpacity={0.7}/>

        {/* Joysticks */}
        <circle cx="355" cy="215" r="22" fill="#100020" stroke="#a855f7" strokeWidth="1.5"/>
        <motion.circle cx="355" cy="215" r="12" fill="#1a0035" stroke="#c084fc" strokeWidth="1"
          initial={{ cx: 355, cy: 215 }}
          animate={{ cx: [355, 350, 360, 355], cy: [215, 210, 220, 215] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
        />
        <circle cx="445" cy="215" r="22" fill="#100020" stroke="#a855f7" strokeWidth="1.5"/>
        <circle cx="445" cy="215" r="12" fill="#1a0035" stroke="#c084fc" strokeWidth="1"/>

        {/* Action buttons */}
        {[
          { cx: 468, cy: 162, color: "#f43f5e", label: "○" },
          { cx: 490, cy: 178, color: "#fbbf24", label: "△" },
          { cx: 446, cy: 178, color: "#06b6d4", label: "□" },
          { cx: 468, cy: 194, color: "#4ade80", label: "✕" },
        ].map((b, i) => (
          <g key={i}>
            <circle cx={b.cx} cy={b.cy} r="12" fill={b.color} fillOpacity={0.15} stroke={b.color} strokeWidth="1.5"/>
            <text x={b.cx} y={b.cy + 4} textAnchor="middle" fontSize="10" fill={b.color} fontWeight="bold">{b.label}</text>
          </g>
        ))}

        {/* LED */}
        <motion.circle cx="400" cy="135" r="4" fill="white"
          animate={{ fill: ["#f43f5e","#a855f7","#06b6d4","#f43f5e"] }}
          transition={{ repeat: Infinity, duration: 2 }}/>
      </motion.g>
    </svg>
    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#080010] to-transparent"/>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MUSIC — Studio waveform + vinyl record + frequency spectrum
// ─────────────────────────────────────────────────────────────────────────────
const MusicIllustration = () => {
  const bars = [28,44,62,38,72,55,80,48,66,35,58,74,42,60,50,68,38,78,52,64,40,70,56,46,82,34,60,76,44,58];
  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-[#04000f] border border-fuchsia-900/30" style={{ aspectRatio: "2/1", minHeight: 180 }}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(217,70,239,0.1)_0%,transparent_70%)]"/>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" fill="none">
        <defs>
          <linearGradient id="waveG" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e879f9"/>
            <stop offset="50%" stopColor="#a855f7"/>
            <stop offset="100%" stopColor="#6366f1"/>
          </linearGradient>
          <linearGradient id="specG" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f0abfc"/>
            <stop offset="100%" stopColor="#7e22ce"/>
          </linearGradient>
          <filter id="glow2"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {/* Spectrum analyser bars */}
        <g filter="url(#glow2)">
          {bars.map((h, i) => (
            <motion.rect
              key={i}
              x={100 + i * 20} y={300 - h}
              width="12" rx="3"
              fill="url(#waveG)"
              animate={{ height: [h, h * 0.4 + Math.random() * 60, h] }}
              transition={{ repeat: Infinity, duration: 0.8 + (i % 5) * 0.15, ease: "easeInOut", delay: i * 0.03 }}
            />
          ))}
        </g>

        {/* Waveform line */}
        <motion.path
          d={`M 100 200 ${bars.map((h, i) => `Q ${108 + i * 20} ${200 - h * 0.6} ${120 + i * 20} 200`).join(" ")}`}
          stroke="url(#waveG)" strokeWidth="2" fill="none" strokeOpacity={0.5}
          animate={{ strokeOpacity: [0.3, 0.7, 0.3] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />

        {/* Vinyl Record */}
        <motion.g style={{ transformOrigin: "400px 200px" }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
        >
          {/* Outer ring */}
          <circle cx="400" cy="200" r="85" fill="#0a000f" stroke="#7c3aed" strokeWidth="1.5"/>
          {[60,45,30].map((r, i) => (
            <circle key={i} cx="400" cy="200" r={r} stroke="#7c3aed" strokeWidth="0.5" strokeOpacity={0.3}/>
          ))}
          {/* Groove arcs */}
          {[72,66,60,54,48,42,36].map((r, i) => (
            <circle key={"g"+i} cx="400" cy="200" r={r} stroke="#a855f7" strokeWidth="0.5" strokeOpacity={0.15}/>
          ))}
          {/* Label */}
          <circle cx="400" cy="200" r="24" fill="#3b0764"/>
          <circle cx="400" cy="200" r="4" fill="#e9d5ff"/>
          {/* Shine */}
          <path d="M 370 170 A 40 40 0 0 1 415 162" stroke="white" strokeWidth="2" strokeOpacity={0.12} strokeLinecap="round"/>
        </motion.g>

        {/* Needle arm */}
        <motion.line x1="450" y1="140" x2="412" y2="192" stroke="#f0abfc" strokeWidth="2" strokeLinecap="round"
          animate={{ rotate: [-5, 5, -5] }}
          style={{ transformOrigin: "450px 140px" }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        />
        <circle cx="450" cy="138" r="6" fill="#1a0030" stroke="#f0abfc" strokeWidth="1.5"/>

        {/* Floating notes */}
        {[
          { x: 560, y: 170, delay: 0 },
          { x: 230, y: 150, delay: 0.9 },
          { x: 620, y: 120, delay: 1.6 },
        ].map((n, i) => (
          <motion.g key={i}
            animate={{ y: [n.y, n.y - 60], opacity: [0, 0.9, 0] }}
            transition={{ repeat: Infinity, duration: 2.5 + i * 0.4, ease: "easeOut", delay: n.delay }}
          >
            <circle cx={n.x} cy={0} r="5" fill="#e879f9"/>
            <line x1={n.x + 5} y1={0} x2={n.x + 5} y2={-20} stroke="#e879f9" strokeWidth="2"/>
            <line x1={n.x + 5} y1={-20} x2={n.x + 18} y2={-15} stroke="#e879f9" strokeWidth="2"/>
          </motion.g>
        ))}
      </svg>
      <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-[#04000f] to-transparent"/>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// GUIDES — Topographic adventure map with compass, trail & route markers
// ─────────────────────────────────────────────────────────────────────────────
const GuidesIllustration = () => (
  <div className="relative w-full overflow-hidden rounded-2xl bg-[#001a0d] border border-emerald-900/30" style={{ aspectRatio: "2/1", minHeight: 180 }}>
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_60%,rgba(16,185,129,0.1)_0%,transparent_70%)]"/>
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" fill="none">
      <defs>
        <linearGradient id="trailG" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0"/>
          <stop offset="40%" stopColor="#34d399" stopOpacity="0.8"/>
          <stop offset="100%" stopColor="#059669" stopOpacity="0"/>
        </linearGradient>
        <filter id="glow3"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>

      {/* Topographic contour lines */}
      {[
        "M 0 320 C 80 300 160 340 240 310 T 480 320 T 720 300 T 800 320",
        "M 0 280 C 100 255 200 295 300 265 T 540 280 T 760 255 T 800 270",
        "M 0 240 C 120 210 230 255 350 220 T 600 240 T 800 215",
        "M 50 190 C 170 160 290 210 420 175 T 680 190",
        "M 100 140 C 220 108 360 160 490 125 T 720 140",
      ].map((d, i) => (
        <path key={i} d={d} stroke="#10b981" strokeWidth="1" strokeOpacity={0.1 + i * 0.02}/>
      ))}

      {/* Mountain silhouettes */}
      <path d="M 80 380 L 180 220 L 280 380 Z" fill="#052e16" stroke="#059669" strokeWidth="1" strokeOpacity={0.3}/>
      <path d="M 160 380 L 270 180 L 380 380 Z" fill="#063320" stroke="#059669" strokeWidth="1" strokeOpacity={0.4}/>
      <path d="M 240 380 L 340 240 L 440 380 Z" fill="#052e16" stroke="#059669" strokeWidth="1" strokeOpacity={0.3}/>
      {/* Snow caps */}
      <path d="M 270 180 L 245 225 L 295 225 Z" fill="#f0fdf4" fillOpacity={0.3}/>
      <path d="M 180 220 L 162 250 L 198 250 Z" fill="#f0fdf4" fillOpacity={0.25}/>

      {/* Trail path */}
      <motion.path
        d="M 100 350 C 180 330 220 280 290 260 C 360 240 400 250 460 220 C 520 190 560 180 620 165 C 660 155 700 150 730 145"
        stroke="url(#trailG)" strokeWidth="3" strokeDasharray="10 6"
        filter="url(#glow3)"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -64 }}
        transition={{ repeat: Infinity, ease: "linear", duration: 5 }}
      />

      {/* Waypoint markers */}
      {[
        { cx: 290, cy: 260, label: "A", delay: 0 },
        { cx: 460, cy: 220, label: "B", delay: 0.4 },
        { cx: 620, cy: 165, label: "C", delay: 0.8 },
      ].map((m, i) => (
        <motion.g key={i}
          animate={{ y: [-3, 3, -3] }}
          transition={{ repeat: Infinity, duration: 2.5 + i * 0.4, ease: "easeInOut", delay: m.delay }}
        >
          <circle cx={m.cx} cy={m.cy} r="14" fill="#052e16" stroke="#34d399" strokeWidth="1.5"/>
          <text x={m.cx} y={m.cy + 5} textAnchor="middle" fontSize="11" fill="#34d399" fontWeight="bold" fontFamily="monospace">{m.label}</text>
          <motion.circle cx={m.cx} cy={m.cy} r="20" stroke="#34d399" strokeWidth="1" fill="none"
            initial={{ r: 14, opacity: 0.5 }}
            animate={{ r: [14, 26], opacity: [0.5, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeOut", delay: m.delay }}
          />
        </motion.g>
      ))}

      {/* Compass */}
      <motion.g style={{ transformOrigin: "660px 280px" }}
        animate={{ rotate: [0, 8, -8, 0] }}
        transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
      >
        <circle cx="660" cy="280" r="50" fill="#011a0a" stroke="#10b981" strokeWidth="1.5"/>
        <circle cx="660" cy="280" r="42" stroke="#10b981" strokeWidth="0.5" strokeOpacity={0.3}/>
        {/* Cardinal ticks */}
        {[0,45,90,135,180,225,270,315].map(a => {
          const rad = (a * Math.PI) / 180;
          return <line key={a} x1={660 + 34 * Math.sin(rad)} y1={280 - 34 * Math.cos(rad)}
            x2={660 + 42 * Math.sin(rad)} y2={280 - 42 * Math.cos(rad)}
            stroke="#10b981" strokeWidth={a % 90 === 0 ? 2 : 0.8} strokeOpacity={0.6}/>;
        })}
        {/* N/S/E/W */}
        <text x="660" y="244" textAnchor="middle" fontSize="10" fill="#34d399" fontWeight="bold" fontFamily="monospace">N</text>
        <text x="660" y="324" textAnchor="middle" fontSize="10" fill="#6b7280" fontWeight="bold" fontFamily="monospace">S</text>
        <text x="706" y="284" textAnchor="middle" fontSize="10" fill="#6b7280" fontWeight="bold" fontFamily="monospace">E</text>
        <text x="614" y="284" textAnchor="middle" fontSize="10" fill="#6b7280" fontWeight="bold" fontFamily="monospace">W</text>
        {/* Needle */}
        <polygon points="660,255 655,280 660,275 665,280" fill="#34d399"/>
        <polygon points="660,305 655,280 660,285 665,280" fill="#374151"/>
        <circle cx="660" cy="280" r="4" fill="#f0fdf4"/>
      </motion.g>
    </svg>
    <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-[#001a0d] to-transparent"/>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// APPS — Circuit board aesthetic with node graph and terminal
// ─────────────────────────────────────────────────────────────────────────────
const AppsIllustration = () => {
  const nodes = [
    { x: 200, y: 200, r: 20, color: "#2dd4bf", label: "API" },
    { x: 350, y: 140, r: 16, color: "#38bdf8", label: "UI" },
    { x: 500, y: 200, r: 18, color: "#818cf8", label: "DB" },
    { x: 350, y: 260, r: 14, color: "#34d399", label: "Auth" },
    { x: 130, y: 140, r: 12, color: "#fbbf24", label: "CDN" },
    { x: 130, y: 265, r: 12, color: "#f97316", label: "DNS" },
    { x: 580, y: 140, r: 12, color: "#c084fc", label: "CI" },
    { x: 580, y: 265, r: 12, color: "#f472b6", label: "Log" },
  ];
  const edges = [[0,1],[0,3],[1,2],[2,3],[0,4],[0,5],[2,6],[2,7]];

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-[#000d0f] border border-teal-900/30" style={{ aspectRatio: "2/1", minHeight: 180 }}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(45,212,191,0.08)_0%,transparent_70%)]"/>
      {/* Circuit pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(rgba(45,212,191,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.5) 1px, transparent 1px)", backgroundSize: "30px 30px" }}/>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" fill="none">
        <defs>
          <filter id="nodeGlow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {/* Edges with animated pulses */}
        {edges.map(([a, b], i) => {
          const n1 = nodes[a], n2 = nodes[b];
          return (
            <g key={i}>
              <line x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke="#2dd4bf" strokeWidth="1" strokeOpacity={0.15}/>
              <motion.circle r="3" fill="#2dd4bf" fillOpacity={0.8}
                initial={{ cx: n1.x, cy: n1.y, opacity: 0 }}
                animate={{ cx: [n1.x, n2.x], cy: [n1.y, n2.y], opacity: [0, 0.8, 0] }}
                transition={{ repeat: Infinity, duration: 2 + i * 0.4, ease: "easeInOut", delay: i * 0.3 }}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n, i) => (
          <motion.g key={i} filter="url(#nodeGlow)"
            animate={{ y: [-2, 2, -2] }}
            transition={{ repeat: Infinity, duration: 3 + i * 0.3, ease: "easeInOut", delay: i * 0.2 }}
          >
            <circle cx={n.x} cy={n.y} r={n.r + 6} fill={n.color} fillOpacity={0.08} stroke={n.color} strokeWidth="1" strokeOpacity={0.3}/>
            <circle cx={n.x} cy={n.y} r={n.r} fill="#000d0f" stroke={n.color} strokeWidth="1.5"/>
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={n.r * 0.65} fill={n.color} fontFamily="monospace" fontWeight="bold">{n.label}</text>
          </motion.g>
        ))}

        {/* Terminal window */}
        <g>
          <rect x="300" y="310" width="200" height="70" rx="6" fill="#000d0f" stroke="#2dd4bf" strokeWidth="1" strokeOpacity={0.4}/>
          <rect x="300" y="310" width="200" height="18" rx="4" fill="#0a1a1c"/>
          <circle cx="312" cy="319" r="4" fill="#f43f5e" fillOpacity={0.7}/>
          <circle cx="324" cy="319" r="4" fill="#fbbf24" fillOpacity={0.7}/>
          <circle cx="336" cy="319" r="4" fill="#4ade80" fillOpacity={0.7}/>
          <text x="312" y="344" fontSize="10" fill="#2dd4bf" fontFamily="monospace">$ npm install</text>
          <text x="312" y="358" fontSize="10" fill="#34d399" fontFamily="monospace">✓ 42 packages</text>
          <motion.rect x="312" y="360" width="6" height="10" fill="#2dd4bf"
            animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 1 }}/>
        </g>
      </svg>
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#000d0f] to-transparent"/>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTS — Floating product cards with spotlight + badge system
// ─────────────────────────────────────────────────────────────────────────────
const ProductsIllustration = () => (
  <div className="relative w-full overflow-hidden rounded-2xl bg-[#0a0800] border border-amber-900/30" style={{ aspectRatio: "2/1", minHeight: 180 }}>
    {/* Spotlight */}
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-48 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.12)_0%,transparent_70%)]"/>
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" fill="none">
      <defs>
        <linearGradient id="cardG1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a1400"/>
          <stop offset="100%" stopColor="#0a0800"/>
        </linearGradient>
        <filter id="cardShadow">
          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#fbbf24" floodOpacity="0.12"/>
        </filter>
      </defs>

      {/* Product cards */}
      {[
        { x: 100, y: 80,  w: 160, h: 200, accentH: 120, name: "AirPods Pro",  price: "$249", badge: "Best Seller", accent: "#fbbf24", delay: 0 },
        { x: 320, y: 40,  w: 160, h: 220, accentH: 140, name: "Apple Watch", price: "$399", badge: "Editor Pick", accent: "#38bdf8", delay: 0.3 },
        { x: 540, y: 80,  w: 160, h: 200, accentH: 120, name: "MX Master 3", price: "$99",  badge: "Top Rated",   accent: "#c084fc", delay: 0.6 },
      ].map((c, i) => (
        <motion.g key={i} filter="url(#cardShadow)"
          animate={{ y: [-8, 8, -8] }}
          transition={{ repeat: Infinity, duration: 4 + i * 0.5, ease: "easeInOut", delay: c.delay }}
        >
          <rect x={c.x} y={c.y} width={c.w} height={c.h} rx="12"
            fill="url(#cardG1)" stroke={c.accent} strokeWidth="1" strokeOpacity={0.3}/>
          {/* Image area */}
          <rect x={c.x + 10} y={c.y + 10} width={c.w - 20} height={c.accentH} rx="8" fill={c.accent} fillOpacity={0.06}/>
          {/* Icon placeholder */}
          <circle cx={c.x + c.w / 2} cy={c.y + 10 + c.accentH / 2} r="30" fill={c.accent} fillOpacity={0.08} stroke={c.accent} strokeWidth="1" strokeOpacity={0.2}/>
          <text x={c.x + c.w / 2} y={c.y + 10 + c.accentH / 2 + 8} textAnchor="middle" fontSize="24" fill={c.accent} fillOpacity={0.5}>
            {i === 0 ? "◉" : i === 1 ? "⬡" : "◈"}
          </text>
          {/* Badge */}
          <rect x={c.x + 8} y={c.y + c.accentH + 18} width={c.w - 16} height="18" rx="9" fill={c.accent} fillOpacity={0.15}/>
          <text x={c.x + c.w / 2} y={c.y + c.accentH + 31} textAnchor="middle" fontSize="9" fill={c.accent} fontFamily="'Inter', sans-serif" fontWeight="bold">{c.badge}</text>
          {/* Name */}
          <text x={c.x + c.w / 2} y={c.y + c.accentH + 52} textAnchor="middle" fontSize="12" fill="white" fillOpacity={0.8} fontFamily="'Inter', sans-serif" fontWeight="600">{c.name}</text>
          {/* Price */}
          <text x={c.x + c.w / 2} y={c.y + c.accentH + 70} textAnchor="middle" fontSize="14" fill={c.accent} fontFamily="'Inter', sans-serif" fontWeight="bold">{c.price}</text>
          {/* No star ratings */}
        </motion.g>
      ))}
    </svg>
    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0a0800] to-transparent"/>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// PEOPLE — Orbital network diagram with avatar rings
// ─────────────────────────────────────────────────────────────────────────────
const PeopleIllustration = () => {
  const orbitals = [
    { r: 90,  count: 5, color: "#f97316", speed: 14 },
    { r: 140, count: 8, color: "#ec4899", speed: 22 },
    { r: 185, count: 11, color: "#a78bfa", speed: 32 },
  ];
  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-[#080005] border border-rose-900/30" style={{ aspectRatio: "2/1", minHeight: 180 }}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(249,115,22,0.08)_0%,transparent_70%)]"/>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" fill="none">
        <defs>
          <filter id="avatarGlow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {/* Orbital rings */}
        {orbitals.map((o, oi) => (
          <g key={oi}>
            <circle cx="400" cy="200" r={o.r} stroke={o.color} strokeWidth="0.5" strokeOpacity={0.2} strokeDasharray="4 4"/>
            {/* Orbiting avatars */}
            {[...Array(o.count)].map((_, j) => {
              const angle = (j / o.count) * 360;
              const rad = (angle * Math.PI) / 180;
              const cx = 400 + o.r * Math.cos(rad);
              const cy = 200 + o.r * Math.sin(rad);
              return (
                <motion.g key={j} filter="url(#avatarGlow)"
                  style={{ transformOrigin: "400px 200px" }}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: o.speed, ease: "linear" }}
                >
                  <circle cx={cx} cy={cy} r="9" fill="#080005" stroke={o.color} strokeWidth="1.5"/>
                  <circle cx={cx} cy={cy} r="4" fill={o.color} fillOpacity={0.5}/>
                </motion.g>
              );
            })}
          </g>
        ))}

        {/* Center node — the user */}
        <motion.g animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}>
          <circle cx="400" cy="200" r="34" fill="#1a0010" stroke="#f97316" strokeWidth="2"/>
          <circle cx="400" cy="200" r="28" fill="#0d0008" stroke="#f97316" strokeWidth="0.5" strokeOpacity={0.3}/>
          {/* Person silhouette */}
          <circle cx="400" cy="193" r="10" fill="#f97316" fillOpacity={0.7}/>
          <path d="M 383 220 A 17 17 0 0 1 417 220 Z" fill="#f97316" fillOpacity={0.7}/>
        </motion.g>

        {/* Connection lines to center */}
        {[0,1,2,3,4,5].map(i => {
          const angle = (i / 6) * 2 * Math.PI;
          const x = 400 + 90 * Math.cos(angle);
          const y = 200 + 90 * Math.sin(angle);
          return (
            <motion.line key={i} x1={400} y1={200} x2={x} y2={y}
              stroke="#f97316" strokeWidth="0.5" strokeOpacity={0.2}
              animate={{ strokeOpacity: [0.1, 0.35, 0.1] }}
              transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
            />
          );
        })}
      </svg>
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#080005] to-transparent"/>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// THEME CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const THEMES: Record<string, {
  tag: string; tagColor: string;
  btnGlow: string;
}> = {
  places:   { tag: "No places yet",   tagColor: "#38bdf8", btnGlow: "hover:shadow-[0_0_24px_rgba(56,189,248,0.35)]" },
  movies:   { tag: "No movies yet",   tagColor: "#a855f7", btnGlow: "hover:shadow-[0_0_24px_rgba(168,85,247,0.35)]" },
  books:    { tag: "No books yet",    tagColor: "#fbbf24", btnGlow: "hover:shadow-[0_0_24px_rgba(251,191,36,0.35)]" },
  games:    { tag: "No games yet",    tagColor: "#f43f5e", btnGlow: "hover:shadow-[0_0_24px_rgba(244,63,94,0.35)]" },
  music:    { tag: "No music yet",    tagColor: "#e879f9", btnGlow: "hover:shadow-[0_0_24px_rgba(232,121,249,0.35)]" },
  guides:   { tag: "No guides yet",   tagColor: "#34d399", btnGlow: "hover:shadow-[0_0_24px_rgba(52,211,153,0.35)]" },
  apps:     { tag: "No apps yet",     tagColor: "#2dd4bf", btnGlow: "hover:shadow-[0_0_24px_rgba(45,212,191,0.35)]" },
  products: { tag: "No products yet", tagColor: "#fbbf24", btnGlow: "hover:shadow-[0_0_24px_rgba(251,191,36,0.35)]" },
  people:   { tag: "No people yet",   tagColor: "#f97316", btnGlow: "hover:shadow-[0_0_24px_rgba(249,115,22,0.35)]" },
};

const renderIllustration = (category: string) => {
  switch (category) {
    case "places":   return <PlacesIllustration />;
    case "movies":   return <MoviesIllustration />;
    case "books":    return <BooksIllustration />;
    case "games":    return <GamesIllustration />;
    case "music":    return <MusicIllustration />;
    case "guides":   return <GuidesIllustration />;
    case "apps":     return <AppsIllustration />;
    case "products": return <ProductsIllustration />;
    case "people":   return <PeopleIllustration />;
    default:         return <PlacesIllustration />;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export const CategoryEmptyState: React.FC<CategoryEmptyStateProps> = ({
  category,
  onAddClick,
}) => {
  const meta  = CATEGORY_META[category]  || CATEGORY_META.places;
  const theme = THEMES[category]         || THEMES.places;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="category-empty-state w-full bg-dashboard-sidebar/40 border border-dashboard rounded-3xl backdrop-blur-md shadow-dashboard-elevated overflow-hidden select-none"
    >
      {/* ── Illustration ── */}
      <div className="w-full">
        {renderIllustration(category)}
      </div>

      {/* ── Text + CTA ── */}
      <div className="flex flex-col items-center text-center px-8 py-7 gap-4">
        {/* Pill tag */}
        <span
          className="text-[10px] font-bold uppercase tracking-[0.15em] px-3 py-1 rounded-full border font-poppins"
          style={{ color: theme.tagColor, borderColor: `${theme.tagColor}33`, background: `${theme.tagColor}10` }}
        >
          {theme.tag}
        </span>

        {/* Headline */}
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-dashboard font-poppins leading-snug tracking-tight">
            {meta.tagline}
          </h3>
          <p className="text-xs text-dashboard-muted font-poppins leading-relaxed max-w-xs mx-auto">
            {meta.sub}
          </p>
        </div>

        {/* CTA */}
        <Button
          btnText={meta.addLabel}
          variant="primary"
          size="small"
          onClickHandler={onAddClick}
          className={`mt-1 font-semibold font-poppins transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] cursor-pointer ${theme.btnGlow}`}
        />
      </div>
    </motion.div>
  );
};
