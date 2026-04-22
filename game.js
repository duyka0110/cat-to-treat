/**
 * Cat to Treat — vertical 9:16 *aspect* (logical coords below, not screen pixels).
 */

const BW = 13;
const BH = 15;
const QUEUE_SLOTS = 4;
const COLORS = /** @type {const} */ (['red', 'green', 'blue']);
const COLOR_HEX = { red: '#e74c3c', green: '#2ecc71', blue: '#3498db' };

const INNER = { x0: 0, y0: 0, x1: BW - 1, y1: BH - 1 };
const ROAD_MIN = { x: -1, y: -1 };
const ROAD_MAX = { x: BW, y: BH };

/** @typedef {'red'|'green'|'blue'} CatColor */


/**
 * @param {number} x
 * @param {number} y
 */
function isInner(x, y) {
  return x >= INNER.x0 && x <= INNER.x1 && y >= INNER.y0 && y <= INNER.y1;
}

/**
 * @param {number} x
 * @param {number} y
 */
function inRoadBounds(x, y) {
  return x >= ROAD_MIN.x && x <= ROAD_MAX.x && y >= ROAD_MIN.y && y <= ROAD_MAX.y;
}

/**
 * Exit lanes (not the puzzle board). Ring + connector to queue intake at top.
 * @param {number} x
 * @param {number} y
 */
function isRoadCell(x, y) {
  return inRoadBounds(x, y) && !isInner(x, y);
}

/**
 * @param {{x:number,y:number}[]} cells
 */
function cellsTouchRoad(cells) {
  return cells.some((c) => isRoadCell(c.x, c.y));
}

function keyOf(x, y) {
  return `${x},${y}`;
}

/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
function eqCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

/** @param {{x:number,y:number}[]} cells */
function copyCells(cells) {
  return cells.map((p) => ({ x: p.x, y: p.y }));
}

/**
 * Slide on the puzzle board only until blocked, or one step onto the road (exit) if queue has room.
 * Roads are not part of the board — exiting the rim hands off to auto exit-run.
 * @param {BoardCat[]} boardCats
 * @param {number} idx
 * @returns {{x:number,y:number}[][]}
 */
function computeSlidePath(boardCats, idx) {
  const cat = boardCats[idx];
  let working = copyCells(cat.cells);
  const path = [copyCells(working)];
  const maxSteps = 800;
  for (let step = 0; step < maxSteps; step++) {
    const head = working[0];
    const nh = { x: head.x + cat.dir.x, y: head.y + cat.dir.y };
    if (!inRoadBounds(nh.x, nh.y)) break;
    const newCells = [nh, ...working.slice(0, -1)];
    for (let j = 0; j < boardCats.length; j++) {
      if (j === idx) continue;
      for (const p of boardCats[j].cells) {
        for (const t of newCells) {
          if (eqCell(p, t)) return path;
        }
      }
    }
    if (isRoadCell(nh.x, nh.y)) {
      const free = game.queue.findIndex((s) => s === null);
      if (free < 0) break;
      path.push(copyCells(newCells));
      break;
    }
    if (!isInner(nh.x, nh.y)) break;
    working = newCells;
    path.push(copyCells(working));
  }
  return path;
}

/**
 * After touching the road: auto snake toward top intake (then queue + treats handle the rest).
 * @param {BoardCat} cat
 * @param {BoardCat[]} boardCats
 */
function computeExitPath(cat, boardCats) {
  let working = copyCells(cat.cells);
  const path = [copyCells(working)];
  for (let s = 0; s < 500; s++) {
    const head = working[0];
    const hd = EXIT_DIST.get(keyOf(head.x, head.y));
    if (hd === 0) break;
    if (hd === undefined) break;
    let best = null;
    let bestD = Infinity;
    for (const dd of ORTHO) {
      const nh = { x: head.x + dd.x, y: head.y + dd.y };
      if (!inRoadBounds(nh.x, nh.y)) continue;
      if (!isRoadCell(nh.x, nh.y)) continue;
      const d = EXIT_DIST.get(keyOf(nh.x, nh.y));
      if (d === undefined) continue;
      if (d < bestD) {
        bestD = d;
        best = nh;
      }
    }
    if (!best) break;
    const newCells = [best, ...working.slice(0, -1)];
    for (const o of boardCats) {
      for (const p of o.cells) {
        for (const t of newCells) {
          if (eqCell(p, t)) return path;
        }
      }
    }
    working = newCells;
    path.push(copyCells(working));
    if (bestD === 0) break;
  }
  return path;
}

/**
 * @param {BoardCat} cat
 * @param {number} now
 * @param {{path: {x:number,y:number}[][], stepDur: number, t0: number}} a
 */
function cellsForMoveAnim(cat, now, a) {
  const n = a.path.length;
  if (n < 2) return cat.cells;
  const totalDur = a.stepDur * (n - 1);
  let u = totalDur > 0 ? (now - a.t0) / totalDur : 1;
  u = Math.min(1, Math.max(0, u));
  const f = u * (n - 1);
  const seg = Math.min(Math.floor(f), n - 2);
  const localT = f - seg;
  const ease = localT * localT * (3 - 2 * localT);
  const from = a.path[seg];
  const to = a.path[seg + 1];
  /** @type {{x:number,y:number}[]} */
  const out = [];
  for (let i = 0; i < from.length; i++) {
    out.push({
      x: from[i].x + (to[i].x - from[i].x) * ease,
      y: from[i].y + (to[i].y - from[i].y) * ease,
    });
  }
  return out;
}

/**
 * @param {{path: {x:number,y:number}[][], stepDur: number, t0: number}} a
 * @param {number} now
 */
function exitRunHeadDir(a, now) {
  const n = a.path.length;
  if (n < 2) return { x: 0, y: 1 };
  const totalDur = a.stepDur * (n - 1);
  const u = totalDur > 0 ? Math.min(1, Math.max(0, (now - a.t0) / totalDur)) : 1;
  const f = u * (n - 1);
  const seg = Math.min(Math.floor(f), n - 2);
  const from = a.path[seg];
  const to = a.path[seg + 1];
  const dx = to[0].x - from[0].x;
  const dy = to[0].y - from[0].y;
  return {
    x: dx === 0 ? 0 : dx / Math.abs(dx),
    y: dy === 0 ? 0 : dy / Math.abs(dy),
  };
}

/** @param {{x:number,y:number}[]} cells */
function normalizeShape(cells) {
  let minx = Infinity,
    miny = Infinity;
  for (const c of cells) {
    minx = Math.min(minx, c.x);
    miny = Math.min(miny, c.y);
  }
  return cells.map((c) => ({ x: c.x - minx, y: c.y - miny }));
}

/** @param {{x:number,y:number}[]} shape @param {number} x @param {number} y */
function placeShape(shape, x, y) {
  return shape.map((c) => ({ x: c.x + x, y: c.y + y }));
}

const ORTHO = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Multi-source BFS from top road intake — shortest steps to goal for auto exit. */
function buildExitDistanceField() {
  const dist = new Map();
  /** @type {{x:number,y:number}[]} */
  const q = [];
  const goalXs = [5, 6, 7, 8];
  const gy = ROAD_MIN.y;
  for (const gx of goalXs) {
    if (!isRoadCell(gx, gy)) continue;
    const k = keyOf(gx, gy);
    dist.set(k, 0);
    q.push({ x: gx, y: gy });
  }
  let qi = 0;
  while (qi < q.length) {
    const c = q[qi++];
    const d = dist.get(keyOf(c.x, c.y)) ?? 0;
    for (const dd of ORTHO) {
      const nx = c.x + dd.x;
      const ny = c.y + dd.y;
      if (!inRoadBounds(nx, ny)) continue;
      if (!isRoadCell(nx, ny)) continue;
      const nk = keyOf(nx, ny);
      if (dist.has(nk)) continue;
      dist.set(nk, d + 1);
      q.push({ x: nx, y: ny });
    }
  }
  return dist;
}

const EXIT_DIST = buildExitDistanceField();

/**
 * @param {{x:number,y:number}[]} cells
 * @returns {{head:{x:number,y:number}, dir:{x:number,y:number}, cells:{x:number,y:number}[]}|null}
 */
function deriveHeadAndDir(cells) {
  const set = new Set(cells.map((c) => keyOf(c.x, c.y)));
  /** @type {{x:number,y:number}[]} */
  const endpoints = [];
  for (const c of cells) {
    let deg = 0;
    for (const d of ORTHO) {
      if (set.has(keyOf(c.x + d.x, c.y + d.y))) deg++;
    }
    if (deg === 1) endpoints.push(c);
  }
  if (endpoints.length === 0) return null;
  const head = endpoints[Math.floor(Math.random() * endpoints.length)];
  let neck = null;
  for (const d of ORTHO) {
    const n = { x: head.x + d.x, y: head.y + d.y };
    if (set.has(keyOf(n.x, n.y))) {
      neck = d;
      break;
    }
  }
  if (!neck) return null;
  const dir = { x: -neck.x, y: -neck.y };
  /** @type {{x:number,y:number}[]} */
  const ordered = [head];
  let cur = head;
  const used = new Set([keyOf(head.x, head.y)]);
  while (ordered.length < cells.length) {
    let next = null;
    for (const d of ORTHO) {
      const t = { x: cur.x + d.x, y: cur.y + d.y };
      const k = keyOf(t.x, t.y);
      if (set.has(k) && !used.has(k)) {
        next = t;
        break;
      }
    }
    if (!next) break;
    ordered.push(next);
    used.add(keyOf(next.x, next.y));
    cur = next;
  }
  if (ordered.length !== cells.length) return null;
  return { head: ordered[0], dir, cells: ordered };
}

/** @returns {{x:number,y:number}[][]} */
function trominoShapes() {
  const straightH = normalizeShape([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ]);
  const straightV = normalizeShape([
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: 2 },
  ]);
  const L1 = normalizeShape([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ]);
  const L2 = normalizeShape([
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ]);
  const L3 = normalizeShape([
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ]);
  const L4 = normalizeShape([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ]);
  return [straightH, straightV, L1, L2, L3, L4];
}

/** @returns {{x:number,y:number}[][]} */
function dominoShapes() {
  return [
    normalizeShape([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]),
    normalizeShape([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ]),
  ];
}

/**
 * Invalid when a head A has any other head B in front of A on A's axis,
 * B is facing toward A, and B points in the exact opposite direction of A.
 * Blockers are intentionally ignored.
 * @param {Map<string, {head:{x:number,y:number}, dir:{x:number,y:number}}>} meta
 */
function hasHeadOnHeadConflict(meta) {
  const heads = [...meta.values()];
  for (let i = 0; i < heads.length; i++) {
    const a = heads[i];
    const ax = a.head.x;
    const ay = a.head.y;
    const adx = a.dir.x;
    const ady = a.dir.y;

    for (let j = 0; j < heads.length; j++) {
      if (i === j) continue;
      const b = heads[j];
      const bx = b.head.x;
      const by = b.head.y;
      const bdx = b.dir.x;
      const bdy = b.dir.y;

      const vertical = adx === 0;
      const sameAxisLine = vertical ? bx === ax : by === ay;
      if (!sameAxisLine) continue;

      // B must be in front of A along A's direction.
      const inFront = vertical ? (by - ay) * ady > 0 : (bx - ax) * adx > 0;
      if (!inFront) continue;

      // B must face toward A on that same line.
      const facesTowardA = vertical ? (ay - by) * bdy > 0 : (ax - bx) * bdx > 0;
      if (!facesTowardA) continue;

      // Opposite direction pair is invalid.
      const opposite = bdx === -adx && bdy === -ady;
      if (opposite) return true;
    }
  }
  return false;
}

/**
 * @param {{cells:{x:number,y:number}[], dir:{x:number,y:number}}[]} cats
 */
function hasDependencyCycle(cats) {
  const n = cats.length;
  if (n === 0) return false;
  /** @type {boolean[][]} */
  const adj = Array.from({ length: n }, () => Array(n).fill(false));
  for (let i = 0; i < n; i++) {
    const hi = cats[i].cells[0];
    const ni = { x: hi.x + cats[i].dir.x, y: hi.y + cats[i].dir.y };
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (cats[j].cells.some((c) => eqCell(c, ni))) adj[i][j] = true;
    }
  }
  const state = Array(n).fill(0);
  /** @param {number} u */
  function dfs(u) {
    state[u] = 1;
    for (let v = 0; v < n; v++) {
      if (!adj[u][v]) continue;
      if (state[v] === 1) return true;
      if (state[v] === 0 && dfs(v)) return true;
    }
    state[u] = 2;
    return false;
  }
  for (let i = 0; i < n; i++) {
    if (state[i] === 0 && dfs(i)) return true;
  }
  return false;
}

/**
 * @typedef {object} BoardCat
 * @property {number} id
 * @property {CatColor} color
 * @property {{x:number,y:number}[]} cells
 * @property {{x:number,y:number}} dir
 * @property {number} need
 */

/**
 * @typedef {object} QueuedCat
 * @property {number} id
 * @property {CatColor} color
 * @property {number} need
 * @property {number} slot
 */

/**
 * Greedy inner-clear simulation rejects many solvable puzzles (order matters).
 * We only enforce no head-on clashes and no dependency cycles.
 * @param {number} catCount
 * @param {number} deadlineMs
 * @returns {{cats: BoardCat[], treats: CatColor[]} | null}
 */
function tryGenerateLevelWithCount(catCount, deadlineMs) {
  /** @type {BoardCat[]} */
  const cats = [];
  const occupied = new Set();
  let idCounter = 1;
  const PLACE_TRIES = catCount >= 50 ? 80 : catCount >= 40 ? 120 : 320;

  for (let n = 0; n < catCount; n++) {
    if (performance.now() > deadlineMs) return null;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const len = Math.random() < 0.55 ? 2 : 3;
    const shapes = len === 2 ? dominoShapes() : trominoShapes();
    let placed = false;
    for (let attempt = 0; attempt < PLACE_TRIES && !placed; attempt++) {
      if ((attempt & 7) === 0 && performance.now() > deadlineMs) return null;
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const x = Math.floor(Math.random() * BW);
      const y = Math.floor(Math.random() * BH);
      const cells = placeShape(shape, x, y);
      if (!cells.every((c) => isInner(c.x, c.y))) continue;
      if (cells.some((c) => occupied.has(keyOf(c.x, c.y)))) continue;
      const hd = deriveHeadAndDir(cells);
      if (!hd) continue;
      const trial = {
        id: idCounter,
        color,
        cells: hd.cells,
        dir: hd.dir,
        need: len,
      };
      const others = cats.map((c) => ({ cells: c.cells, dir: c.dir }));
      const comb = [...others, { cells: trial.cells, dir: trial.dir }];
      const meta = new Map();
      comb.forEach((c, i) => {
        meta.set(String(i), { head: c.cells[0], dir: c.dir });
      });
      if (hasHeadOnHeadConflict(meta)) continue;
      if (hasDependencyCycle(comb)) continue;
      cats.push(trial);
      for (const c of cells) occupied.add(keyOf(c.x, c.y));
      idCounter++;
      placed = true;
    }
    if (!placed) return null;
  }

  const comb = cats.map((c) => ({ cells: c.cells, dir: c.dir }));
  if (hasDependencyCycle(comb)) return null;

  /** @type {CatColor[]} */
  const treats = [];
  for (const c of cats) {
    for (let i = 0; i < c.need; i++) treats.push(c.color);
  }
  for (let i = treats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [treats[i], treats[j]] = [treats[j], treats[i]];
  }
  return { cats, treats };
}

/** @returns {{cats: BoardCat[], treats: CatColor[]}} */
function fallbackLevel() {
  const cats = [
    {
      id: 1,
      color: /** @type {CatColor} */ ('red'),
      cells: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ],
      dir: { x: -1, y: 0 },
      need: 2,
    },
    {
      id: 2,
      color: /** @type {CatColor} */ ('green'),
      cells: [
        { x: 7, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 4 },
      ],
      dir: { x: 1, y: 0 },
      need: 3,
    },
    {
      id: 3,
      color: /** @type {CatColor} */ ('blue'),
      cells: [
        { x: 9, y: 10 },
        { x: 10, y: 10 },
      ],
      dir: { x: -1, y: 0 },
      need: 2,
    },
  ];
  const treats = /** @type {CatColor[]} */ ([]);
  for (const c of cats) for (let i = 0; i < c.need; i++) treats.push(c.color);
  for (let i = treats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [treats[i], treats[j]] = [treats[j], treats[i]];
  }
  return { cats, treats };
}

function generateLevel() {
  const start = performance.now();
  const BUDGET_MS = 140;
  const hardOrder = [];
  for (let c = 50; c >= 40; c--) hardOrder.push(c);
  for (let c = 39; c >= 30; c--) hardOrder.push(c);
  for (let c = 29; c >= 16; c--) hardOrder.push(c);

  for (let pass = 0; pass < 3; pass++) {
    const jitter = 40 + Math.floor(Math.random() * 11);
    const order = [jitter, ...hardOrder.filter((x) => x !== jitter)];
    for (const catCount of order) {
      if (performance.now() - start > BUDGET_MS) {
        return fallbackLevel();
      }
      const g = tryGenerateLevelWithCount(catCount, start + BUDGET_MS);
      if (g && g.cats.length) {
        return g;
      }
    }
  }
  return fallbackLevel();
}

// --- Rendering ---

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

/** Logical canvas size; aspect ratio 9:16. Scales to any display via CSS + backing store. */
const W = 360;
const H = 640;

const MAX_DPR = 2.5;

function syncCanvasToDisplay() {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w < 2 || h < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
}

syncCanvasToDisplay();
requestAnimationFrame(syncCanvasToDisplay);
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => syncCanvasToDisplay()).observe(canvas);
}
window.addEventListener('resize', syncCanvasToDisplay);

const layout = {
  dispenserFrac: 0.15,
  queueFrac: 0.1,
};

/**
 * @typedef {object} MoveAnim
 * @property {'move'} kind
 * @property {number} catId
 * @property {{x:number,y:number}[][]} path
 * @property {number} t0
 * @property {number} stepDur ms per grid step
 */

/**
 * @typedef {object} TreatAnim
 * @property {'treat'} kind
 * @property {number} slot
 * @property {CatColor} color
 * @property {number} t0
 * @property {number} dur
 */

/**
 * @typedef {object} DepartAnim
 * @property {'depart'} kind
 * @property {number} slot
 * @property {number} t0
 * @property {number} dur
 */

/**
 * @typedef {object} ExitRunAnim
 * @property {'exitRun'} kind
 * @property {number} catId
 * @property {CatColor} catColor
 * @property {number} catNeed
 * @property {{x:number,y:number}[][]} path
 * @property {number} t0
 * @property {number} stepDur
 * @property {number} slot
 */

/** @typedef {MoveAnim|TreatAnim|DepartAnim|ExitRunAnim} Anim */

const game = {
  /** @type {BoardCat[]} */
  boardCats: [],
  /** @type {CatColor[]} */
  treats: [],
  /** @type {(QueuedCat|null)[]} */
  queue: [null, null, null, null],
  /** @type {BoardCat[]} */
  pendingExits: [],
  status: /** @type {'playing'|'won'|'lost'} */ ('playing'),
  /** @type {Anim|null} */
  anim: null,
};

function resetGame() {
  const g = generateLevel();
  game.boardCats = g.cats.map((c) => ({
    ...c,
    cells: c.cells.map((p) => ({ ...p })),
    dir: { ...c.dir },
  }));
  game.treats = [...g.treats];
  game.queue = [null, null, null, null];
  game.pendingExits = [];
  game.status = 'playing';
  game.anim = null;
}

resetGame();

/**
 * @param {number} id
 */
function tryMoveCat(id) {
  if (game.status !== 'playing') return;
  if (game.anim?.kind === 'move' || game.anim?.kind === 'exitRun') return;
  const idx = game.boardCats.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const path = computeSlidePath(game.boardCats, idx);
  if (path.length < 2) return;
  const cat = game.boardCats[idx];
  cat.cells = copyCells(path[path.length - 1]);
  game.anim = {
    kind: 'move',
    catId: id,
    path,
    t0: performance.now(),
    stepDur: 70,
  };
}

/**
 * @param {number} now
 */
function finishMoveAnim(now) {
  const a = game.anim;
  if (!a || a.kind !== 'move') return;
  const n = a.path.length;
  const totalDur = a.stepDur * (n - 1);
  if (now < a.t0 + totalDur) return;
  game.anim = null;
  /** @type {BoardCat[]} */
  const stillBoard = [];
  for (const cat of game.boardCats) {
    if (cellsTouchRoad(cat.cells)) game.pendingExits.push(cat);
    else stillBoard.push(cat);
  }
  game.boardCats = stillBoard;
  checkEnd();
  tryAutoFeed();
  processPendingExit();
}

/**
 * Begin auto exit-run to waiting line when possible (queue slot + no other anim).
 */
function processPendingExit() {
  if (game.anim || game.status !== 'playing') return;
  if (game.pendingExits.length === 0) return;
  const slot = game.queue.findIndex((s) => s === null);
  if (slot < 0) return;
  const cat = game.pendingExits.shift();
  const path = computeExitPath(cat, game.boardCats);
  if (path.length < 2) {
    game.queue[slot] = {
      id: cat.id,
      color: cat.color,
      need: cat.need,
      slot,
    };
    tryAutoFeed();
    processPendingExit();
    return;
  }
  game.anim = {
    kind: 'exitRun',
    catId: cat.id,
    catColor: cat.color,
    catNeed: cat.need,
    path,
    slot,
    t0: performance.now(),
    stepDur: 52,
  };
}

function finishExitRunAnim(now) {
  const a = game.anim;
  if (!a || a.kind !== 'exitRun') return;
  const n = a.path.length;
  const totalDur = n < 2 ? 0 : a.stepDur * (n - 1);
  if (now < a.t0 + totalDur) return;
  game.anim = null;
  game.queue[a.slot] = {
    id: a.catId,
    color: a.catColor,
    need: a.catNeed,
    slot: a.slot,
  };
  tryAutoFeed();
  processPendingExit();
  checkEnd();
}

/**
 * @param {CatColor} color
 * @param {number} slot
 */
function startTreatAnim(color, slot) {
  game.anim = {
    kind: 'treat',
    slot,
    color,
    t0: performance.now(),
    dur: 340,
  };
}

function tryAutoFeed() {
  if (game.status !== 'playing' || game.anim) return;
  if (game.treats.length === 0) {
    checkEnd();
    processPendingExit();
    return;
  }
  const front = game.treats[0];
  for (let s = 0; s < QUEUE_SLOTS; s++) {
    const qc = game.queue[s];
    if (!qc) continue;
    if (qc.need <= 0) continue;
    if (qc.color !== front) continue;
    game.treats.shift();
    qc.need--;
    startTreatAnim(front, s);
    return;
  }
  checkEnd();
  processPendingExit();
}

/**
 * @param {number} now
 */
function onTreatAnimComplete(now) {
  const a = game.anim;
  if (!a || a.kind !== 'treat') return;
  if (now < a.t0 + a.dur) return;
  const slot = a.slot;
  const qc = game.queue[slot];
  game.anim = null;
  if (qc && qc.need <= 0) {
    game.anim = { kind: 'depart', slot, t0: now, dur: 420 };
    return;
  }
  tryAutoFeed();
}

/**
 * @param {number} now
 */
function onDepartAnimComplete(now) {
  const a = game.anim;
  if (!a || a.kind !== 'depart') return;
  if (now < a.t0 + a.dur) return;
  game.queue[a.slot] = null;
  game.anim = null;
  tryAutoFeed();
  processPendingExit();
  checkEnd();
}

/**
 * @param {number} now
 */
function tickAnims(now) {
  if (game.anim?.kind === 'move') finishMoveAnim(now);
  else if (game.anim?.kind === 'exitRun') finishExitRunAnim(now);
  else if (game.anim?.kind === 'treat') onTreatAnimComplete(now);
  else if (game.anim?.kind === 'depart') onDepartAnimComplete(now);
}

function checkEnd() {
  if (game.status !== 'playing') return;
  if (
    game.treats.length === 0 &&
    game.boardCats.length === 0 &&
    game.queue.every((q) => q === null)
  ) {
    game.status = 'won';
    return;
  }
  if (game.treats.length === 0) {
    return;
  }
  const full = game.queue.every((q) => q !== null);
  if (!full) return;
  const front = game.treats[0];
  let any = false;
  for (const q of game.queue) {
    if (q && q.need > 0 && q.color === front) any = true;
  }
  if (!any) game.status = 'lost';
}

/** @returns {{x0:number,y0:number,cell:number,gw:number,gh:number,dispH:number,qH:number,qTop:number}} */
function computeLayout() {
  const dispH = H * layout.dispenserFrac;
  const qH = H * layout.queueFrac;
  const qTop = dispH;
  const midH = H - dispH - qH;
  const cell = Math.min(W / (BW + 2), midH / (BH + 2));
  const gw = cell * (BW + 2);
  const gh = cell * (BH + 2);
  const x0 = (W - gw) / 2;
  const y0 = dispH + qH + (midH - gh) / 2;
  return { x0, y0, cell, gw, gh, dispH, qH, qTop };
}

/**
 * @param {number} gx
 * @param {number} gy
 * @param {{x0:number,y0:number,cell:number}} L
 */
function gridToScreen(gx, gy, L) {
  const ox = 1;
  const oy = 1;
  const sx = L.x0 + (gx + ox) * L.cell;
  const sy = L.y0 + (gy + oy) * L.cell;
  return { sx, sy };
}

/**
 * @param {BoardCat} cat
 * @param {{x:number,y:number}[]} cells
 * @param {{x0:number,y0:number,cell:number}} L
 * @param {number} t01 move interpolation 0..1
 */
function drawCatBody(cat, cells, L, t01) {
  const topo = new Map();
  for (const c of cells) {
    const rx = Math.round(c.x);
    const ry = Math.round(c.y);
    const { sx, sy } = gridToScreen(c.x, c.y, L);
    topo.set(keyOf(rx, ry), { sx, sy, rx, ry });
  }

  ctx.save();
  ctx.fillStyle = COLOR_HEX[cat.color];

  // Solid body, no spacing between squares.
  for (const c of topo.values()) {
    ctx.fillRect(c.sx, c.sy, L.cell, L.cell);
  }

  // Thin inner borders between connected squares.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, L.cell * 0.06);
  ctx.beginPath();
  for (const c of topo.values()) {
    if (topo.has(keyOf(c.rx + 1, c.ry))) {
      const x = c.sx + L.cell;
      ctx.moveTo(x, c.sy);
      ctx.lineTo(x, c.sy + L.cell);
    }
    if (topo.has(keyOf(c.rx, c.ry + 1))) {
      const y = c.sy + L.cell;
      ctx.moveTo(c.sx, y);
      ctx.lineTo(c.sx + L.cell, y);
    }
  }
  ctx.stroke();

  // Bold outer contour of the whole cat silhouette.
  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(2.25, L.cell * 0.12);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const c of topo.values()) {
    if (!topo.has(keyOf(c.rx - 1, c.ry))) {
      ctx.moveTo(c.sx, c.sy);
      ctx.lineTo(c.sx, c.sy + L.cell);
    }
    if (!topo.has(keyOf(c.rx + 1, c.ry))) {
      ctx.moveTo(c.sx + L.cell, c.sy);
      ctx.lineTo(c.sx + L.cell, c.sy + L.cell);
    }
    if (!topo.has(keyOf(c.rx, c.ry - 1))) {
      ctx.moveTo(c.sx, c.sy);
      ctx.lineTo(c.sx + L.cell, c.sy);
    }
    if (!topo.has(keyOf(c.rx, c.ry + 1))) {
      ctx.moveTo(c.sx, c.sy + L.cell);
      ctx.lineTo(c.sx + L.cell, c.sy + L.cell);
    }
  }
  ctx.stroke();

  // Draw direction arrow on head (use original head cell for smooth animation).
  const head = cells[0];
  const { sx, sy } = gridToScreen(head.x, head.y, L);
  drawHeadArrow(cat, sx, sy, L, t01);

  ctx.restore();
}

/**
 * @param {BoardCat} cat
 */
function drawHeadArrow(cat, sx, sy, L, t01) {
  const cx = sx + L.cell / 2;
  const cy = sy + L.cell / 2;
  const len = L.cell * 0.28;
  const dx = cat.dir.x * len;
  const dy = cat.dir.y * len;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - dx * 0.2, cy - dy * 0.2);
  ctx.lineTo(cx + dx, cy + dy);
  ctx.stroke();
  const ah = L.cell * 0.12;
  const bx = cx + dx;
  const by = cy + dy;
  const px = -cat.dir.y;
  const py = cat.dir.x;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - dx * 0.35 + px * ah, by - dy * 0.35 + py * ah);
  ctx.lineTo(bx - dx * 0.35 - px * ah, by - dy * 0.35 - py * ah);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
}

/**
 * @param {CanvasRenderingContext2D} c
 */
function roundRect(c, x, y, w, h, r) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/**
 * @param {number} now
 */
function draw(now) {
  const L = computeLayout();
  ctx.clearRect(0, 0, W, H);

  // Dispenser
  ctx.fillStyle = '#1b1b2e';
  ctx.fillRect(0, 0, W, L.dispH);
  ctx.fillStyle = '#888';
  ctx.font = '600 13px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Food dispenser', W / 2, 18);
  const visibleTreats = Math.min(18, game.treats.length);
  const slotW = Math.min(24, (W - 24) / Math.max(10, visibleTreats));
  const startX = W / 2 - (visibleTreats * slotW) / 2;
  const dispenserY = 22;
  const dispenserH = Math.max(10, L.dispH - dispenserY - 4);
  for (let i = 0; i < visibleTreats; i++) {
    const col = game.treats[i];
    const x = startX + i * slotW;
    const y = dispenserY;
    ctx.fillStyle = '#2a2a40';
    roundRect(ctx, x, y, slotW - 4, dispenserH, 6);
    ctx.fill();
    ctx.fillStyle = COLOR_HEX[col];
    ctx.beginPath();
    ctx.arc(x + (slotW - 4) / 2, y + dispenserH / 2, slotW * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.treats.length > visibleTreats) {
    ctx.fillStyle = '#aaa';
    ctx.font = '11px system-ui';
    ctx.fillText(`+${game.treats.length - visibleTreats}`, W / 2, L.dispH - 8);
  }

  const qTop = L.qTop;
  ctx.fillStyle = '#1b1b2e';
  ctx.fillRect(0, qTop, W, L.qH);
  ctx.fillStyle = '#666';
  ctx.font = '600 12px system-ui,sans-serif';
  ctx.fillText('Waiting line', W / 2, qTop + 16);
  const qw = (W - 48) / QUEUE_SLOTS;
  for (let s = 0; s < QUEUE_SLOTS; s++) {
    const x = 24 + s * qw;
    const y = qTop + 28;
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, qw - 8, L.qH - 44, 10);
    ctx.stroke();
    const qc = game.queue[s];
    if (qc) {
      const cx = x + (qw - 8) / 2;
      const cy = y + (L.qH - 44) / 2;
      const scale = Math.min((qw - 8) * 0.85, (L.qH - 44) * 0.5) / 3;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale / (L.cell * 0.35), scale / (L.cell * 0.35));
      ctx.fillStyle = COLOR_HEX[qc.color];
      roundRect(ctx, -L.cell * 0.35, -L.cell * 0.35, L.cell * 0.7, L.cell * 0.7, 8);
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ccc';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${qc.need} left`, cx, y + (L.qH - 44) - 6);
    }
  }

  // Board background + road
  ctx.save();
  for (let gy = ROAD_MIN.y; gy <= ROAD_MAX.y; gy++) {
    for (let gx = ROAD_MIN.x; gx <= ROAD_MAX.x; gx++) {
      const { sx, sy } = gridToScreen(gx, gy, L);
      if (isInner(gx, gy)) {
        ctx.fillStyle = '#16213e';
        ctx.fillRect(sx, sy, L.cell + 0.5, L.cell + 0.5);
      } else if (isRoadCell(gx, gy)) {
        ctx.fillStyle = '#2e2839';
        ctx.fillRect(sx, sy, L.cell + 0.5, L.cell + 0.5);
        ctx.strokeStyle = '#4d4460';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, L.cell - 1, L.cell - 1);
      }
    }
  }
  ctx.restore();

  for (const cat of game.boardCats) {
    let cells = cat.cells;
    if (game.anim?.kind === 'move' && game.anim.catId === cat.id) {
      cells = cellsForMoveAnim(cat, now, game.anim);
    }
    drawCatBody(cat, cells, L, 1);
  }

  if (game.anim?.kind === 'exitRun') {
    const a = game.anim;
    const ghost = {
      id: a.catId,
      color: a.catColor,
      dir: exitRunHeadDir(a, now),
      cells: a.path[a.path.length - 1],
    };
    const cells = cellsForMoveAnim(ghost, now, a);
    drawCatBody(ghost, cells, L, 1);
  }

  // Treat fly anim
  if (game.anim?.kind === 'treat') {
    const a = game.anim;
    const u = Math.min(1, (now - a.t0) / a.dur);
    const ease2 = u * u * (3 - 2 * u);
    const slotW2 = Math.min(28, (W - 40) / 8);
    const fromX = W / 2;
    const fromY = dispenserY + dispenserH / 2;
    const qw2 = (W - 48) / QUEUE_SLOTS;
    const tx = 24 + a.slot * qw2 + (qw2 - 8) / 2;
    const ty = qTop + 28 + (L.qH - 44) / 2;
    const px = fromX + (tx - fromX) * ease2;
    const py = fromY + (ty - fromY) * ease2;
    ctx.fillStyle = COLOR_HEX[a.color];
    ctx.globalAlpha = 1 - u * 0.2;
    ctx.beginPath();
    ctx.arc(px, py, 12 * (1 - u * 0.3), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (game.anim?.kind === 'depart') {
    const a = game.anim;
    const u = Math.min(1, (now - a.t0) / a.dur);
    const qw2 = (W - 48) / QUEUE_SLOTS;
    const x = 24 + a.slot * qw2;
    const y = qTop + 28;
    ctx.fillStyle = `rgba(255,255,255,${0.15 * (1 - u)})`;
    roundRect(ctx, x, y, qw2 - 8, L.qH - 44, 10);
    ctx.fill();
  }

  if (game.status === 'won' || game.status === 'lost') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '700 22px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(game.status === 'won' ? 'You win!' : 'Try again', W / 2, H / 2 - 10);
    ctx.font = '14px system-ui';
    ctx.fillStyle = '#ccc';
    ctx.fillText('Tap to restart', W / 2, H / 2 + 18);
  }
}

/**
 * @param {number} sx
 * @param {number} sy
 * @param {number} now
 */
function pickCatAt(sx, sy, now) {
  const L = computeLayout();
  const margin = L.cell * 0.2;
  /** @type {number|null} */
  let best = null;
  let bestD = Infinity;
  for (const cat of game.boardCats) {
    const cells =
      game.anim?.kind === 'move' && game.anim.catId === cat.id
        ? cellsForMoveAnim(cat, now, game.anim)
        : cat.cells;
    for (const p of cells) {
      const { sx: cx, sy: cy } = gridToScreen(p.x, p.y, L);
      const cxm = cx + L.cell / 2;
      const cym = cy + L.cell / 2;
      if (
        sx >= cx - margin &&
        sx <= cx + L.cell + margin &&
        sy >= cy - margin &&
        sy <= cy + L.cell + margin
      ) {
        const d = Math.hypot(sx - cxm, sy - cym);
        if (d < bestD) {
          bestD = d;
          best = cat.id;
        }
      }
    }
  }
  return best;
}

function clientToCanvas(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width) * W,
    y: ((clientY - r.top) / r.height) * H,
  };
}

function onPointer(e) {
  const { x, y } = clientToCanvas(e.clientX, e.clientY);
  if (game.status === 'won' || game.status === 'lost') {
    resetGame();
    return;
  }
  const id = pickCatAt(x, y, performance.now());
  if (id != null) tryMoveCat(id);
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  onPointer(e);
});

function loop(now) {
  tickAnims(now);
  draw(now);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
