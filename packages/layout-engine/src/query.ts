import {
  anchorPolygon,
  centroid,
  directionalGap,
  distance,
  doorSwing,
  edgeGap,
  heightOverlap,
  intersects,
  openingPolygon,
  pointInPolygon,
  resolveAnchorPoint,
  toPolygons,
  wallPolygon,
  type Poly,
} from './geometry';
import type {
  Face,
  FurnitureItem,
  FurnitureVariant,
  GeomHit,
  GeometryQuery,
  Plan,
  Point,
  QueryScope,
  Sel,
} from './types';

interface Entity {
  id: string;
  kind: 'item' | 'anchor' | 'wall' | 'opening';
  polys: Poly[];
  z: [number, number];
  roomId?: string;
  item?: FurnitureItem;
  heightMm?: number;
  confirmed?: boolean;
}

/** 物件所在房间：取中心点所在的房间多边形 */
export function roomOfPoint(plan: Plan, p: Point): string | undefined {
  return plan.rooms.find((r) => pointInPolygon(p, r.polygon))?.id;
}

export function roomOfItem(plan: Plan, item: FurnitureItem): string | undefined {
  return roomOfPoint(plan, { x: item.x, y: item.y });
}

export function roomOfAnchor(plan: Plan, anchorId: string): string | undefined {
  const a = plan.anchors.find((x) => x.id === anchorId);
  if (!a) return undefined;
  const poly = anchorPolygon(a, plan.walls);
  if (!poly) return undefined;
  // 往房间内侧再推一点，避免点位正好落在墙面边界上
  const c = centroid(poly);
  const p = resolveAnchorPoint(a, plan.walls)!;
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return roomOfPoint(plan, { x: p.x + (dx / len) * 60, y: p.y + (dy / len) * 60 });
}

const OVERLAP_TOL = 25;
const SOCKET_HALF = 43;

export function createQuery(plan: Plan, scope: QueryScope = {}): GeometryQuery {
  const items = [...plan.furniture, ...plan.fixtures];
  const itemRoom = new Map(items.map((it) => [it.id, roomOfItem(plan, it)]));
  const selected = scope.selectedId ? items.find((i) => i.id === scope.selectedId) : undefined;
  const scopeRoom = scope.roomId ?? (selected ? itemRoom.get(selected.id) : undefined);

  const itemEntity = (it: FurnitureItem): Entity => ({
    id: it.id,
    kind: 'item',
    polys: toPolygons(it),
    z: [it.z ?? 0, (it.z ?? 0) + it.h],
    roomId: itemRoom.get(it.id),
    item: it,
  });

  function resolve(sel: Sel): Entity[] {
    if ('current' in sel) return selected ? [itemEntity(selected)] : [];
    if ('id' in sel) {
      const it = items.find((i) => i.id === sel.id);
      if (it) return [itemEntity(it)];
      const a = plan.anchors.find((x) => x.id === sel.id);
      if (a) return anchorEntities([a.id]);
      return [];
    }
    if ('type' in sel) {
      if (selected && selected.type === sel.type) return [itemEntity(selected)];
      return items
        .filter((i) => i.type === sel.type)
        .filter((i) => !scopeRoom || itemRoom.get(i.id) === scopeRoom)
        .map(itemEntity);
    }
    if ('anchor' in sel) {
      const ids = plan.anchors.filter((a) => a.kind === sel.anchor).map((a) => a.id);
      return anchorEntities(ids).filter((e) => !scopeRoom || e.roomId === scopeRoom);
    }
    if ('wallKind' in sel) {
      if (sel.wallKind === 'wall') {
        return plan.walls.map((w) => ({
          id: w.id,
          kind: 'wall' as const,
          polys: [wallPolygon(w)],
          z: [0, w.heightMm ?? 2800] as [number, number],
        }));
      }
      return plan.openings
        .filter((o) => o.kind === sel.wallKind)
        .map((o): Entity | null => {
          const poly = openingPolygon(o, plan.walls);
          return poly
            ? {
                id: o.id,
                kind: 'opening',
                polys: [poly],
                z: [o.sillHeightMm ?? 0, (o.sillHeightMm ?? 0) + (o.height ?? 2100)],
              }
            : null;
        })
        .filter((x): x is Entity => x !== null);
    }
    return [];
  }

  function anchorEntities(ids: string[]): Entity[] {
    const out: Entity[] = [];
    for (const id of ids) {
      const a = plan.anchors.find((x) => x.id === id)!;
      const poly = anchorPolygon(a, plan.walls);
      if (!poly) continue;
      const h = a.heightMm;
      out.push({
        id: a.id,
        kind: 'anchor',
        polys: [poly],
        // 点位缺少高度时视为全高，只做平面判断
        z: h == null ? [0, 2800] : [h - SOCKET_HALF, h + SOCKET_HALF],
        roomId: roomOfAnchor(plan, a.id),
        heightMm: h,
        confirmed: a.confirmed,
      });
    }
    return out;
  }

  function sameRoom(a: Entity, b: Entity): boolean {
    if (!a.roomId || !b.roomId) return true;
    return a.roomId === b.roomId;
  }

  function pairwise(
    from: Sel,
    to: Sel,
    measure: (a: Entity, b: Entity) => { gap: number; witness: [Point, Point] } | null,
    checkHeight?: boolean,
  ): GeomHit | null {
    if (!plan.calibrated) return null;
    const A = resolve(from);
    const B = resolve(to);
    if (A.length === 0 || B.length === 0) return null;
    let best: GeomHit | null = null;
    let candidate = false;
    for (const a of A) {
      for (const b of B) {
        if (a.id === b.id || !sameRoom(a, b)) continue;
        candidate = true;
        if (checkHeight && !heightOverlap(a.z, b.z)) continue;
        const m = measure(a, b);
        if (!m) continue;
        if (!best || m.gap < best.valueMm) {
          best = { valueMm: Math.round(m.gap), fromId: a.id, targetId: b.id, witness: m.witness };
        }
      }
    }
    if (best) return best;
    return candidate ? { valueMm: Infinity } : null;
  }

  return {
    clearance(from, to, opts) {
      const face: Face = opts?.face ?? 'any';
      return pairwise(
        from,
        to,
        (a, b) => {
          if (face === 'any' || !a.item) return edgeGap(a.polys, b.polys);
          return directionalGap(a.item, face, b.polys);
        },
        opts?.checkHeight,
      );
    },
    distance(a, b, opts) {
      return pairwise(a, b, (x, y) => edgeGap(x.polys, y.polys), opts?.checkHeight);
    },
    overlap(a, b, opts) {
      const hit = pairwise(
        a,
        b,
        (x, y) => {
          const g = edgeGap(x.polys, y.polys);
          return g.gap <= OVERLAP_TOL ? g : null;
        },
        opts?.checkHeight,
      );
      if (hit && Number.isFinite(hit.valueMm)) return { ...hit, valueMm: 0 };
      return hit;
    },
    sweepBlocked(door, blockedBy) {
      if (!plan.calibrated) return null;
      const doors = 'wallKind' in door || 'id' in door
        ? plan.openings.filter((o) => o.kind === 'door' && ('id' in door ? o.id === door.id : true))
        : [];
      const blockers = resolve(blockedBy);
      if (doors.length === 0 || blockers.length === 0) return null;
      for (const o of doors) {
        const sw = doorSwing(o, plan.walls);
        if (!sw) continue;
        for (const b of blockers) {
          if (intersects([sw.sector], b.polys, 5)) {
            const c = centroid(b.polys[0]);
            return { valueMm: 0, fromId: b.id, targetId: o.id, witness: [sw.hinge, c] };
          }
        }
      }
      return { valueMm: Infinity };
    },
    pathLength(parts) {
      if (!plan.calibrated) return null;
      const pts: Point[] = [];
      for (const p of parts) {
        const e = resolve(p)[0];
        if (!e) return null;
        pts.push(centroid(e.polys[0]));
      }
      if (pts.length < 2) return null;
      let sum = 0;
      for (let i = 0; i < pts.length; i++) sum += distance(pts[i], pts[(i + 1) % pts.length]);
      return Math.round(sum);
    },
    socketBelowTop(target, maxDistMm) {
      const A = resolve(target);
      if (A.length === 0) return null;
      const sockets = anchorEntities(
        plan.anchors.filter((a) => a.kind === 'socket' && a.confirmed && a.heightMm != null).map((a) => a.id),
      );
      let best: GeomHit | null = null;
      let bestDist = Infinity;
      for (const a of A) {
        if (!a.item) continue;
        for (const s of sockets) {
          if (!sameRoom(a, s)) continue;
          const g = edgeGap(a.polys, s.polys);
          if (g.gap > maxDistMm || g.gap >= bestDist) continue;
          bestDist = g.gap;
          best = {
            valueMm: Math.round(a.z[1] - (s.heightMm ?? 0)),
            fromId: a.id,
            targetId: s.id,
          };
        }
      }
      return best;
    },
    getItemProp(target, field) {
      const e = resolve(target).find((x) => x.item);
      return e?.item ? e.item[field] : null;
    },
    getItemVariant(target) {
      const e = resolve(target).find((x) => x.item);
      if (!e?.item) return null;
      return (e.item.variant ?? 'standard') as FurnitureVariant;
    },
    hasItem(target) {
      return resolve(target).some((x) => x.item);
    },
  };
}
