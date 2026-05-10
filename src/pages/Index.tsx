import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Vec2 { x: number; y: number; }
interface Player {
  pos: Vec2; vel: Vec2; size: number;
  hidden: boolean; hiddenIn: number; hp: number; maxHp: number;
  invulnerable: number; trail: Vec2[];
}
interface Enemy {
  id: number; pos: Vec2; vel: Vec2; size: number;
  type: EnemyType; speed: number; detectionRange: number;
  alertRange: number; state: EnemyState; target: Vec2 | null;
  patrol: Vec2[]; patrolIdx: number; waitTimer: number;
  alertTimer: number; color: string; pulsePhase: number;
}
interface HideSpot { pos: Vec2; size: Vec2; }
interface Wall { pos: Vec2; size: Vec2; }
interface Particle {
  pos: Vec2; vel: Vec2; life: number; maxLife: number;
  color: string; size: number; type: 'spark' | 'blood' | 'dust';
}
interface FootStep { pos: Vec2; life: number; }

type EnemyType = 'patrol' | 'hunter' | 'ghost' | 'sentinel';
type EnemyState = 'patrol' | 'alert' | 'chase' | 'search' | 'wait';
type GamePhase = 'menu' | 'playing' | 'nearExit' | 'dead' | 'win' | 'levelup';

// ─── World dimensions ────────────────────────────────────────────────────────
const WORLD_W = 1600;
const WORLD_H = 1120;
const VIEW_W = 800;
const VIEW_H = 560;

// ─── 20-Level Generator ───────────────────────────────────────────────────────
function generateLevel(level: number): {
  walls: Wall[]; hideSpots: HideSpot[]; enemies: Enemy[];
  exit: Vec2; playerStart: Vec2;
} {
  const W = WORLD_W, H = WORLD_H;
  const walls: Wall[] = [];
  const hideSpots: HideSpot[] = [];

  // Border walls
  walls.push(
    { pos: { x: 0, y: 0 }, size: { x: W, y: 16 } },
    { pos: { x: 0, y: H - 16 }, size: { x: W, y: 16 } },
    { pos: { x: 0, y: 0 }, size: { x: 16, y: H } },
    { pos: { x: W - 16, y: 0 }, size: { x: 16, y: H } },
  );

  // Seeded pseudo-random for deterministic levels
  const rng = (seed: number) => {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  };
  const rand = rng(level * 7919 + 12345);

  // Room grid: divide world into 4x4 cells, add walls
  const cellW = W / 4, cellH = H / 4;
  const wallThick = 16;

  // Generate maze-like walls based on level
  const wallCount = 8 + Math.floor(level * 1.2);
  for (let i = 0; i < wallCount; i++) {
    const horizontal = rand() > 0.5;
    const cx = Math.floor(rand() * 3) + 0.5;
    const cy = Math.floor(rand() * 3) + 0.5;
    const len = (0.4 + rand() * 0.5) * (horizontal ? cellW : cellH);
    const ox = cx * cellW + (rand() - 0.5) * cellW * 0.4;
    const oy = cy * cellH + (rand() - 0.5) * cellH * 0.4;
    if (horizontal) {
      walls.push({ pos: { x: Math.max(40, ox), y: Math.max(40, oy) }, size: { x: len, y: wallThick } });
    } else {
      walls.push({ pos: { x: Math.max(40, ox), y: Math.max(40, oy) }, size: { x: wallThick, y: len } });
    }
  }

  // Fixed structural walls per level tier
  const tiers = [
    // T1: levels 1-5 — simple rooms
    [
      { pos: { x: 200, y: 200 }, size: { x: 16, y: 320 } },
      { pos: { x: 600, y: 300 }, size: { x: 320, y: 16 } },
      { pos: { x: 900, y: 150 }, size: { x: 16, y: 400 } },
      { pos: { x: 1200, y: 500 }, size: { x: 16, y: 400 } },
    ],
    // T2: levels 6-10 — corridors
    [
      { pos: { x: 300, y: 300 }, size: { x: 400, y: 16 } },
      { pos: { x: 700, y: 300 }, size: { x: 16, y: 350 } },
      { pos: { x: 300, y: 650 }, size: { x: 400, y: 16 } },
      { pos: { x: 1000, y: 200 }, size: { x: 16, y: 500 } },
      { pos: { x: 1100, y: 700 }, size: { x: 380, y: 16 } },
    ],
    // T3: levels 11-15 — labyrinth
    [
      { pos: { x: 250, y: 250 }, size: { x: 500, y: 16 } },
      { pos: { x: 250, y: 250 }, size: { x: 16, y: 400 } },
      { pos: { x: 750, y: 450 }, size: { x: 16, y: 400 } },
      { pos: { x: 500, y: 650 }, size: { x: 400, y: 16 } },
      { pos: { x: 900, y: 200 }, size: { x: 400, y: 16 } },
      { pos: { x: 1300, y: 200 }, size: { x: 16, y: 600 } },
    ],
    // T4: levels 16-20 — fortress
    [
      { pos: { x: 200, y: 200 }, size: { x: 600, y: 16 } },
      { pos: { x: 200, y: 200 }, size: { x: 16, y: 400 } },
      { pos: { x: 800, y: 400 }, size: { x: 16, y: 500 } },
      { pos: { x: 400, y: 600 }, size: { x: 400, y: 16 } },
      { pos: { x: 900, y: 300 }, size: { x: 400, y: 16 } },
      { pos: { x: 1300, y: 300 }, size: { x: 16, y: 500 } },
      { pos: { x: 1000, y: 800 }, size: { x: 400, y: 16 } },
      { pos: { x: 600, y: 750 }, size: { x: 16, y: 300 } },
    ],
  ];
  const tier = Math.min(Math.floor((level - 1) / 5), 3);
  tiers[tier].forEach(w => walls.push(w));

  // Hide spots — more on harder levels
  const hsCount = 3 + Math.floor(level / 4);
  for (let i = 0; i < hsCount; i++) {
    const r = rand();
    const hx = 100 + r * (W - 200);
    const hy = 100 + rand() * (H - 200);
    hideSpots.push({ pos: { x: hx, y: hy }, size: { x: 55, y: 45 } });
  }

  // Enemy configs — scale with level
  const enemyConfigs: Array<Partial<Enemy> & { patrol: Vec2[] }> = [];
  const spd = (base: number) => base + level * 0.08;
  const det = (base: number) => Math.min(base + level * 7, 280);
  const alr = (base: number) => Math.min(base + level * 9, 420);

  // Always at least 1 patrol
  const patrolCount = 1 + Math.floor(level / 4);
  for (let i = 0; i < patrolCount; i++) {
    const px = 300 + i * 280;
    const py = 200 + (i % 2) * 400;
    enemyConfigs.push({
      type: 'patrol', speed: spd(0.85), color: '#cc3333',
      detectionRange: det(90), alertRange: alr(200),
      patrol: [{ x: px, y: py }, { x: px + 400, y: py }, { x: px + 400, y: py + 300 }, { x: px, y: py + 300 }],
    });
  }
  if (level >= 3) {
    enemyConfigs.push({
      type: 'hunter', speed: spd(1.1), color: '#8833cc',
      detectionRange: det(110), alertRange: alr(220),
      patrol: [{ x: 400, y: 300 }, { x: 1000, y: 300 }, { x: 1000, y: 800 }, { x: 400, y: 800 }],
    });
  }
  if (level >= 5) {
    enemyConfigs.push({
      type: 'ghost', speed: spd(0.65), color: '#33aacc',
      detectionRange: det(130), alertRange: alr(250),
      patrol: [{ x: 800, y: 560 }, { x: 300, y: 560 }, { x: 300, y: 900 }, { x: 1200, y: 900 }, { x: 1200, y: 200 }],
    });
  }
  if (level >= 8) {
    enemyConfigs.push({
      type: 'sentinel', speed: 0.4, color: '#ff8800',
      detectionRange: det(170), alertRange: alr(360),
      patrol: [{ x: W / 2, y: H / 2 }],
    });
  }
  if (level >= 10) {
    enemyConfigs.push({
      type: 'hunter', speed: spd(1.3), color: '#cc44aa',
      detectionRange: det(120), alertRange: alr(240),
      patrol: [{ x: 200, y: 900 }, { x: 800, y: 900 }, { x: 800, y: 200 }, { x: 1400, y: 200 }],
    });
  }
  if (level >= 13) {
    enemyConfigs.push({
      type: 'patrol', speed: spd(1.5), color: '#ff4444',
      detectionRange: det(100), alertRange: alr(210),
      patrol: [{ x: 600, y: 400 }, { x: 1400, y: 400 }, { x: 1400, y: 800 }, { x: 600, y: 800 }],
    });
  }
  if (level >= 16) {
    enemyConfigs.push({
      type: 'ghost', speed: spd(1.0), color: '#44ffcc',
      detectionRange: det(160), alertRange: alr(300),
      patrol: [{ x: 400, y: 400 }, { x: 1200, y: 400 }, { x: 1200, y: 900 }, { x: 400, y: 900 }],
    });
    enemyConfigs.push({
      type: 'sentinel', speed: 0.6, color: '#ffdd00',
      detectionRange: det(200), alertRange: alr(400),
      patrol: [{ x: 900, y: 400 }],
    });
  }
  if (level >= 19) {
    enemyConfigs.push({
      type: 'hunter', speed: spd(1.8), color: '#ff2288',
      detectionRange: det(140), alertRange: alr(280),
      patrol: [{ x: 100, y: 100 }, { x: 1500, y: 100 }, { x: 1500, y: 1000 }, { x: 100, y: 1000 }],
    });
  }

  const enemies: Enemy[] = enemyConfigs.map((cfg, i) => ({
    id: i,
    pos: { ...cfg.patrol![0] },
    vel: { x: 0, y: 0 },
    size: cfg.type === 'sentinel' ? 14 : 11,
    type: cfg.type!,
    speed: cfg.speed!,
    detectionRange: cfg.detectionRange!,
    alertRange: cfg.alertRange!,
    state: 'patrol' as EnemyState,
    target: null,
    patrol: cfg.patrol!,
    patrolIdx: 0,
    waitTimer: 0,
    alertTimer: 0,
    color: cfg.color!,
    pulsePhase: Math.random() * Math.PI * 2,
  }));

  return {
    walls, hideSpots, enemies,
    exit: { x: W - 60, y: H - 60 },
    playerStart: { x: 50, y: 50 },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rectOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function dist(a: Vec2, b: Vec2) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function normalize(v: Vec2): Vec2 {
  const d = Math.sqrt(v.x * v.x + v.y * v.y) || 1;
  return { x: v.x / d, y: v.y / d };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<{
    player: Player; enemies: Enemy[]; walls: Wall[];
    hideSpots: HideSpot[]; particles: Particle[]; footsteps: FootStep[];
    exit: Vec2; keys: Set<string>; level: number; score: number;
    phase: GamePhase; shakeTimer: number; phaseTimer: number;
    frameId: number; dangerLevel: number;
    cam: Vec2; // camera top-left in world coords
  } | null>(null);

  const [uiState, setUiState] = useState({
    phase: 'menu' as GamePhase,
    level: 1, score: 0, hp: 3, maxHp: 3, hidden: false, dangerLevel: 0, nearExit: false,
  });

  const spawnParticles = useCallback((
    g: NonNullable<typeof gameRef.current>,
    pos: Vec2, color: string, count: number, type: Particle['type']
  ) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      g.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life: 30 + Math.random() * 40, maxLife: 70,
        color, size: 1.5 + Math.random() * 2.5, type,
      });
    }
  }, []);

  const initGame = useCallback((level: number, keepScore = false) => {
    const lvl = generateLevel(level);
    const prevScore = keepScore ? (gameRef.current?.score ?? 0) : 0;
    gameRef.current = {
      player: {
        pos: { ...lvl.playerStart }, vel: { x: 0, y: 0 }, size: 9,
        hidden: false, hiddenIn: -1, hp: 3, maxHp: 3, invulnerable: 0, trail: [],
      },
      enemies: lvl.enemies, walls: lvl.walls, hideSpots: lvl.hideSpots,
      particles: [], footsteps: [], exit: lvl.exit, keys: new Set(),
      level, score: prevScore,
      phase: 'playing', shakeTimer: 0, phaseTimer: 0,
      dangerLevel: 0, frameId: 0,
      cam: { x: 0, y: 0 },
    };
    setUiState(s => ({ ...s, phase: 'playing', level, hp: 3, maxHp: 3, hidden: false, dangerLevel: 0, nearExit: false }));
  }, []);

  // Key handlers
  useEffect(() => {
    const handleKey = (e: KeyboardEvent, down: boolean) => {
      const g = gameRef.current;
      // Always update keys even if no game yet — store in a global fallback
      const key = e.key.toLowerCase();
      if (g) {
        if (down) g.keys.add(key);
        else g.keys.delete(key);
      }

      if (down && (e.key === 'e' || e.key === 'E') && (g.phase === 'playing' || g.phase === 'nearExit')) {
        const p = g.player;
        if (p.hidden) {
          p.hidden = false; p.hiddenIn = -1;
          spawnParticles(g, p.pos, '#4a7a4a', 6, 'dust');
        } else {
          g.hideSpots.forEach((hs, i) => {
            if (rectOverlap(p.pos.x - p.size, p.pos.y - p.size, p.size * 2, p.size * 2, hs.pos.x, hs.pos.y, hs.size.x, hs.size.y)) {
              p.hidden = true; p.hiddenIn = i;
              spawnParticles(g, p.pos, '#4a7a4a', 10, 'dust');
            }
          });
        }
      }
    };
    const onDown = (e: KeyboardEvent) => {
      const gamKeys = ['arrowleft','arrowright','arrowup','arrowdown','a','w','s','d','e',' '];
      if (gamKeys.includes(e.key.toLowerCase())) e.preventDefault();
      handleKey(e, true);
    };
    const onUp = (e: KeyboardEvent) => handleKey(e, false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [spawnParticles]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;

    function updateCamera(g: NonNullable<typeof gameRef.current>) {
      const p = g.player;
      // Target: player centered in view
      const targetX = p.pos.x - VIEW_W / 2;
      const targetY = p.pos.y - VIEW_H / 2;
      // Clamp to world bounds
      g.cam.x += (Math.max(0, Math.min(WORLD_W - VIEW_W, targetX)) - g.cam.x) * 0.1;
      g.cam.y += (Math.max(0, Math.min(WORLD_H - VIEW_H, targetY)) - g.cam.y) * 0.1;
    }

    function update() {
      const g = gameRef.current;
      if (!g || (g.phase !== 'playing' && g.phase !== 'nearExit')) return;
      const p = g.player;
      const SPEED = 2.4;

      let dx = 0, dy = 0;
      if (g.keys.has('arrowleft') || g.keys.has('a')) dx -= 1;
      if (g.keys.has('arrowright') || g.keys.has('d')) dx += 1;
      if (g.keys.has('arrowup') || g.keys.has('w')) dy -= 1;
      if (g.keys.has('arrowdown') || g.keys.has('s')) dy += 1;
      if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

      if (!p.hidden) {
        const nx = p.pos.x + dx * SPEED, ny = p.pos.y + dy * SPEED;
        let hitX = false, hitY = false;
        for (const w of g.walls) {
          if (rectOverlap(nx - p.size, p.pos.y - p.size, p.size * 2, p.size * 2, w.pos.x, w.pos.y, w.size.x, w.size.y)) hitX = true;
          if (rectOverlap(p.pos.x - p.size, ny - p.size, p.size * 2, p.size * 2, w.pos.x, w.pos.y, w.size.x, w.size.y)) hitY = true;
        }
        if (!hitX) p.pos.x = Math.max(p.size, Math.min(WORLD_W - p.size, nx));
        if (!hitY) p.pos.y = Math.max(p.size, Math.min(WORLD_H - p.size, ny));
      }

      p.trail.push({ ...p.pos });
      if (p.trail.length > 10) p.trail.shift();

      if ((Math.abs(dx) > 0 || Math.abs(dy) > 0) && !p.hidden && Math.random() < 0.12) {
        g.footsteps.push({ pos: { ...p.pos }, life: 45 });
      }
      g.footsteps = g.footsteps.filter(f => { f.life--; return f.life > 0; });

      if (p.invulnerable > 0) p.invulnerable--;

      // Enemy AI
      let maxDanger = 0;
      for (const e of g.enemies) {
        e.pulsePhase += 0.05;
        const d = dist(e.pos, p.pos);
        const canSee = !p.hidden && d < e.detectionRange;
        const canHear = !p.hidden && d < e.alertRange && (Math.abs(dx) > 0 || Math.abs(dy) > 0);

        if (canSee) {
          e.state = 'chase'; e.target = { ...p.pos }; e.alertTimer = 200;
          maxDanger = Math.max(maxDanger, (e.detectionRange - d) / e.detectionRange);
        } else if (canHear && e.state !== 'chase') {
          e.state = 'alert'; e.target = { ...p.pos }; e.alertTimer = 130;
          maxDanger = Math.max(maxDanger, 0.4);
        }
        if (e.alertTimer > 0) { e.alertTimer--; if (e.alertTimer === 0 && e.state !== 'chase') e.state = 'patrol'; }

        let moveTarget: Vec2 | null = null;
        if (e.state === 'chase' || e.state === 'alert') {
          moveTarget = e.target;
        } else {
          const pt = e.patrol[e.patrolIdx];
          if (dist(e.pos, pt) < 10) {
            if (e.waitTimer <= 0) {
              e.patrolIdx = (e.patrolIdx + 1) % e.patrol.length;
              e.waitTimer = e.type === 'sentinel' ? 999 : 20 + Math.random() * 40;
            } else e.waitTimer--;
          } else moveTarget = pt;
        }

        if (moveTarget) {
          const dir = normalize({ x: moveTarget.x - e.pos.x, y: moveTarget.y - e.pos.y });
          const spd = e.state === 'chase' ? e.speed * 1.5 : e.type === 'ghost' ? e.speed * 1.1 : e.speed;
          const nx = e.pos.x + dir.x * spd, ny = e.pos.y + dir.y * spd;
          if (e.type === 'ghost') { e.pos.x = nx; e.pos.y = ny; }
          else {
            let hitX = false, hitY = false;
            for (const w of g.walls) {
              if (rectOverlap(nx - e.size, e.pos.y - e.size, e.size * 2, e.size * 2, w.pos.x, w.pos.y, w.size.x, w.size.y)) hitX = true;
              if (rectOverlap(e.pos.x - e.size, ny - e.size, e.size * 2, e.size * 2, w.pos.x, w.pos.y, w.size.x, w.size.y)) hitY = true;
            }
            if (!hitX) e.pos.x = nx;
            if (!hitY) e.pos.y = ny;
          }
          if (e.state === 'chase' && dist(e.pos, e.target!) < 20) { e.state = 'search'; e.alertTimer = 90; }
        }

        // Damage
        if (!p.hidden && p.invulnerable === 0 && dist(e.pos, p.pos) < e.size + p.size + 4) {
          p.hp--; p.invulnerable = 90; g.shakeTimer = 30;
          spawnParticles(g, p.pos, '#ff4444', 15, 'blood');
          if (p.hp <= 0) { g.phase = 'dead'; g.phaseTimer = 0; spawnParticles(g, p.pos, '#ff2222', 30, 'blood'); }
        }
      }

      g.dangerLevel += (maxDanger - g.dangerLevel) * 0.05;

      // Near exit check
      const nearExit = dist(p.pos, g.exit) < 50;
      if (nearExit && g.phase === 'playing') g.phase = 'nearExit';
      if (!nearExit && g.phase === 'nearExit') g.phase = 'playing';

      // Particles
      for (const pt of g.particles) {
        pt.pos.x += pt.vel.x; pt.pos.y += pt.vel.y;
        pt.vel.x *= 0.92; pt.vel.y *= 0.92; pt.life--;
      }
      g.particles = g.particles.filter(pt => pt.life > 0);
      if (g.shakeTimer > 0) g.shakeTimer--;

      updateCamera(g);

      setUiState({
        phase: g.phase, level: g.level, score: g.score,
        hp: p.hp, maxHp: p.maxHp, hidden: p.hidden,
        dangerLevel: g.dangerLevel, nearExit,
      });
    }

    function worldToScreen(g: NonNullable<typeof gameRef.current>, x: number, y: number): Vec2 {
      return { x: x - g.cam.x, y: y - g.cam.y };
    }

    function draw() {
      const g = gameRef.current;
      if (!g) return;
      const W = VIEW_W, H = VIEW_H;
      const cam = g.cam;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#090c11';
      ctx.fillRect(0, 0, W, H);

      // Floor tiles
      const startTX = Math.floor(cam.x / 32) * 32;
      const startTY = Math.floor(cam.y / 32) * 32;
      for (let fx = startTX; fx < cam.x + W + 32; fx += 32) {
        for (let fy = startTY; fy < cam.y + H + 32; fy += 32) {
          const sx = fx - cam.x, sy = fy - cam.y;
          const v = 0.03 + ((fx * 7 + fy * 13) % 11) * 0.004;
          ctx.fillStyle = `rgba(255,255,255,${v})`;
          ctx.fillRect(sx, sy, 32, 32);
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.025)';
      ctx.lineWidth = 0.5;
      for (let gx = startTX; gx < cam.x + W + 32; gx += 32) {
        const sx = gx - cam.x;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      }
      for (let gy = startTY; gy < cam.y + H + 32; gy += 32) {
        const sy = gy - cam.y;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
      }

      if (g.shakeTimer > 0) {
        ctx.save();
        ctx.translate((Math.random() - 0.5) * 4 * (g.shakeTimer / 30), (Math.random() - 0.5) * 4 * (g.shakeTimer / 30));
      }

      // Walls
      for (const w of g.walls) {
        const s = worldToScreen(g, w.pos.x, w.pos.y);
        if (s.x > W + 20 || s.x + w.size.x < -20 || s.y > H + 20 || s.y + w.size.y < -20) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(s.x + 4, s.y + 4, w.size.x, w.size.y);
        const grad = ctx.createLinearGradient(s.x, s.y, s.x + w.size.x, s.y + w.size.y);
        grad.addColorStop(0, '#252d3a'); grad.addColorStop(1, '#1a1f2a');
        ctx.fillStyle = grad; ctx.fillRect(s.x, s.y, w.size.x, w.size.y);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(s.x, s.y, w.size.x, 2); ctx.fillRect(s.x, s.y, 2, w.size.y);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(s.x, s.y + w.size.y - 2, w.size.x, 2); ctx.fillRect(s.x + w.size.x - 2, s.y, 2, w.size.y);
      }

      // Hide spots
      const t = Date.now() * 0.002;
      for (const hs of g.hideSpots) {
        const s = worldToScreen(g, hs.pos.x, hs.pos.y);
        if (s.x > W + 60 || s.x + hs.size.x < -60 || s.y > H + 60 || s.y + hs.size.y < -60) continue;
        const pulse = 0.3 + 0.1 * Math.sin(t);
        ctx.fillStyle = '#1a2a1a'; ctx.fillRect(s.x, s.y, hs.size.x, hs.size.y);
        ctx.strokeStyle = `rgba(74,122,74,${pulse + 0.4})`; ctx.lineWidth = 1.5;
        ctx.strokeRect(s.x, s.y, hs.size.x, hs.size.y);
        const hGrad = ctx.createRadialGradient(s.x + hs.size.x / 2, s.y + hs.size.y / 2, 0, s.x + hs.size.x / 2, s.y + hs.size.y / 2, hs.size.x / 2);
        hGrad.addColorStop(0, `rgba(74,122,74,${pulse * 0.4})`); hGrad.addColorStop(1, 'rgba(74,122,74,0)');
        ctx.fillStyle = hGrad; ctx.fillRect(s.x, s.y, hs.size.x, hs.size.y);
        ctx.fillStyle = `rgba(74,200,74,${pulse + 0.3})`;
        ctx.font = 'bold 10px IBM Plex Sans'; ctx.textAlign = 'center';
        ctx.fillText('[E]', s.x + hs.size.x / 2, s.y - 5);
      }

      // Exit
      const es = worldToScreen(g, g.exit.x, g.exit.y);
      const ep = 0.5 + 0.5 * Math.sin(Date.now() * 0.003);
      const exG = ctx.createRadialGradient(es.x, es.y, 0, es.x, es.y, 30);
      exG.addColorStop(0, `rgba(232,184,75,${0.5 + ep * 0.3})`);
      exG.addColorStop(0.5, `rgba(232,184,75,${0.15 + ep * 0.1})`);
      exG.addColorStop(1, 'rgba(232,184,75,0)');
      ctx.fillStyle = exG; ctx.beginPath(); ctx.arc(es.x, es.y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(232,184,75,${0.7 + ep * 0.3})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(es.x, es.y, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(232,184,75,${0.8 + ep * 0.2})`;
      ctx.font = 'bold 13px Oswald'; ctx.textAlign = 'center';
      ctx.fillText('EXIT', es.x, es.y + 5);

      // Footsteps
      for (const fs of g.footsteps) {
        const fs2 = worldToScreen(g, fs.pos.x, fs.pos.y);
        const a = fs.life / 45;
        ctx.strokeStyle = `rgba(232,184,75,${a * 0.12})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(fs2.x, fs2.y, (1 - a) * 18 + 2, 0, Math.PI * 2); ctx.stroke();
      }

      // Enemy detection rings
      for (const e of g.enemies) {
        if (e.state !== 'chase' && e.state !== 'alert') continue;
        const es2 = worldToScreen(g, e.pos.x, e.pos.y);
        ctx.strokeStyle = `rgba(255,68,68,${e.state === 'chase' ? 0.18 : 0.08})`;
        ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.arc(es2.x, es2.y, e.detectionRange, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Enemy shadows
      for (const e of g.enemies) {
        const es2 = worldToScreen(g, e.pos.x, e.pos.y);
        if (es2.x < -40 || es2.x > W + 40 || es2.y < -40 || es2.y > H + 40) continue;
        const sg = ctx.createRadialGradient(es2.x + 3, es2.y + 3, 0, es2.x + 3, es2.y + 3, e.size * 2.5);
        sg.addColorStop(0, 'rgba(0,0,0,0.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.beginPath();
        ctx.ellipse(es2.x + 3, es2.y + 3, e.size * 2.5, e.size * 1.5, 0, 0, Math.PI * 2); ctx.fill();
      }

      // Enemies
      for (const e of g.enemies) {
        const es2 = worldToScreen(g, e.pos.x, e.pos.y);
        if (es2.x < -40 || es2.x > W + 40 || es2.y < -40 || es2.y > H + 40) continue;
        const chasing = e.state === 'chase';
        const eG = ctx.createRadialGradient(es2.x, es2.y, 0, es2.x, es2.y, e.size * (chasing ? 3.5 : 2.5));
        eG.addColorStop(0, e.color + (chasing ? 'cc' : '88'));
        eG.addColorStop(0.4, e.color + '44'); eG.addColorStop(1, e.color + '00');
        ctx.fillStyle = eG; ctx.beginPath(); ctx.arc(es2.x, es2.y, e.size * (chasing ? 3.5 : 2.5), 0, Math.PI * 2); ctx.fill();

        if (e.type === 'sentinel') {
          ctx.fillStyle = e.color; ctx.beginPath();
          ctx.moveTo(es2.x, es2.y - e.size); ctx.lineTo(es2.x + e.size, es2.y);
          ctx.lineTo(es2.x, es2.y + e.size); ctx.lineTo(es2.x - e.size, es2.y);
          ctx.closePath(); ctx.fill();
        } else if (e.type === 'ghost') {
          const wp = 0.5 + 0.5 * Math.sin(e.pulsePhase);
          ctx.fillStyle = e.color + 'cc'; ctx.beginPath();
          ctx.arc(es2.x, es2.y - 2, e.size, Math.PI, 0);
          ctx.lineTo(es2.x + e.size, es2.y + 6);
          ctx.quadraticCurveTo(es2.x + e.size * 0.5, es2.y + 8 + wp * 3, es2.x, es2.y + 6);
          ctx.quadraticCurveTo(es2.x - e.size * 0.5, es2.y + 8 - wp * 3, es2.x - e.size, es2.y + 6);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(es2.x, es2.y, e.size, 0, Math.PI * 2); ctx.fill();
          const eyeAng = e.target ? Math.atan2(e.target.y - e.pos.y, e.target.x - e.pos.x) : -Math.PI / 2;
          ctx.fillStyle = chasing ? '#ffffff' : '#ffaaaa';
          ctx.beginPath(); ctx.arc(es2.x + Math.cos(eyeAng - 0.4) * e.size * 0.5, es2.y + Math.sin(eyeAng - 0.4) * e.size * 0.5, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(es2.x + Math.cos(eyeAng + 0.4) * e.size * 0.5, es2.y + Math.sin(eyeAng + 0.4) * e.size * 0.5, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        if (e.state === 'alert' || e.state === 'chase') {
          ctx.fillStyle = e.state === 'chase' ? '#ff4444' : '#ffaa00';
          ctx.font = 'bold 13px Oswald'; ctx.textAlign = 'center';
          ctx.fillText(e.state === 'chase' ? '!' : '?', es2.x, es2.y - e.size - 5);
        }
      }

      // Player shadow
      const p = g.player;
      const ps = worldToScreen(g, p.pos.x, p.pos.y);
      {
        const psg = ctx.createRadialGradient(ps.x + 3, ps.y + 4, 0, ps.x + 3, ps.y + 4, p.size * 3);
        psg.addColorStop(0, 'rgba(0,0,0,0.55)'); psg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = psg; ctx.beginPath(); ctx.ellipse(ps.x + 3, ps.y + 4, p.size * 3, p.size * 2, 0, 0, Math.PI * 2); ctx.fill();
      }

      // Trail
      if (!p.hidden) {
        for (let i = 0; i < p.trail.length; i++) {
          const ts2 = worldToScreen(g, p.trail[i].x, p.trail[i].y);
          ctx.fillStyle = `rgba(232,184,75,${(i / p.trail.length) * 0.28})`;
          ctx.beginPath(); ctx.arc(ts2.x, ts2.y, p.size * (i / p.trail.length) * 0.7, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Player
      if (!p.hidden || Math.floor(Date.now() / 150) % 2 === 0) {
        ctx.globalAlpha = p.invulnerable > 0 ? 0.4 + 0.6 * (Math.floor(Date.now() / 80) % 2) : 1;
        const pgG = ctx.createRadialGradient(ps.x, ps.y, 0, ps.x, ps.y, p.size * 2.8);
        pgG.addColorStop(0, 'rgba(232,184,75,0.55)'); pgG.addColorStop(1, 'rgba(232,184,75,0)');
        ctx.fillStyle = pgG; ctx.beginPath(); ctx.arc(ps.x, ps.y, p.size * 2.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.hidden ? '#4a7a4a' : '#e8b84b';
        ctx.beginPath(); ctx.arc(ps.x, ps.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.beginPath(); ctx.arc(ps.x - 2, ps.y - 2, p.size * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Particles
      for (const pt of g.particles) {
        const pts = worldToScreen(g, pt.pos.x, pt.pos.y);
        ctx.globalAlpha = pt.life / pt.maxLife; ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(pts.x, pts.y, pt.size * (pt.life / pt.maxLife), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Darkness around player
      const dg = ctx.createRadialGradient(ps.x, ps.y, 0, ps.x, ps.y, p.hidden ? 90 : 145);
      dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(0.55, 'rgba(0,0,0,0.15)'); dg.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);

      // Danger vignette
      if (g.dangerLevel > 0.08) {
        const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.85);
        vg.addColorStop(0, 'rgba(180,0,0,0)'); vg.addColorStop(1, `rgba(180,0,0,${g.dangerLevel * 0.4})`);
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      }

      if (g.shakeTimer > 0) ctx.restore();

      // Mini-map (top-right corner)
      drawMinimap(g, ctx, W, H);
    }

    function drawMinimap(g: NonNullable<typeof gameRef.current>, ctx: CanvasRenderingContext2D, W: number, H: number) {
      const mmW = 110, mmH = 77;
      const mmX = W - mmW - 8, mmY = 8;
      const scaleX = mmW / WORLD_W, scaleY = mmH / WORLD_H;

      ctx.globalAlpha = 0.82;
      ctx.fillStyle = 'rgba(10,12,16,0.88)';
      ctx.strokeStyle = 'rgba(232,184,75,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(mmX, mmY, mmW, mmH, 3);
      ctx.fill(); ctx.stroke();

      // Walls on minimap
      ctx.fillStyle = 'rgba(37,45,58,0.9)';
      for (const w of g.walls) {
        ctx.fillRect(mmX + w.pos.x * scaleX, mmY + w.pos.y * scaleY, Math.max(1, w.size.x * scaleX), Math.max(1, w.size.y * scaleY));
      }

      // Exit
      ctx.fillStyle = '#e8b84b';
      ctx.beginPath();
      ctx.arc(mmX + g.exit.x * scaleX, mmY + g.exit.y * scaleY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Enemies
      for (const e of g.enemies) {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(mmX + e.pos.x * scaleX, mmY + e.pos.y * scaleY, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Player
      ctx.fillStyle = '#e8b84b';
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mmX + g.player.pos.x * scaleX, mmY + g.player.pos.y * scaleY, 3, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // Camera viewport rect
      ctx.strokeStyle = 'rgba(232,184,75,0.35)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(mmX + g.cam.x * scaleX, mmY + g.cam.y * scaleY, VIEW_W * scaleX, VIEW_H * scaleY);

      ctx.globalAlpha = 1;
    }

    function loop(_ts: number) {
      update();
      draw();
      animId = requestAnimationFrame(loop);
    }
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [initGame, spawnParticles]);

  const { phase, level, score, hp, maxHp, hidden, dangerLevel, nearExit } = uiState;

  const handleNextLevel = () => {
    const g = gameRef.current;
    if (!g) return;
    if (level >= 20) {
      g.phase = 'win';
      setUiState(s => ({ ...s, phase: 'win' }));
    } else {
      g.score += 100 * level;
      initGame(level + 1, true);
    }
  };

  return (
    <div className="flex items-center justify-center w-screen h-screen bg-[#050609] scanlines">
      <div
        className="relative select-none outline-none"
        style={{ width: VIEW_W, height: VIEW_H }}
        tabIndex={0}
        ref={el => el && el.focus()}
        onClick={e => (e.currentTarget as HTMLDivElement).focus()}
      >
        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="block" />
        <div className="noise-overlay" />
        <div className="vignette" />

        {/* ── HUD ──────────────────────────────────────────────────────────── */}
        {(phase === 'playing' || phase === 'nearExit') && (
          <>
            {/* Top bar */}
            <div className="absolute top-3 left-3 flex items-start gap-2 pointer-events-none">
              <div className="hud-panel px-3 py-1.5 rounded">
                <div className="text-[9px] tracking-widest uppercase" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>Ур.</div>
                <div className="text-xl font-bold leading-tight" style={{ color: '#e8b84b', fontFamily: 'Oswald', textShadow: '0 0 8px rgba(232,184,75,0.7)' }}>
                  {String(level).padStart(2, '0')}<span className="text-xs font-normal opacity-40">/20</span>
                </div>
              </div>
              <div className="hud-panel px-3 py-1.5 rounded">
                <div className="text-[9px] tracking-widest uppercase" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>Очки</div>
                <div className="text-lg font-bold leading-tight" style={{ color: '#e8b84b', fontFamily: 'Oswald' }}>{score.toLocaleString()}</div>
              </div>
              <div className="hud-panel px-3 py-1.5 rounded">
                <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>Жизни</div>
                <div className="flex gap-1">
                  {Array.from({ length: maxHp }).map((_, i) => (
                    <div key={i} className="w-3.5 h-3.5 rounded-sm"
                      style={{ background: i < hp ? '#cc3333' : '#1a1a1a', boxShadow: i < hp ? '0 0 5px #cc3333' : 'none', border: '1px solid rgba(204,51,51,0.35)' }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Danger bar */}
            {dangerLevel > 0.05 && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 hud-panel px-3 py-1.5 rounded flex items-center gap-2 pointer-events-none">
                <span className="text-[9px] tracking-widest uppercase" style={{ color: '#ff4444', fontFamily: 'Oswald' }}>Опасность</span>
                <div className="w-20 h-1.5 bg-[#1a0000] rounded-full overflow-hidden">
                  <div className={dangerLevel > 0.7 ? 'danger-bar h-full rounded-full' : 'h-full rounded-full transition-all duration-100'}
                    style={{ width: `${dangerLevel * 100}%`, background: 'linear-gradient(90deg,#cc3333,#ff4444)', boxShadow: `0 0 8px rgba(255,68,68,${dangerLevel})` }} />
                </div>
              </div>
            )}

            {/* D-pad controls */}
            {!nearExit && (() => {
              const pressKey = (key: string) => {
                const g = gameRef.current;
                if (g) g.keys.add(key);
              };
              const releaseKey = (key: string) => {
                const g = gameRef.current;
                if (g) g.keys.delete(key);
              };
              const btnStyle = {
                background: 'rgba(232,184,75,0.15)',
                border: '1px solid rgba(232,184,75,0.3)',
                color: '#e8b84b',
                width: 36, height: 36,
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, cursor: 'pointer', userSelect: 'none' as const,
                touchAction: 'none' as const,
              };
              const mk = (label: string, key: string) => (
                <button
                  style={btnStyle}
                  onPointerDown={e => { e.preventDefault(); pressKey(key); }}
                  onPointerUp={() => releaseKey(key)}
                  onPointerLeave={() => releaseKey(key)}
                >{label}</button>
              );
              return (
                <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1">
                  <div>{mk('↑', 'arrowup')}</div>
                  <div className="flex gap-1">{mk('←', 'arrowleft')}{mk('↓', 'arrowdown')}{mk('→', 'arrowright')}</div>
                  <button
                    style={{ ...btnStyle, width: 80, marginTop: 2, fontSize: 10, letterSpacing: '0.1em' }}
                    onPointerDown={e => { e.preventDefault(); const g = gameRef.current; if(g){ const p=g.player; if(p.hidden){p.hidden=false;p.hiddenIn=-1;}else{g.hideSpots.forEach((hs,i)=>{if(rectOverlap(p.pos.x-p.size,p.pos.y-p.size,p.size*2,p.size*2,hs.pos.x,hs.pos.y,hs.size.x,hs.size.y)){p.hidden=true;p.hiddenIn=i;}});}} }}
                  >УКРЫТЬСЯ</button>
                </div>
              );
            })()}

            {/* Hidden */}
            {hidden && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 hud-panel px-4 py-2 rounded flex items-center gap-2 pointer-events-none">
                <div className="w-2 h-2 rounded-full" style={{ background: '#44ff88', boxShadow: '0 0 7px #44ff88' }} />
                <span className="text-[9px] tracking-widest uppercase" style={{ color: '#44ff88', fontFamily: 'Oswald', textShadow: '0 0 8px rgba(68,255,136,0.8)' }}>
                  Укрыт · E — выйти
                </span>
              </div>
            )}

            {/* NEXT LEVEL button — shown when nearExit */}
            {nearExit && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center gap-4">
                  <div className="text-[10px] tracking-[0.5em] uppercase" style={{ color: 'rgba(232,184,75,0.6)', fontFamily: 'Oswald' }}>
                    Выход найден
                  </div>
                  <button
                    onClick={handleNextLevel}
                    className="btn-game px-10 py-4 rounded font-bold tracking-widest uppercase text-2xl"
                    style={{
                      background: 'linear-gradient(135deg,#e8b84b,#c99520)',
                      color: '#0a0c10',
                      fontFamily: 'Oswald',
                      boxShadow: '0 0 40px rgba(232,184,75,0.5), 0 4px 20px rgba(0,0,0,0.6)',
                    }}>
                    {level >= 20 ? '🏆 Победа!' : `Уровень ${level + 1} →`}
                  </button>
                  <div className="text-[9px]" style={{ color: 'rgba(232,184,75,0.35)', fontFamily: 'IBM Plex Sans' }}>
                    +{100 * level} очков за уровень
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── MENU ──────────────────────────────────────────────────────────── */}
        {phase === 'menu' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,0.87),rgba(0,0,0,0.96))' }}>
            <div className="text-center mb-8">
              <div className="text-[10px] tracking-[0.5em] uppercase mb-3" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>20 уровней · Тактический побег</div>
              <h1 className="text-6xl font-bold mb-1" style={{ color: '#e8b84b', fontFamily: 'Oswald', letterSpacing: '0.06em', textShadow: '0 0 30px rgba(232,184,75,0.5)' }}>SHADOW</h1>
              <h2 className="text-4xl font-light" style={{ color: 'rgba(232,184,75,0.6)', fontFamily: 'Oswald', letterSpacing: '0.35em' }}>ESCAPE</h2>
              <div className="mt-4 w-36 mx-auto h-px" style={{ background: 'linear-gradient(90deg,transparent,#e8b84b,transparent)' }} />
            </div>
            <p className="text-sm mb-8 max-w-xs text-center leading-6" style={{ color: 'rgba(232,184,75,0.42)', fontFamily: 'IBM Plex Sans' }}>
              Уклоняйся от существ, прячься в укрытиях, добеги до выхода. 20 уровней нарастающего ужаса.
            </p>
            <button onClick={() => initGame(1)}
              className="btn-game px-10 py-4 rounded font-bold tracking-widest uppercase text-xl mb-8"
              style={{ background: 'linear-gradient(135deg,#e8b84b,#c99520)', color: '#0a0c10', fontFamily: 'Oswald', boxShadow: '0 0 30px rgba(232,184,75,0.3),0 4px 15px rgba(0,0,0,0.5)' }}>
              Начать игру
            </button>
            <div className="grid grid-cols-4 gap-5 text-center">
              {[['Патруль', '#cc3333'], ['Охотник', '#8833cc'], ['Призрак', '#33aacc'], ['Страж', '#ff8800']].map(([name, color]) => (
                <div key={name} className="flex flex-col items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                  <span className="text-[9px] tracking-widest uppercase" style={{ color: color + '99', fontFamily: 'Oswald' }}>{name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DEAD ──────────────────────────────────────────────────────────── */}
        {phase === 'dead' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(180deg,rgba(40,0,0,0.92),rgba(0,0,0,0.97))' }}>
            <div className="text-center mb-6">
              <div className="text-[10px] tracking-[0.5em] uppercase mb-3" style={{ color: 'rgba(255,68,68,0.5)', fontFamily: 'Oswald' }}>Конец</div>
              <h1 className="text-5xl font-bold" style={{ color: '#ff4444', fontFamily: 'Oswald', textShadow: '0 0 20px rgba(255,68,68,0.8)' }}>ВЫ ПОЙМАНЫ</h1>
              <div className="mt-3 w-40 mx-auto h-px" style={{ background: 'linear-gradient(90deg,transparent,#ff4444,transparent)' }} />
            </div>
            <div className="hud-panel px-8 py-4 rounded mb-6 text-center">
              <div className="text-[9px] tracking-widest uppercase" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>Уровень</div>
              <div className="text-3xl font-bold" style={{ color: '#e8b84b', fontFamily: 'Oswald' }}>{level}<span className="text-lg opacity-40">/20</span></div>
              <div className="text-[9px] tracking-widest uppercase mt-2" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>Очки</div>
              <div className="text-xl" style={{ color: '#e8b84b', fontFamily: 'Oswald' }}>{score.toLocaleString()}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => initGame(level, true)}
                className="btn-game px-7 py-3 rounded font-bold tracking-widest uppercase text-sm"
                style={{ background: 'linear-gradient(135deg,#cc3333,#991111)', color: '#fff', fontFamily: 'Oswald', boxShadow: '0 0 18px rgba(204,51,51,0.3)' }}>
                Уровень заново
              </button>
              <button onClick={() => { if (gameRef.current) gameRef.current.score = 0; initGame(1); }}
                className="btn-game px-7 py-3 rounded font-bold tracking-widest uppercase text-sm"
                style={{ background: 'linear-gradient(135deg,#1e2530,#151a22)', color: '#e8b84b', fontFamily: 'Oswald', border: '1px solid rgba(232,184,75,0.25)' }}>
                С начала
              </button>
            </div>
          </div>
        )}

        {/* ── WIN ────────────────────────────────────────────────────────────── */}
        {phase === 'win' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(180deg,rgba(0,20,10,0.92),rgba(0,0,0,0.97))' }}>
            <div className="text-center mb-6">
              <div className="text-[10px] tracking-[0.5em] uppercase mb-3" style={{ color: 'rgba(68,255,136,0.5)', fontFamily: 'Oswald' }}>Все 20 уровней пройдены</div>
              <h1 className="text-5xl font-bold" style={{ color: '#44ff88', fontFamily: 'Oswald', textShadow: '0 0 25px rgba(68,255,136,0.8)' }}>ПОБЕГ УДАЛСЯ</h1>
              <div className="mt-3 w-48 mx-auto h-px" style={{ background: 'linear-gradient(90deg,transparent,#44ff88,transparent)' }} />
            </div>
            <div className="hud-panel px-8 py-4 rounded mb-6 text-center">
              <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>Итоговый счёт</div>
              <div className="text-5xl font-bold" style={{ color: '#e8b84b', fontFamily: 'Oswald', textShadow: '0 0 15px rgba(232,184,75,0.8)' }}>{score.toLocaleString()}</div>
            </div>
            <button
              onClick={() => { if (gameRef.current) gameRef.current.score = 0; setUiState(s => ({ ...s, phase: 'menu' })); if (gameRef.current) gameRef.current.phase = 'menu'; }}
              className="btn-game px-10 py-4 rounded font-bold tracking-widest uppercase text-xl"
              style={{ background: 'linear-gradient(135deg,#44ff88,#22cc66)', color: '#0a0c10', fontFamily: 'Oswald', boxShadow: '0 0 30px rgba(68,255,136,0.35)' }}>
              Играть снова
            </button>
          </div>
        )}
      </div>
    </div>
  );
}