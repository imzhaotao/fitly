import { pointInPolygon, type Opening, type Plan, type Point, type RoomZone, type Space, type Wall } from '@fitly/layout-engine';
import type { TraceRoom, TraceWall } from '@fitly/layout-engine';

export interface RoomMeta {
  space: Space;
  name: string;
  skip?: boolean;
  /** 用户手动改过名字或类型：自动识别不再覆盖 */
  edited?: boolean;
  /** 从图上识别到的标注面积（㎡），用于核对比例 */
  labeledArea?: number;
}

export interface Scale {
  /** 每像素多少毫米（横向 / 纵向分别定比例） */
  sx: number;
  sy: number;
}

/** 门开向哪一侧：'a' = 横墙朝 +y / 竖墙朝 +x 的那一侧 */
export type GapSide = 'a' | 'b';

const r10 = (v: number) => Math.round(v / 10) * 10;

/** 像素 → 毫米 */
export function toMm(p: { x: number; y: number }, s: Scale): Point {
  return { x: p.x * s.sx, y: p.y * s.sy };
}

/** 墙两侧各取一点，看分别落在哪个房间（像素坐标） */
export function roomsBeside(w: TraceWall, rooms: TraceRoom[], along: number, off: number): [number, number] {
  const c = w.c;
  const pA = w.dir === 'h' ? { x: along, y: c + off } : { x: c + off, y: along };
  const pB = w.dir === 'h' ? { x: along, y: c - off } : { x: c - off, y: along };
  const find = (p: { x: number; y: number }) => rooms.findIndex((r) => pointInPolygon(p, r.polygon));
  return [find(pA), find(pB)];
}

/** 默认开门方向：开向面积较小的房间（卧室、卫生间的门一般往房间里开）；入户门开向室内 */
export function defaultGapSide(w: TraceWall, gap: { a0: number; a1: number }, rooms: TraceRoom[]): GapSide {
  const [ra, rb] = roomsBeside(w, rooms, (gap.a0 + gap.a1) / 2, w.thick / 2 + 6);
  if (ra < 0) return 'b';
  if (rb < 0) return 'a';
  return rooms[ra].areaPx <= rooms[rb].areaPx ? 'a' : 'b';
}

/** 描图结果 → 方案 */
export function buildPlanFromTrace(
  walls: TraceWall[],
  rooms: TraceRoom[],
  roomMeta: RoomMeta[],
  s: Scale,
  name: string,
): Omit<Plan, 'id'> {
  // 平移到左上角为原点
  const minX = Math.min(...walls.map((w) => (w.dir === 'h' ? w.a0 : w.c - w.thick / 2)));
  const minY = Math.min(...walls.map((w) => (w.dir === 'h' ? w.c - w.thick / 2 : w.a0)));
  const P = (x: number, y: number): Point => ({ x: r10((x - minX) * s.sx), y: r10((y - minY) * s.sy) });

  const keptRooms = rooms.map((r, i) => ({ r, m: roomMeta[i] })).filter((x) => x.m && !x.m.skip);
  const roomZones: RoomZone[] = keptRooms.map(({ r, m }, i) => ({
    id: `r-${i}`,
    space: m.space,
    name: m.name,
    polygon: r.polygon.map((p) => P(p.x, p.y)),
    floorMaterial: m.space === 'kitchen' || m.space === 'bath' || m.space === 'balcony' ? 'tile' : 'wood',
  }));

  const planWalls: Wall[] = [];
  const openings: Opening[] = [];
  for (const w of walls) {
    const sAlong = w.dir === 'h' ? s.sx : s.sy;
    const sThick = w.dir === 'h' ? s.sy : s.sx;
    const a = w.dir === 'h' ? P(w.a0, w.c) : P(w.c, w.a0);
    const b = w.dir === 'h' ? P(w.a1, w.c) : P(w.c, w.a1);
    const thickness = Math.max(80, Math.min(300, r10(w.thick * sThick)));
    // 一侧不在任何保留的房间里 → 外墙（3D 斜角视角下朝向相机时淡化）
    const [ra, rb] = roomsBeside(w, keptRooms.map((x) => x.r), (w.a0 + w.a1) / 2, w.thick / 2 + 8);
    planWalls.push({ id: w.id, a, b, thickness, exterior: ra < 0 || rb < 0 });
    for (const [gi, g] of w.gaps.entries()) {
      const gid = `${w.id}-g${gi}`;
      const offset = r10((g.a0 - w.a0) * sAlong);
      const width = r10((g.a1 - g.a0) * sAlong);
      if (g.kind === 'window') {
        openings.push({ id: gid, wallId: w.id, kind: 'window', offset, width, sillHeightMm: 900, height: 1500 });
        continue;
      }
      const o: Opening = { id: gid, wallId: w.id, kind: 'door', offset, width, height: 2100 };
      if (g.kind === 'door') {
        // 墙方向：h 为 +x（左法线朝 +y），v 为 +y（左法线朝 -x）
        const side = g.side ?? 'a';
        const towardPlus = side === 'a';
        const left = w.dir === 'h' ? towardPlus : !towardPlus;
        o.swing = { side: left ? 'left' : 'right', hinge: g.hinge ?? 'start' };
      }
      openings.push(o);
    }
  }

  const xs = planWalls.flatMap((w) => [w.a.x, w.b.x]);
  const ys = planWalls.flatMap((w) => [w.a.y, w.b.y]);
  const areaSqm = Math.round(((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / 1e5) / 10;

  return {
    version: 1,
    unit: 'mm',
    calibrated: true,
    meta: { name, layout: '按户型图描图生成', templateId: 'upload', areaSqm },
    rooms: roomZones,
    walls: planWalls,
    openings,
    anchors: [],
    fixtures: [],
    furniture: [],
  };
}
