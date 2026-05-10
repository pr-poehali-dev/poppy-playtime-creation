import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────
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
type GamePhase = 'menu' | 'playing' | 'dead' | 'win' | 'levelup';

// ─── Level Generator ─────────────────────────────────────────────────────────
function generateLevel(level: number): {
  walls: Wall[]; hideSpots: HideSpot[]; enemies: Enemy[];
  exit: Vec2; playerStart: Vec2;
} {
  const W = 800, H = 560;
  const walls: Wall[] = [];
  const hideSpots: HideSpot[] = [];

  // Border walls
  walls.push(
    { pos: { x: 0, y: 0 }, size: { x: W, y: 16 } },
    { pos: { x: 0, y: H - 16 }, size: { x: W, y: 16 } },
    { pos: { x: 0, y: 0 }, size: { x: 16, y: H } },
    { pos: { x: W - 16, y: 0 }, size: { x: 16, y: H } },
  );

  const layouts = [
    [
      { pos: { x: 120, y: 80 }, size: { x: 16, y: 180 } },
      { pos: { x: 120, y: 340 }, size: { x: 16, y: 140 } },
      { pos: { x: 300, y: 160 }, size: { x: 200, y: 16 } },
      { pos: { x: 300, y: 380 }, size: { x: 200, y: 16 } },
      { pos: { x: 560, y: 80 }, size: { x: 16, y: 160 } },
      { pos: { x: 560, y: 320 }, size: { x: 16, y: 160 } },
    ],
    [
      { pos: { x: 100, y: 100 }, size: { x: 16, y: 200 } },
      { pos: { x: 100, y: 380 }, size: { x: 16, y: 100 } },
      { pos: { x: 200, y: 100 }, size: { x: 180, y: 16 } },
      { pos: { x: 200, y: 280 }, size: { x: 100, y: 16 } },
      { pos: { x: 400, y: 200 }, size: { x: 16, y: 200 } },
      { pos: { x: 500, y: 100 }, size: { x: 180, y: 16 } },
      { pos: { x: 580, y: 280 }, size: { x: 16, y: 200 } },
      { pos: { x: 300, y: 420 }, size: { x: 200, y: 16 } },
    ],
    [
      { pos: { x: 80, y: 80 }, size: { x: 16, y: 160 } },
      { pos: { x: 80, y: 80 }, size: { x: 200, y: 16 } },
      { pos: { x: 200, y: 200 }, size: { x: 160, y: 16 } },
      { pos: { x: 280, y: 80 }, size: { x: 16, y: 140 } },
      { pos: { x: 360, y: 160 }, size: { x: 16, y: 200 } },
      { pos: { x: 360, y: 160 }, size: { x: 200, y: 16 } },
      { pos: { x: 460, y: 300 }, size: { x: 200, y: 16 } },
      { pos: { x: 560, y: 80 }, size: { x: 16, y: 240 } },
      { pos: { x: 160, y: 360 }, size: { x: 16, y: 140 } },
      { pos: { x: 160, y: 420 }, size: { x: 240, y: 16 } },
      { pos: { x: 480, y: 400 }, size: { x: 16, y: 120 } },
      { pos: { x: 640, y: 200 }, size: { x: 16, y: 280 } },
    ],
  ];

  const layoutIdx = Math.min(level - 1, layouts.length - 1);
  layouts[layoutIdx].forEach(w => walls.push(w));

  const hideData = [
    [{ pos: { x: 140, y: 200 }, size: { x: 50, y: 40 } }, { pos: { x: 400, y: 300 }, size: { x: 60, y: 40 } }, { pos: { x: 650, y: 150 }, size: { x: 50, y: 50 } }],
    [{ pos: { x: 130, y: 450 }, size: { x: 50, y: 40 } }, { pos: { x: 320, y: 300 }, size: { x: 60, y: 50 } }, { pos: { x: 620, y: 380 }, size: { x: 55, y: 45 } }, { pos: { x: 450, y: 140 }, size: { x: 50, y: 40 } }],
    [{ pos: { x: 100, y: 320 }, size: { x: 50, y: 40 } }, { pos: { x: 300, y: 220 }, size: { x: 50, y: 40 } }, { pos: { x: 490, y: 380 }, size: { x: 55, y: 45 } }, { pos: { x: 680, y: 420 }, size: { x: 50, y: 40 } }, { pos: { x: 200, y: 460 }, size: { x: 50, y: 40 } }],
  ];
  hideData[layoutIdx].forEach(h => hideSpots.push(h));

  const enemyConfigs: Array<Partial<Enemy> & { patrol: Vec2[] }> = [];
  if (level >= 1) {
    enemyConfigs.push({ type: 'patrol', speed: 0.8 + level * 0.1, color: '#cc3333', detectionRange: 90 + level * 8, alertRange: 200 + level * 10, patrol: [{ x: 300, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 400 }, { x: 300, y: 400 }] });
  }
  if (level >= 2) {
    enemyConfigs.push({ type: 'hunter', speed: 1.2 + level * 0.12, color: '#8833cc', detectionRange: 110 + level * 8, alertRange: 220 + level * 12, patrol: [{ x: 200, y: 150 }, { x: 500, y: 150 }, { x: 500, y: 450 }] });
  }
  if (level >= 3) {
    enemyConfigs.push({ type: 'ghost', speed: 0.6 + level * 0.15, color: '#33aacc', detectionRange: 140 + level * 10, alertRange: 260 + level * 14, patrol: [{ x: 400, y: 280 }, { x: 150, y: 280 }, { x: 150, y: 450 }, { x: 650, y: 450 }] });
  }
  if (level >= 4) {
    enemyConfigs.push({ type: 'sentinel', speed: 0.5, color: '#ff8800', detectionRange: 180, alertRange: 350, patrol: [{ x: 400, y: 280 }] });
    enemyConfigs.push({ type: 'patrol', speed: 1.5, color: '#cc3333', detectionRange: 100, alertRange: 200, patrol: [{ x: 100, y: 400 }, { x: 400, y: 400 }, { x: 400, y: 100 }, { x: 100, y: 100 }] });
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

  return { walls, hideSpots, enemies, exit: { x: W - 50, y: H - 50 }, playerStart: { x: 40, y: 40 } };
}

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

// ─── Main Game Component ──────────────────────────────────────────────────────
export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<{
    player: Player; enemies: Enemy[]; walls: Wall[];
    hideSpots: HideSpot[]; particles: Particle[]; footsteps: FootStep[];
    exit: Vec2; keys: Set<string>; level: number; score: number;
    phase: GamePhase; shakeTimer: number; phaseTimer: number;
    frameId: number; lastTime: number; dangerLevel: number;
  } | null>(null);

  const [uiState, setUiState] = useState({
    phase: 'menu' as GamePhase,
    level: 1, score: 0, hp: 3, maxHp: 3, hidden: false, dangerLevel: 0,
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
        life: 30 + Math.random() * 40,
        maxLife: 70,
        color, size: 1.5 + Math.random() * 2.5, type,
      });
    }
  }, []);

  const initGame = useCallback((level: number) => {
    const lvl = generateLevel(level);
    gameRef.current = {
      player: {
        pos: { ...lvl.playerStart }, vel: { x: 0, y: 0 }, size: 9,
        hidden: false, hiddenIn: -1, hp: 3, maxHp: 3, invulnerable: 0, trail: [],
      },
      enemies: lvl.enemies, walls: lvl.walls, hideSpots: lvl.hideSpots,
      particles: [], footsteps: [], exit: lvl.exit, keys: new Set(),
      level, score: gameRef.current?.score ?? 0,
      phase: 'playing', shakeTimer: 0, phaseTimer: 0, lastTime: 0,
      dangerLevel: 0, frameId: 0,
    };
    setUiState(s => ({ ...s, phase: 'playing', level, hp: 3, maxHp: 3, hidden: false, dangerLevel: 0 }));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent, down: boolean) => {
      const g = gameRef.current;
      if (!g) return;
      if (down) g.keys.add(e.key.toLowerCase());
      else g.keys.delete(e.key.toLowerCase());

      if (down && (e.key === 'e' || e.key === 'E')) {
        if (g.phase !== 'playing') return;
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
    const onDown = (e: KeyboardEvent) => { e.preventDefault(); handleKey(e, true); };
    const onUp = (e: KeyboardEvent) => handleKey(e, false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [spawnParticles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;

    function update() {
      const g = gameRef.current;
      if (!g || g.phase !== 'playing') return;
      const p = g.player;
      const SPEED = 2.2;

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
        if (!hitX) p.pos.x = nx;
        if (!hitY) p.pos.y = ny;
      }

      p.trail.push({ ...p.pos });
      if (p.trail.length > 8) p.trail.shift();

      if ((Math.abs(dx) > 0 || Math.abs(dy) > 0) && !p.hidden && Math.random() < 0.15) {
        g.footsteps.push({ pos: { ...p.pos }, life: 40 });
      }
      g.footsteps = g.footsteps.filter(f => { f.life--; return f.life > 0; });

      if (p.invulnerable > 0) p.invulnerable--;

      let maxDanger = 0;
      for (const e of g.enemies) {
        e.pulsePhase += 0.05;
        const d = dist(e.pos, p.pos);
        const canSee = !p.hidden && d < e.detectionRange;
        const canHear = !p.hidden && d < e.alertRange && (Math.abs(dx) > 0 || Math.abs(dy) > 0);

        if (canSee) {
          e.state = 'chase'; e.target = { ...p.pos }; e.alertTimer = 180;
          maxDanger = Math.max(maxDanger, (e.detectionRange - d) / e.detectionRange);
        } else if (canHear && e.state !== 'chase') {
          e.state = 'alert'; e.target = { ...p.pos }; e.alertTimer = 120;
          maxDanger = Math.max(maxDanger, 0.4);
        }

        if (e.alertTimer > 0) { e.alertTimer--; if (e.alertTimer === 0 && e.state !== 'chase') e.state = 'patrol'; }

        let moveTarget: Vec2 | null = null;
        if (e.state === 'chase' || e.state === 'alert') {
          moveTarget = e.target;
        } else {
          const pt = e.patrol[e.patrolIdx];
          const pd = dist(e.pos, pt);
          if (pd < 8) {
            if (e.waitTimer <= 0) { e.patrolIdx = (e.patrolIdx + 1) % e.patrol.length; e.waitTimer = e.type === 'sentinel' ? 999 : 30 + Math.random() * 40; }
            else e.waitTimer--;
          } else moveTarget = pt;
        }

        if (moveTarget) {
          const dir = normalize({ x: moveTarget.x - e.pos.x, y: moveTarget.y - e.pos.y });
          const spd = e.state === 'chase' ? e.speed * 1.4 : e.type === 'ghost' ? e.speed * 1.1 : e.speed;
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
          if (e.state === 'chase' && dist(e.pos, e.target!) < 20) { e.state = 'search'; e.alertTimer = 80; }
        }

        if (!p.hidden && p.invulnerable === 0 && dist(e.pos, p.pos) < e.size + p.size + 4) {
          p.hp--; p.invulnerable = 90; g.shakeTimer = 30;
          const sp = spawnParticles;
          sp(g, p.pos, '#ff4444', 15, 'blood');
          if (p.hp <= 0) {
            g.phase = 'dead'; g.phaseTimer = 120;
            sp(g, p.pos, '#ff2222', 30, 'blood');
          }
        }
      }

      g.dangerLevel += (maxDanger - g.dangerLevel) * 0.05;

      if (dist(p.pos, g.exit) < 28) {
        g.score += 100 * g.level;
        if (g.level >= 5) { g.phase = 'win'; }
        else { g.phase = 'levelup'; g.phaseTimer = 80; }
      }

      for (const pt of g.particles) {
        pt.pos.x += pt.vel.x; pt.pos.y += pt.vel.y;
        pt.vel.x *= 0.92; pt.vel.y *= 0.92; pt.life--;
      }
      g.particles = g.particles.filter(pt => pt.life > 0);

      if (g.shakeTimer > 0) g.shakeTimer--;
      if (g.phaseTimer > 0) {
        g.phaseTimer--;
        if (g.phaseTimer === 0 && g.phase === 'levelup') { initGame(g.level + 1); return; }
      }

      setUiState({ phase: g.phase, level: g.level, score: g.score, hp: p.hp, maxHp: p.maxHp, hidden: p.hidden, dangerLevel: g.dangerLevel });
    }

    function draw() {
      const g = gameRef.current;
      if (!g) return;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#090c11';
      ctx.fillRect(0, 0, W, H);

      for (let fx = 0; fx < W; fx += 32) {
        for (let fy = 0; fy < H; fy += 32) {
          const v = 0.03 + ((fx * 7 + fy * 13) % 11) * 0.005;
          ctx.fillStyle = `rgba(255,255,255,${v})`;
          ctx.fillRect(fx, fy, 32, 32);
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < W; gx += 32) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
      for (let gy = 0; gy < H; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

      if (g.shakeTimer > 0) { ctx.save(); ctx.translate((Math.random()-0.5)*4*(g.shakeTimer/30), (Math.random()-0.5)*4*(g.shakeTimer/30)); }

      // Walls
      for (const w of g.walls) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(w.pos.x+4, w.pos.y+4, w.size.x, w.size.y);
        const grad = ctx.createLinearGradient(w.pos.x, w.pos.y, w.pos.x+w.size.x, w.pos.y+w.size.y);
        grad.addColorStop(0, '#252d3a'); grad.addColorStop(1, '#1a1f2a');
        ctx.fillStyle = grad; ctx.fillRect(w.pos.x, w.pos.y, w.size.x, w.size.y);
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(w.pos.x, w.pos.y, w.size.x, 2); ctx.fillRect(w.pos.x, w.pos.y, 2, w.size.y);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(w.pos.x, w.pos.y+w.size.y-2, w.size.x, 2); ctx.fillRect(w.pos.x+w.size.x-2, w.pos.y, 2, w.size.y);
      }

      // Hide spots
      const t = Date.now() * 0.002;
      for (const hs of g.hideSpots) {
        const pulse = 0.3 + 0.1 * Math.sin(t);
        ctx.fillStyle = '#1a2a1a'; ctx.fillRect(hs.pos.x, hs.pos.y, hs.size.x, hs.size.y);
        ctx.strokeStyle = `rgba(74,122,74,${pulse+0.4})`; ctx.lineWidth = 1.5; ctx.strokeRect(hs.pos.x, hs.pos.y, hs.size.x, hs.size.y);
        const hGrad = ctx.createRadialGradient(hs.pos.x+hs.size.x/2, hs.pos.y+hs.size.y/2, 0, hs.pos.x+hs.size.x/2, hs.pos.y+hs.size.y/2, hs.size.x/2);
        hGrad.addColorStop(0, `rgba(74,122,74,${pulse*0.4})`); hGrad.addColorStop(1, 'rgba(74,122,74,0)');
        ctx.fillStyle = hGrad; ctx.fillRect(hs.pos.x, hs.pos.y, hs.size.x, hs.size.y);
        ctx.fillStyle = `rgba(74,200,74,${pulse+0.3})`; ctx.font = 'bold 10px IBM Plex Sans'; ctx.textAlign = 'center';
        ctx.fillText('[E]', hs.pos.x+hs.size.x/2, hs.pos.y-4);
      }

      // Exit
      const et = Date.now() * 0.003;
      const ep = 0.5 + 0.5 * Math.sin(et);
      const exG = ctx.createRadialGradient(g.exit.x, g.exit.y, 0, g.exit.x, g.exit.y, 24);
      exG.addColorStop(0, `rgba(232,184,75,${0.4+ep*0.3})`); exG.addColorStop(0.5, `rgba(232,184,75,${0.1+ep*0.1})`); exG.addColorStop(1, 'rgba(232,184,75,0)');
      ctx.fillStyle = exG; ctx.beginPath(); ctx.arc(g.exit.x, g.exit.y, 24, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = `rgba(232,184,75,${0.6+ep*0.4})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.exit.x, g.exit.y, 14, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = `rgba(232,184,75,${0.7+ep*0.3})`; ctx.font = 'bold 14px Oswald'; ctx.textAlign = 'center'; ctx.fillText('EXIT', g.exit.x, g.exit.y+5);

      // Footsteps
      for (const fs of g.footsteps) {
        const a = fs.life/40; ctx.strokeStyle = `rgba(232,184,75,${a*0.15})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(fs.pos.x, fs.pos.y, (1-a)*15+2, 0, Math.PI*2); ctx.stroke();
      }

      // Enemy detection
      for (const e of g.enemies) {
        if (e.state === 'chase' || e.state === 'alert') {
          ctx.strokeStyle = `rgba(255,68,68,${e.state==='chase'?0.2:0.1})`; ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.detectionRange, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // Enemy shadows
      for (const e of g.enemies) {
        const sg = ctx.createRadialGradient(e.pos.x+3, e.pos.y+3, 0, e.pos.x+3, e.pos.y+3, e.size*2.5);
        sg.addColorStop(0, 'rgba(0,0,0,0.7)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(e.pos.x+3, e.pos.y+3, e.size*2.5, e.size*1.5, 0, 0, Math.PI*2); ctx.fill();
      }

      // Enemies
      for (const e of g.enemies) {
        const chasing = e.state === 'chase';
        const eG = ctx.createRadialGradient(e.pos.x, e.pos.y, 0, e.pos.x, e.pos.y, e.size*(chasing?3.5:2.5));
        eG.addColorStop(0, e.color+(chasing?'cc':'88')); eG.addColorStop(0.4, e.color+'44'); eG.addColorStop(1, e.color+'00');
        ctx.fillStyle = eG; ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.size*(chasing?3.5:2.5), 0, Math.PI*2); ctx.fill();

        if (e.type === 'sentinel') {
          ctx.fillStyle = e.color; ctx.beginPath();
          ctx.moveTo(e.pos.x, e.pos.y-e.size); ctx.lineTo(e.pos.x+e.size, e.pos.y); ctx.lineTo(e.pos.x, e.pos.y+e.size); ctx.lineTo(e.pos.x-e.size, e.pos.y);
          ctx.closePath(); ctx.fill();
        } else if (e.type === 'ghost') {
          const wp = 0.5 + 0.5 * Math.sin(e.pulsePhase);
          ctx.fillStyle = e.color+'cc'; ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y-2, e.size, Math.PI, 0);
          ctx.lineTo(e.pos.x+e.size, e.pos.y+6);
          ctx.quadraticCurveTo(e.pos.x+e.size*0.5, e.pos.y+8+wp*3, e.pos.x, e.pos.y+6);
          ctx.quadraticCurveTo(e.pos.x-e.size*0.5, e.pos.y+8-wp*3, e.pos.x-e.size, e.pos.y+6);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.size, 0, Math.PI*2); ctx.fill();
          const eyeAng = e.target ? Math.atan2(e.target.y-e.pos.y, e.target.x-e.pos.x) : -Math.PI/2;
          ctx.fillStyle = chasing ? '#ffffff' : '#ffaaaa';
          ctx.beginPath(); ctx.arc(e.pos.x+Math.cos(eyeAng-0.4)*e.size*0.5, e.pos.y+Math.sin(eyeAng-0.4)*e.size*0.5, 2.5, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(e.pos.x+Math.cos(eyeAng+0.4)*e.size*0.5, e.pos.y+Math.sin(eyeAng+0.4)*e.size*0.5, 2.5, 0, Math.PI*2); ctx.fill();
        }
        if (e.state === 'alert' || e.state === 'chase') {
          ctx.fillStyle = e.state==='chase' ? '#ff4444' : '#ffaa00';
          ctx.font = 'bold 12px Oswald'; ctx.textAlign = 'center';
          ctx.fillText(e.state==='chase' ? '!' : '?', e.pos.x, e.pos.y-e.size-4);
        }
      }

      // Player shadow
      const p = g.player;
      {
        const psg = ctx.createRadialGradient(p.pos.x+3, p.pos.y+4, 0, p.pos.x+3, p.pos.y+4, p.size*3);
        psg.addColorStop(0, 'rgba(0,0,0,0.6)'); psg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = psg; ctx.beginPath(); ctx.ellipse(p.pos.x+3, p.pos.y+4, p.size*3, p.size*2, 0, 0, Math.PI*2); ctx.fill();
      }

      // Trail
      if (!p.hidden) {
        for (let i = 0; i < p.trail.length; i++) {
          ctx.fillStyle = `rgba(232,184,75,${(i/p.trail.length)*0.3})`;
          ctx.beginPath(); ctx.arc(p.trail[i].x, p.trail[i].y, p.size*(i/p.trail.length)*0.7, 0, Math.PI*2); ctx.fill();
        }
      }

      // Player
      if (!p.hidden || Math.floor(Date.now()/150) % 2 === 0) {
        ctx.globalAlpha = p.invulnerable > 0 ? 0.4 + 0.6*(Math.floor(Date.now()/80)%2) : 1;
        const pg = ctx.createRadialGradient(p.pos.x, p.pos.y, 0, p.pos.x, p.pos.y, p.size*2.5);
        pg.addColorStop(0, 'rgba(232,184,75,0.5)'); pg.addColorStop(1, 'rgba(232,184,75,0)');
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.size*2.5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = p.hidden ? '#4a7a4a' : '#e8b84b';
        ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(p.pos.x-2, p.pos.y-2, p.size*0.5, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Particles
      for (const pt of g.particles) {
        ctx.globalAlpha = pt.life/pt.maxLife; ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(pt.pos.x, pt.pos.y, pt.size*(pt.life/pt.maxLife), 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Darkness
      if (g.phase === 'playing') {
        const dg = ctx.createRadialGradient(p.pos.x, p.pos.y, 0, p.pos.x, p.pos.y, p.hidden?80:130);
        dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(0.6, 'rgba(0,0,0,0.2)'); dg.addColorStop(1, 'rgba(0,0,0,0.88)');
        ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
      }
      if (g.dangerLevel > 0.1) {
        const vg = ctx.createRadialGradient(W/2, H/2, W*0.3, W/2, H/2, W*0.8);
        vg.addColorStop(0, 'rgba(200,0,0,0)'); vg.addColorStop(1, `rgba(200,0,0,${g.dangerLevel*0.35})`);
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      }

      if (g.shakeTimer > 0) ctx.restore();
    }

    let lastTs = 0;
    function loop(ts: number) {
      if (ts - lastTs > 0) update();
      lastTs = ts;
      draw();
      animId = requestAnimationFrame(loop);
    }
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [initGame, spawnParticles]);

  const { phase, level, score, hp, maxHp, hidden, dangerLevel } = uiState;

  return (
    <div className="flex items-center justify-center w-screen h-screen bg-[#050609] scanlines">
      <div className="relative select-none" style={{ width: 800, height: 560 }}>
        <canvas ref={canvasRef} width={800} height={560} className="block" style={{ imageRendering: 'pixelated' }} />
        <div className="noise-overlay" />
        <div className="vignette" />

        {/* HUD */}
        {phase === 'playing' && (
          <>
            <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none">
              <div className="hud-panel px-4 py-2 rounded">
                <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(232,184,75,0.6)', fontFamily: 'Oswald' }}>Уровень</div>
                <div className="text-2xl font-bold" style={{ color: '#e8b84b', fontFamily: 'Oswald', textShadow: '0 0 10px rgba(232,184,75,0.8)' }}>{String(level).padStart(2,'0')}</div>
              </div>
              <div className="hud-panel px-4 py-2 rounded text-center">
                <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(232,184,75,0.6)', fontFamily: 'Oswald' }}>Очки</div>
                <div className="text-xl font-bold" style={{ color: '#e8b84b', fontFamily: 'Oswald' }}>{score.toLocaleString()}</div>
              </div>
              <div className="hud-panel px-4 py-2 rounded">
                <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(232,184,75,0.6)', fontFamily: 'Oswald' }}>Жизни</div>
                <div className="flex gap-1.5 mt-1">
                  {Array.from({ length: maxHp }).map((_, i) => (
                    <div key={i} className="w-4 h-4 rounded-sm transition-all duration-300"
                      style={{ background: i < hp ? '#cc3333' : '#1a1a1a', boxShadow: i < hp ? '0 0 6px #cc3333' : 'none', border: '1px solid rgba(204,51,51,0.4)' }} />
                  ))}
                </div>
              </div>
            </div>

            {dangerLevel > 0.05 && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 hud-panel px-3 py-1.5 rounded flex items-center gap-2">
                <span className="text-[10px] tracking-widest uppercase" style={{ color: '#ff4444', fontFamily: 'Oswald' }}>Опасность</span>
                <div className="w-24 h-1.5 bg-[#1a0000] rounded-full overflow-hidden">
                  <div className={dangerLevel > 0.7 ? 'danger-bar h-full rounded-full' : 'h-full rounded-full transition-all duration-100'}
                    style={{ width: `${dangerLevel*100}%`, background: 'linear-gradient(90deg,#cc3333,#ff4444)', boxShadow: `0 0 8px rgba(255,68,68,${dangerLevel})` }} />
                </div>
              </div>
            )}

            {hidden && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 hud-panel px-4 py-2 rounded flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: '#44ff88', boxShadow: '0 0 8px #44ff88' }} />
                <span className="text-[10px] tracking-widest uppercase" style={{ color: '#44ff88', fontFamily: 'Oswald', textShadow: '0 0 10px rgba(68,255,136,0.8)' }}>Укрыт — нажми E чтобы выйти</span>
              </div>
            )}
            {!hidden && (
              <div className="absolute bottom-4 left-4 hud-panel px-3 py-1.5 rounded">
                <span className="text-[10px]" style={{ color: 'rgba(232,184,75,0.4)', fontFamily: 'IBM Plex Sans' }}>
                  <span style={{ color: 'rgba(232,184,75,0.65)' }}>WASD / ↑↓←→</span> — движение &nbsp;|&nbsp; <span style={{ color: 'rgba(232,184,75,0.65)' }}>E</span> — укрытие
                </span>
              </div>
            )}
          </>
        )}

        {/* MENU */}
        {phase === 'menu' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,0.85),rgba(0,0,0,0.96))' }}>
            <div className="text-center mb-8">
              <div className="text-[10px] tracking-[0.5em] uppercase mb-3" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>Тактический побег · 2026</div>
              <h1 className="text-6xl font-bold mb-1" style={{ color: '#e8b84b', fontFamily: 'Oswald', letterSpacing: '0.06em', textShadow: '0 0 30px rgba(232,184,75,0.5)' }}>SHADOW</h1>
              <h2 className="text-4xl font-light" style={{ color: 'rgba(232,184,75,0.65)', fontFamily: 'Oswald', letterSpacing: '0.35em' }}>ESCAPE</h2>
              <div className="mt-4 w-32 mx-auto h-px" style={{ background: 'linear-gradient(90deg,transparent,#e8b84b,transparent)' }} />
            </div>
            <p className="text-sm mb-8 max-w-xs text-center leading-6" style={{ color: 'rgba(232,184,75,0.45)', fontFamily: 'IBM Plex Sans' }}>
              Уклоняйся от существ, прячься в укрытиях. 5 уровней нарастающего напряжения.
            </p>
            <button onClick={() => initGame(1)} className="btn-game px-10 py-4 rounded font-bold tracking-widest uppercase text-xl mb-8"
              style={{ background: 'linear-gradient(135deg,#e8b84b,#c99520)', color: '#0a0c10', fontFamily: 'Oswald', boxShadow: '0 0 30px rgba(232,184,75,0.3),0 4px 15px rgba(0,0,0,0.5)' }}>
              Начать игру
            </button>
            <div className="grid grid-cols-4 gap-5 text-center">
              {[['Патруль','#cc3333'],['Охотник','#8833cc'],['Призрак','#33aacc'],['Страж','#ff8800']].map(([name,color]) => (
                <div key={name} className="flex flex-col items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                  <span className="text-[10px] tracking-widest uppercase" style={{ color: color+'aa', fontFamily: 'Oswald' }}>{name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DEAD */}
        {phase === 'dead' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(180deg,rgba(40,0,0,0.92),rgba(0,0,0,0.97))' }}>
            <div className="text-center mb-8">
              <div className="text-[10px] tracking-[0.5em] uppercase mb-4" style={{ color: 'rgba(255,68,68,0.5)', fontFamily: 'Oswald' }}>Конец</div>
              <h1 className="text-5xl font-bold" style={{ color: '#ff4444', fontFamily: 'Oswald', textShadow: '0 0 20px rgba(255,68,68,0.8)' }}>ВЫ ПОЙМАНЫ</h1>
              <div className="mt-3 w-48 mx-auto h-px" style={{ background: 'linear-gradient(90deg,transparent,#ff4444,transparent)' }} />
            </div>
            <div className="hud-panel px-8 py-4 rounded mb-8 text-center">
              <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>Уровень</div>
              <div className="text-3xl font-bold" style={{ color: '#e8b84b', fontFamily: 'Oswald' }}>{level}</div>
              <div className="text-[10px] tracking-widest uppercase mt-2" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>Очки</div>
              <div className="text-xl" style={{ color: '#e8b84b', fontFamily: 'Oswald' }}>{score.toLocaleString()}</div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => initGame(level)} className="btn-game px-8 py-3 rounded font-bold tracking-widest uppercase"
                style={{ background: 'linear-gradient(135deg,#cc3333,#991111)', color:'#fff', fontFamily:'Oswald', boxShadow:'0 0 20px rgba(204,51,51,0.3)' }}>
                Уровень заново
              </button>
              <button onClick={() => { if(gameRef.current) gameRef.current.score=0; initGame(1); }} className="btn-game px-8 py-3 rounded font-bold tracking-widest uppercase"
                style={{ background: 'linear-gradient(135deg,#252d3a,#1a1f2a)', color:'#e8b84b', fontFamily:'Oswald', border:'1px solid rgba(232,184,75,0.3)' }}>
                С начала
              </button>
            </div>
          </div>
        )}

        {/* WIN */}
        {phase === 'win' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(180deg,rgba(0,20,10,0.92),rgba(0,0,0,0.97))' }}>
            <div className="text-center mb-8">
              <div className="text-[10px] tracking-[0.5em] uppercase mb-4" style={{ color: 'rgba(68,255,136,0.5)', fontFamily: 'Oswald' }}>Победа</div>
              <h1 className="text-5xl font-bold" style={{ color: '#44ff88', fontFamily: 'Oswald', textShadow: '0 0 20px rgba(68,255,136,0.8)' }}>ПОБЕГ УДАЛСЯ</h1>
              <div className="mt-3 w-48 mx-auto h-px" style={{ background: 'linear-gradient(90deg,transparent,#44ff88,transparent)' }} />
            </div>
            <div className="hud-panel px-8 py-4 rounded mb-8 text-center">
              <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'Oswald' }}>Итоговый счёт</div>
              <div className="text-4xl font-bold" style={{ color: '#e8b84b', fontFamily: 'Oswald', textShadow: '0 0 10px rgba(232,184,75,0.8)' }}>{score.toLocaleString()}</div>
            </div>
            <button onClick={() => { if(gameRef.current) gameRef.current.score=0; setUiState(s=>({...s,phase:'menu'})); if(gameRef.current) gameRef.current.phase='menu'; }}
              className="btn-game px-10 py-4 rounded font-bold tracking-widest uppercase text-xl"
              style={{ background: 'linear-gradient(135deg,#44ff88,#22cc66)', color:'#0a0c10', fontFamily:'Oswald', boxShadow:'0 0 30px rgba(68,255,136,0.3)' }}>
              Играть снова
            </button>
          </div>
        )}

        {/* LEVEL UP */}
        {phase === 'levelup' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none level-flash">
            <div className="text-[10px] tracking-[0.5em] uppercase mb-3" style={{ color: 'rgba(232,184,75,0.6)', fontFamily: 'Oswald' }}>Следующий уровень</div>
            <div className="text-7xl font-bold" style={{ color: '#e8b84b', fontFamily: 'Oswald', textShadow: '0 0 40px rgba(232,184,75,0.8)' }}>{level + 1}</div>
            <div className="mt-2 text-sm" style={{ color: 'rgba(232,184,75,0.5)', fontFamily: 'IBM Plex Sans' }}>Готовься...</div>
          </div>
        )}
      </div>
    </div>
  );
}
