import {
  insetOrthoPolygon,
  leftNormal,
  wallDir,
  type Anchor,
  type FurnitureItem,
  type Opening,
  type Plan,
  type Point,
  type RoomZone,
  type Space,
  type Wall,
} from '@fitly/layout-engine';

/**
 * 屋主上传的两室户型（2026-11-25 户型图手工录入）。
 * 坐标为墙中线（mm），x 向右、y 向下；尺寸来自户型图四周的尺寸链：
 *   横向 989 / 2243 / 3242 / 1775（合计 8249），阳台 2721；
 *   纵向左 1786 / 621 / 3801 / 2955 / 580 / 1844，右 776 / 1631 / 6193 / 2987（合计 11587）。
 * 原图横纵缩放比例不同（约 11.5 vs 10.4 mm/px），所以两个方向分别按尺寸链换算。
 */

const EXT = 200;
const INT = 120;

// 轴线
const X = { left: 0, master: 989, mid: 3232, bal1L: 3032, bath: 5096, masterR: 4462, bal1R: 5750, kitchen: 6474, right: 8249 };
const Y = { top: 0, bal2: 776, masterT: 1786, bal: 2407, masterB: 6208, bathT: 7311, kitchenT: 8600, secondB: 9163, bathB: 9743, bottom: 11587 };

const P = (x: number, y: number): Point => ({ x, y });

const walls: Wall[] = [
  // 外墙（顺时针）
  { id: 'w-bal1-top', a: P(X.bal1L, Y.top), b: P(X.bal1R, Y.top), thickness: EXT, exterior: true },
  { id: 'w-bal1-r', a: P(X.bal1R, Y.top), b: P(X.bal1R, Y.bal2), thickness: EXT, exterior: true },
  { id: 'w-bal2-top', a: P(X.bal1R, Y.bal2), b: P(X.right, Y.bal2), thickness: EXT, exterior: true },
  { id: 'w-right', a: P(X.right, Y.bal2), b: P(X.right, Y.bottom), thickness: EXT, exterior: true },
  { id: 'w-bottom', a: P(X.right, Y.bottom), b: P(X.mid, Y.bottom), thickness: EXT, exterior: true },
  { id: 'w-entry-l', a: P(X.mid, Y.bottom), b: P(X.mid, Y.secondB), thickness: EXT, exterior: true },
  { id: 'w-second-b', a: P(X.mid, Y.secondB), b: P(X.left, Y.secondB), thickness: EXT, exterior: true },
  { id: 'w-second-l', a: P(X.left, Y.secondB), b: P(X.left, Y.masterB), thickness: EXT, exterior: true },
  { id: 'w-second-t', a: P(X.left, Y.masterB), b: P(X.master, Y.masterB), thickness: EXT, exterior: true },
  { id: 'w-master-l', a: P(X.master, Y.masterB), b: P(X.master, Y.masterT), thickness: EXT, exterior: true },
  { id: 'w-master-t', a: P(X.master, Y.masterT), b: P(X.bal1L, Y.masterT), thickness: EXT, exterior: true },
  { id: 'w-bal1-l', a: P(X.bal1L, Y.masterT), b: P(X.bal1L, Y.top), thickness: EXT, exterior: true },
  // 内墙
  { id: 'w-bal-b', a: P(X.bal1L, Y.bal), b: P(X.right, Y.bal), thickness: EXT },
  { id: 'w-bal-mid', a: P(X.bal1R, Y.bal2), b: P(X.bal1R, Y.bal), thickness: INT },
  { id: 'w-master-r', a: P(X.masterR, Y.bal), b: P(X.masterR, Y.masterB), thickness: INT },
  { id: 'w-master-b', a: P(X.master, Y.masterB), b: P(X.masterR, Y.masterB), thickness: INT },
  { id: 'w-second-r', a: P(X.mid, Y.masterB), b: P(X.mid, Y.secondB), thickness: INT },
  { id: 'w-bath-t', a: P(X.mid, Y.bathT), b: P(X.bath, Y.bathT), thickness: INT },
  { id: 'w-bath-r', a: P(X.bath, Y.bathT), b: P(X.bath, Y.bathB), thickness: INT },
  { id: 'w-bath-b', a: P(X.mid, Y.bathB), b: P(X.bath, Y.bathB), thickness: INT },
  { id: 'w-kitchen-t', a: P(X.kitchen, Y.kitchenT), b: P(X.right, Y.kitchenT), thickness: INT },
  { id: 'w-kitchen-l', a: P(X.kitchen, Y.kitchenT), b: P(X.kitchen, Y.bottom), thickness: INT },
];

const wallById = (id: string) => walls.find((w) => w.id === id)!;
const along = (w: Wall, p: Point) => {
  const d = wallDir(w);
  return (p.x - w.a.x) * d.x + (p.y - w.a.y) * d.y;
};

/** 在墙上按世界坐标放洞口；swing 给出门扇朝向的房间内一点和铰链端 */
function opening(
  id: string,
  wallId: string,
  kind: Opening['kind'],
  from: Point,
  to: Point,
  opts: { into?: Point; hingeAt?: Point; sill?: number; height?: number } = {},
): Opening {
  const w = wallById(wallId);
  const o0 = Math.min(along(w, from), along(w, to));
  const o1 = Math.max(along(w, from), along(w, to));
  const o: Opening = { id, wallId, kind, offset: Math.round(o0), width: Math.round(o1 - o0) };
  if (kind === 'window') {
    o.sillHeightMm = opts.sill ?? 900;
    o.height = opts.height ?? 1500;
  } else {
    o.height = opts.height ?? 2100;
  }
  if (opts.into && opts.hingeAt) {
    const n = leftNormal(w);
    const side = (opts.into.x - w.a.x) * n.x + (opts.into.y - w.a.y) * n.y > 0 ? 'left' : 'right';
    const h = along(w, opts.hingeAt);
    o.swing = { side, hinge: Math.abs(h - o0) < Math.abs(h - o1) ? 'start' : 'end' };
  }
  return o;
}

const openings: Opening[] = [
  // 门
  opening('o-entry', 'w-bottom', 'door', P(3574, Y.bottom), P(4462, Y.bottom), { into: P(4000, 11000), hingeAt: P(4462, Y.bottom) }),
  opening('o-master', 'w-master-b', 'door', P(3540, Y.masterB), P(4290, Y.masterB), { into: P(3900, 5800), hingeAt: P(4290, Y.masterB) }),
  opening('o-second', 'w-second-r', 'door', P(X.mid, 6430), P(X.mid, 7210), { into: P(2800, 6800), hingeAt: P(X.mid, 6430) }),
  opening('o-bath', 'w-bath-t', 'door', P(3463, Y.bathT), P(4200, Y.bathT), { into: P(3800, 7700), hingeAt: P(3463, Y.bathT) }),
  opening('o-kitchen', 'w-kitchen-l', 'door', P(X.kitchen, 10036), P(X.kitchen, 10951), { into: P(7000, 10500), hingeAt: P(X.kitchen, 10036) }),
  opening('o-bal-inner', 'w-bal-mid', 'door', P(X.bal1R, 936), P(X.bal1R, 1633), { into: P(5300, 1300), hingeAt: P(X.bal1R, 1633) }),
  // 客厅通阳台：推拉门（无门扇扫掠）
  opening('o-bal-slide', 'w-bal-b', 'door', P(6100, Y.bal), P(7530, Y.bal)),
  // 窗
  opening('o-win-bal1', 'w-bal1-top', 'window', P(3332, Y.top), P(5385, Y.top), { sill: 900, height: 1600 }),
  opening('o-win-bal2', 'w-bal2-top', 'window', P(6250, Y.bal2), P(7771, Y.bal2), { sill: 900, height: 1600 }),
  opening('o-win-master', 'w-master-t', 'window', P(1234, Y.masterT), P(2733, Y.masterT)),
  opening('o-win-second-t', 'w-second-t', 'window', P(160, Y.masterB), P(830, Y.masterB)),
  opening('o-win-second-l', 'w-second-l', 'window', P(X.left, 6450), P(X.left, 7405)),
  opening('o-win-entry-1', 'w-entry-l', 'window', P(X.mid, 9310), P(X.mid, 9640), { sill: 1200, height: 900 }),
  opening('o-win-entry-2', 'w-entry-l', 'window', P(X.mid, 9930), P(X.mid, 10990)),
];

const roomDefs: { id: string; space: Space; name: string; poly: Point[]; floor: RoomZone['floorMaterial'] }[] = [
  {
    id: 'r-living',
    space: 'living',
    name: '客餐厅',
    floor: 'wood',
    poly: [
      P(X.masterR, Y.bal), P(X.right, Y.bal), P(X.right, Y.kitchenT), P(X.kitchen, Y.kitchenT), P(X.kitchen, Y.bottom),
      P(X.mid, Y.bottom), P(X.mid, Y.bathB), P(X.bath, Y.bathB), P(X.bath, Y.bathT), P(X.mid, Y.bathT), P(X.mid, Y.masterB), P(X.masterR, Y.masterB),
    ],
  },
  {
    id: 'r-master',
    space: 'bedroom',
    name: '主卧',
    floor: 'wood',
    poly: [P(X.master, Y.masterT), P(X.bal1L, Y.masterT), P(X.bal1L, Y.bal), P(X.masterR, Y.bal), P(X.masterR, Y.masterB), P(X.master, Y.masterB)],
  },
  { id: 'r-second', space: 'bedroom', name: '次卧', floor: 'wood', poly: [P(X.left, Y.masterB), P(X.mid, Y.masterB), P(X.mid, Y.secondB), P(X.left, Y.secondB)] },
  { id: 'r-bath', space: 'bath', name: '卫生间', floor: 'tile', poly: [P(X.mid, Y.bathT), P(X.bath, Y.bathT), P(X.bath, Y.bathB), P(X.mid, Y.bathB)] },
  { id: 'r-kitchen', space: 'kitchen', name: '厨房', floor: 'tile', poly: [P(X.kitchen, Y.kitchenT), P(X.right, Y.kitchenT), P(X.right, Y.bottom), P(X.kitchen, Y.bottom)] },
  { id: 'r-bal1', space: 'balcony', name: '阳台', floor: 'tile', poly: [P(X.bal1L, Y.top), P(X.bal1R, Y.top), P(X.bal1R, Y.bal), P(X.bal1L, Y.bal)] },
  { id: 'r-bal2', space: 'balcony', name: '小阳台', floor: 'tile', poly: [P(X.bal1R, Y.bal2), P(X.right, Y.bal2), P(X.right, Y.bal), P(X.bal1R, Y.bal)] },
];

/** 房间边界按墙中线向内收 60mm（内墙半厚），外墙多出的 40mm 压在墙下，由墙体碰撞兜住 */
const rooms: RoomZone[] = roomDefs.map((r) => ({ id: r.id, space: r.space, name: r.name, polygon: insetOrthoPolygon(r.poly, 60), floorMaterial: r.floor }));

const anchors: Anchor[] = [
  { id: 'a-sofa', kind: 'socket', wallId: 'w-master-r', offset: 400, side: 'right', heightMm: 300, confirmed: false },
  { id: 'a-tv', kind: 'socket', wallId: 'w-right', offset: 3500, side: 'left', heightMm: 650, confirmed: false },
  { id: 'a-master-bed', kind: 'socket', wallId: 'w-master-l', offset: 3050, side: 'left', heightMm: 700, confirmed: false },
  { id: 'a-kitchen', kind: 'socket', wallId: 'w-right', offset: 9600, side: 'left', heightMm: 1100, confirmed: false },
  { id: 'a-gas', kind: 'gas', wallId: 'w-right', offset: 10400, side: 'left', heightMm: 1300, confirmed: false },
];

let seq = 0;
const f = (type: FurnitureItem['type'], x: number, y: number, w: number, d: number, h: number, rotation: number, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: `${type}-h${(seq++).toString(36)}`,
  type,
  x,
  y,
  w,
  d,
  h,
  rotation,
  ...extra,
});

function furniture(): FurnitureItem[] {
  seq = 0;
  return [
    // 客餐厅：沙发靠主卧墙朝东，电视柜靠东外墙
    f('sofa', 4982, 4300, 2400, 900, 850, -90, { variant: 'standard', materialPreset: '#c9bba8' }),
    f('teaTable', 6050, 4300, 1100, 550, 400, -90, { materialPreset: '#a67c52' }),
    f('tvCabinet', 7949, 4300, 2000, 400, 450, 90, { materialPreset: '#e8e2d8' }),
    f('tv', 8109, 4300, 1450, 80, 840, 90, { z: 900 }),
    f('diningTable', 5900, 7400, 1400, 800, 750, 0, { materialPreset: '#a67c52' }),
    f('diningChair', 5550, 6750, 450, 500, 850, 0),
    f('diningChair', 6250, 6750, 450, 500, 850, 0),
    f('diningChair', 5550, 8050, 450, 500, 850, 180),
    f('diningChair', 6250, 8050, 450, 500, 850, 180),
    // 主卧：床头靠西墙，衣柜靠东墙
    f('bed', 2139, 4200, 1800, 2100, 1000, -90),
    f('nightstand', 1289, 3055, 450, 400, 500, -90),
    f('nightstand', 1289, 5345, 450, 400, 500, -90),
    f('wardrobe', 4102, 4300, 2000, 600, 2400, 90, { variant: 'unknown' }),
    // 次卧
    f('bed', 1100, 7700, 1500, 2000, 1000, -90),
    // 厨房：沿东墙 冰箱—水槽—灶台
    f('fridge', 7799, 9090, 700, 700, 1800, 90, { materialPreset: '#d7dbe0' }),
    f('sink', 7849, 9900, 800, 600, 850, 90),
    f('stove', 7849, 10900, 800, 600, 850, 90),
  ];
}

export function buildHomeA(): Omit<Plan, 'id'> {
  return {
    version: 1,
    unit: 'mm',
    calibrated: true,
    meta: { name: '我家 · 两室（按户型图录入）', layout: '两室一厅一卫 + 双阳台', templateId: 'home-a', areaSqm: 80 },
    rooms,
    walls,
    openings,
    anchors,
    fixtures: [],
    furniture: furniture(),
  };
}

/** 户型图上标注的面积（㎡），用于测试校验录入是否走样 */
export const HOME_A_LABELED_AREA: Record<string, number> = {
  'r-living': 28.95,
  'r-master': 13.54,
  'r-second': 8.45,
  'r-bath': 3.65,
  'r-kitchen': 4.48,
  'r-bal1': 5.52,
  'r-bal2': 3.45,
};
