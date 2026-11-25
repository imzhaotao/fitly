/**
 * 户型图描图（不用 AI）：从“墙体颜色掩膜”中提取横平竖直的墙段、墙上缺口（门窗）与房间。
 * 全部在图片像素坐标下计算，最后由调用方按比例换算成毫米。
 */

export interface Mask {
  w: number;
  h: number;
  /** 1 = 墙体像素 */
  data: Uint8Array;
}

export interface Band {
  dir: 'h' | 'v';
  /** 沿墙方向的起止 */
  a0: number;
  a1: number;
  /** 垂直墙方向的起止（墙厚范围） */
  t0: number;
  t1: number;
}

export interface TraceGap {
  /** 沿墙方向起止（像素） */
  a0: number;
  a1: number;
  kind: 'door' | 'window' | 'pass';
  /** 门开向哪一侧：'a' = 横墙朝 +y / 竖墙朝 +x */
  side?: 'a' | 'b';
  /** 铰链在缺口起点（start）还是终点（end） */
  hinge?: 'start' | 'end';
}

export interface TraceWall {
  id: string;
  dir: 'h' | 'v';
  /** 墙中线所在位置（h：y；v：x） */
  c: number;
  a0: number;
  a1: number;
  thick: number;
  gaps: TraceGap[];
}

export interface TraceRoom {
  id: string;
  /** 像素坐标的直角多边形（地面净区域） */
  polygon: { x: number; y: number }[];
  areaPx: number;
}

export interface DetectOptions {
  /** 最短墙段（像素） */
  minLen: number;
  /** 墙厚范围（像素） */
  minThick: number;
  maxThick: number;
  /** 缺口算门窗的长度范围（像素）；更短的视为噪点补齐，更长的拆成两段墙 */
  minGap: number;
  maxGap: number;
}

const at = (m: Mask, x: number, y: number) => m.data[y * m.w + x];

/** 掩膜转置（行列互换），用同一套逻辑找竖墙 */
function transpose(m: Mask): Mask {
  const out = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) out[x * m.h + y] = m.data[y * m.w + x];
  return { w: m.h, h: m.w, data: out };
}

/** 逐行找连续墙像素，把相邻行里起止相近的连成矩形带 */
function rowBands(m: Mask, o: DetectOptions): { a0: number; a1: number; t0: number; t1: number }[] {
  type Active = { a0: number; a1: number; t0: number; t1: number };
  const done: Active[] = [];
  let active: Active[] = [];
  const tol = 3;
  for (let y = 0; y <= m.h; y++) {
    const runs: [number, number][] = [];
    if (y < m.h) {
      let x = 0;
      while (x < m.w) {
        if (!at(m, x, y)) {
          x++;
          continue;
        }
        const s = x;
        while (x < m.w && at(m, x, y)) x++;
        if (x - s >= o.minLen) runs.push([s, x]);
      }
    }
    const next: Active[] = [];
    const used = new Set<Active>();
    for (const [s, e] of runs) {
      const r = active.find((a) => !used.has(a) && Math.abs(a.a0 - s) <= tol && Math.abs(a.a1 - e) <= tol);
      if (r) {
        used.add(r);
        r.t1 = y + 1;
        next.push(r);
      } else {
        next.push({ a0: s, a1: e, t0: y, t1: y + 1 });
      }
    }
    for (const a of active) if (!used.has(a)) done.push(a);
    active = next;
  }
  return done.filter((b) => {
    const t = b.t1 - b.t0;
    // 门窗两侧剩下的墙头往往只比墙厚长一点，也要保留，后面按共线合并成带缺口的整面墙
    return t >= o.minThick && t <= o.maxThick && b.a1 - b.a0 >= Math.max(o.minLen, t * 0.6);
  });
}

export function detectBands(m: Mask, o: DetectOptions): Band[] {
  const h = rowBands(m, o).map((b) => ({ dir: 'h' as const, ...b }));
  const v = rowBands(transpose(m), o).map((b) => ({ dir: 'v' as const, ...b }));
  return [...h, ...v];
}

/**
 * 同一条线上的墙带合并成一面墙：中线相近（半个墙厚内）即视为共线；
 * 墙带之间的空隙在 [minGap, maxGap] 内记为门窗缺口，更短的补齐，更长的拆成两面墙。
 */
export function bandsToWalls(bands: Band[], o: DetectOptions): TraceWall[] {
  const walls: TraceWall[] = [];
  let seq = 0;
  for (const dir of ['h', 'v'] as const) {
    const list = bands.filter((b) => b.dir === dir).sort((a, b) => (a.t0 + a.t1) / 2 - (b.t0 + b.t1) / 2);
    const clusters: Band[][] = [];
    for (const b of list) {
      const c = (b.t0 + b.t1) / 2;
      const t = b.t1 - b.t0;
      const cl = clusters.find((k) => {
        const kc = k.reduce((s, x) => s + (x.t0 + x.t1) / 2, 0) / k.length;
        const kt = Math.max(...k.map((x) => x.t1 - x.t0));
        return Math.abs(kc - c) <= Math.max(t, kt) / 2;
      });
      if (cl) cl.push(b);
      else clusters.push([b]);
    }
    for (const cl of clusters) {
      const thick = Math.max(...cl.map((x) => x.t1 - x.t0));
      // 只用够厚的墙带确定覆盖范围（窗户里的细线不算墙）
      const solid = cl.filter((x) => x.t1 - x.t0 >= thick * 0.5).sort((a, b) => a.a0 - b.a0);
      const c = solid.reduce((s, x) => s + (x.t0 + x.t1) / 2 * (x.a1 - x.a0), 0) / solid.reduce((s, x) => s + (x.a1 - x.a0), 0);
      let cur: TraceWall | null = null;
      for (const b of solid) {
        if (cur && b.a0 <= cur.a1 + o.maxGap) {
          const gap = b.a0 - cur.a1;
          if (gap >= o.minGap) cur.gaps.push({ a0: cur.a1, a1: b.a0, kind: 'door' });
          cur.a1 = Math.max(cur.a1, b.a1);
          continue;
        }
        if (cur) walls.push(cur);
        cur = { id: `tw${seq++}`, dir, c, a0: b.a0, a1: b.a1, thick, gaps: [] };
      }
      if (cur) walls.push(cur);
    }
  }
  return cleanupWalls(walls);
}

function wallRect(w: TraceWall) {
  return w.dir === 'h'
    ? { x0: w.a0, x1: w.a1, y0: w.c - w.thick / 2, y1: w.c + w.thick / 2 }
    : { x0: w.c - w.thick / 2, x1: w.c + w.thick / 2, y0: w.a0, y1: w.a1 };
}

/**
 * 清理识别结果：
 * 1. 紧挨着的平行墙（户型图里一面墙画成两条）合并成一面；
 * 2. 完全落在另一面墙里的短墙头（墙角、窗框残留）删掉。
 */
export function cleanupWalls(input: TraceWall[]): TraceWall[] {
  // 1. 删掉被别的墙完全包住的短墙头（先删，免得被并进正常墙里把墙变厚）
  const tol = 4;
  let walls = input.filter((w) => {
    if (w.a1 - w.a0 > w.thick * 3) return true;
    const r = wallRect(w);
    return !input.some((o) => {
      if (o === w) return false;
      const q = wallRect(o);
      return r.x0 >= q.x0 - tol && r.x1 <= q.x1 + tol && r.y0 >= q.y0 - tol && r.y1 <= q.y1 + tol;
    });
  });
  // 2. 合并贴在一起的平行墙（户型图里一面墙画成两条）
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const a = walls[i];
        const b = walls[j];
        if (a.dir !== b.dir) continue;
        if (Math.abs(a.c - b.c) > (a.thick + b.thick) / 2 + 3) continue;
        const ov = Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0);
        if (ov < 0.5 * Math.min(a.a1 - a.a0, b.a1 - b.a0)) continue;
        const t0 = Math.min(a.c - a.thick / 2, b.c - b.thick / 2);
        const t1 = Math.max(a.c + a.thick / 2, b.c + b.thick / 2);
        const keep = a.a1 - a.a0 >= b.a1 - b.a0 ? a : b;
        walls = [...walls];
        walls[i] = { ...keep, c: (t0 + t1) / 2, thick: t1 - t0, a0: Math.min(a.a0, b.a0), a1: Math.max(a.a1, b.a1) };
        walls.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return walls;
}

/** 墙（含缺口，缺口按“封闭”处理）栅格化，用于分房间 */
export function rasterizeWalls(walls: TraceWall[], w: number, h: number, cell: number) {
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  const g = new Uint8Array(gw * gh);
  for (const wl of walls) {
    const t0 = Math.floor((wl.c - wl.thick / 2) / cell);
    const t1 = Math.ceil((wl.c + wl.thick / 2) / cell);
    const a0 = Math.floor(wl.a0 / cell);
    const a1 = Math.ceil(wl.a1 / cell);
    for (let a = a0; a < a1; a++) {
      for (let t = t0; t < t1; t++) {
        const x = wl.dir === 'h' ? a : t;
        const y = wl.dir === 'h' ? t : a;
        if (x >= 0 && y >= 0 && x < gw && y < gh) g[y * gw + x] = 1;
      }
    }
  }
  return { g, gw, gh };
}

/** 一组栅格单元的外轮廓（直角多边形，顺时针，去掉共线点） */
export function traceRegion(cells: Set<number>, gw: number, cell: number): { x: number; y: number }[] {
  // 每个格子的 4 条边，若相邻格不在区域内则是边界边（按顺时针方向记录）
  const edges = new Map<string, string>();
  const key = (x: number, y: number) => `${x},${y}`;
  for (const id of cells) {
    const x = id % gw;
    const y = Math.floor(id / gw);
    if (!cells.has(id - gw) || y === 0) edges.set(key(x, y), key(x + 1, y)); // 上
    if (!cells.has(id + 1) || x === gw - 1) edges.set(key(x + 1, y), key(x + 1, y + 1)); // 右
    if (!cells.has(id + gw)) edges.set(key(x + 1, y + 1), key(x, y + 1)); // 下
    if (!cells.has(id - 1) || x === 0) edges.set(key(x, y + 1), key(x, y)); // 左
  }
  // 从最左上的点出发串成环，取最长的环作为外轮廓
  let best: string[] = [];
  const visited = new Set<string>();
  for (const start of edges.keys()) {
    if (visited.has(start)) continue;
    const loop: string[] = [];
    let p: string | undefined = start;
    while (p && !visited.has(p)) {
      visited.add(p);
      loop.push(p);
      p = edges.get(p);
    }
    if (loop.length > best.length) best = loop;
  }
  const pts = best.map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x: x * cell, y: y * cell };
  });
  // 去掉共线点
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[i];
    const c = pts[(i + 1) % pts.length];
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!collinear) out.push(b);
  }
  return out;
}

/** 墙围出来的封闭区域就是房间：从图片边缘泛洪标记“室外”，剩下的连通块逐个成为房间 */
export function detectRooms(walls: TraceWall[], w: number, h: number, cell: number, minAreaPx: number): TraceRoom[] {
  const { g, gw, gh } = rasterizeWalls(walls, w, h, cell);
  const label = new Int32Array(gw * gh).fill(-1);
  const OUT = 0;
  const flood = (seed: number, id: number) => {
    const stack = [seed];
    const cells: number[] = [];
    label[seed] = id;
    while (stack.length) {
      const i = stack.pop()!;
      cells.push(i);
      const x = i % gw;
      const y = (i - x) / gw;
      const nb = [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1];
      for (const n of nb) {
        if (n < 0 || g[n] || label[n] !== -1) continue;
        label[n] = id;
        stack.push(n);
      }
    }
    return cells;
  };
  for (let x = 0; x < gw; x++) {
    for (const y of [0, gh - 1]) {
      const i = y * gw + x;
      if (!g[i] && label[i] === -1) flood(i, OUT);
    }
  }
  for (let y = 0; y < gh; y++) {
    for (const x of [0, gw - 1]) {
      const i = y * gw + x;
      if (!g[i] && label[i] === -1) flood(i, OUT);
    }
  }
  const rooms: TraceRoom[] = [];
  let id = 1;
  for (let i = 0; i < gw * gh; i++) {
    if (g[i] || label[i] !== -1) continue;
    const cells = flood(i, id++);
    const areaPx = cells.length * cell * cell;
    if (areaPx < minAreaPx) continue;
    rooms.push({ id: `tr${id}`, polygon: traceRegion(new Set(cells), gw, cell), areaPx });
  }
  return rooms.sort((a, b) => b.areaPx - a.areaPx);
}

export interface GapGuess {
  kind: TraceGap['kind'];
  side?: 'a' | 'b';
  hinge?: 'start' | 'end';
  /** 门弧的清晰度（亮的 1/4 圆 + 弧线），用于调试 */
  score: number;
  disc?: number;
  arc?: number;
  leaf?: number;
}

/**
 * 判断缺口是门还是窗：户型图里门会画一段 1/4 圆弧（门扇开启轨迹），窗没有。
 * 以缺口两端为圆心、缺口宽为半径，在墙两侧各找一次“细线圆弧”：
 * 沿圆弧采样，比较弧线上与内外两侧的亮度差；差值稳定为正说明有弧线，即为门，
 * 弧在哪一侧、以哪一端为圆心，就是开门方向和铰链位置。
 * lumAt 返回原图在某点的亮度（0–255）。
 */
export function classifyGap(
  wall: TraceWall,
  gap: TraceGap,
  lumAt: (x: number, y: number) => number,
  /** 沿墙方向每像素多少毫米；给了就按单扇门 600–1100mm 的宽度过滤 */
  mmPerPx?: number,
): GapGuess {
  const width = gap.a1 - gap.a0;
  if (mmPerPx && (width * mmPerPx < 600 || width * mmPerPx > 1100)) return { kind: 'window', score: 0 };
  let best: GapGuess = { kind: 'window', score: 0 };
  for (const hinge of ['start', 'end'] as const) {
    for (const side of ['a', 'b'] as const) {
      const sgn = side === 'a' ? 1 : -1;
      const hingeAlong = hinge === 'start' ? gap.a0 : gap.a1;
      const toward = hinge === 'start' ? 1 : -1;
      const face = wall.c + (sgn * wall.thick) / 2;
      const at = (r: number, th: number) => {
        const a = hingeAlong + toward * Math.cos(th) * r;
        const c = face + sgn * Math.sin(th) * r;
        return wall.dir === 'h' ? lumAt(a, c) : lumAt(c, a);
      };
      const R = width * 0.95;
      const angles = [25, 35, 45, 55, 65].map((d) => (d * Math.PI) / 180);
      const mean = (rs: number[]) => {
        let s2 = 0;
        for (const r of rs) for (const th of angles) s2 += at(r * R, th);
        return s2 / (rs.length * angles.length);
      };
      // 门扇扫过的 1/4 圆通常画成半透明白色，比圆外的地面亮
      const disc = mean([0.35, 0.5, 0.65, 0.8]) - mean([1.12, 1.22, 1.32]);
      // 圆弧边线：细线比两侧暗
      let arc = 0;
      for (let r = Math.round(width * 0.75); r <= Math.round(width * 1.1); r++) {
        let sum = 0;
        for (let k = 0; k <= 10; k++) {
          const th = ((30 + k * 5) * Math.PI) / 180;
          sum += (at(r - 2, th) + at(r + 2, th)) / 2 - at(r, th);
        }
        arc = Math.max(arc, sum / 11);
      }
      // 门扇本身：从铰链垂直于墙伸出、长度约等于门宽的一条直线（亮暗分界或细线）
      let leaf = 0;
      for (let o = -3; o <= 3; o++) {
        let sum = 0;
        let n = 0;
        for (let t = R * 0.15; t <= R * 0.9; t += Math.max(1, R / 30)) {
          const p = (d: number) => {
            const a = hingeAlong + toward * (o + d);
            const c = face + sgn * t;
            return wall.dir === 'h' ? lumAt(a, c) : lumAt(c, a);
          };
          const l = p(-2);
          const m = p(0);
          const r = p(2);
          sum += Math.max(Math.abs(l - r), (l + r) / 2 - m);
          n++;
        }
        leaf = Math.max(leaf, sum / n);
      }
      const score = Math.max(0, disc) + arc + leaf;
      // 门 = 有门扇直线，且有圆弧线或亮的 1/4 圆（贴着墙角的窗只会有一条直边，没有弧）
      const isDoor = leaf >= 20 && (arc >= 8 || disc >= 10);
      if (isDoor && score > best.score) best = { kind: 'door', side, hinge, score, disc, arc, leaf };
    }
  }
  // 没有门的特征就当窗（推拉门、门洞由用户点一下改）
  return best;
}
