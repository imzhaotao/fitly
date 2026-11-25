// 核心单位：毫米（mm）。平面 x 向右、y 向深，高度向上。

export type Space = 'living' | 'kitchen' | 'bedroom' | 'bath' | 'entry' | 'balcony';
export type Stage = 'measure' | 'layout' | 'confirm';

export type ObjectType =
  | 'sofa' | 'teaTable' | 'tvCabinet' | 'tv' | 'rug' | 'aircon' | 'curtain' | 'robot' | 'lamp'
  | 'diningTable' | 'diningChair'
  | 'wardrobe' | 'bed' | 'nightstand'
  | 'fridge' | 'stove' | 'sink' | 'counter' | 'baseCabinet' | 'dishwasher' | 'oven' | 'rangeHood';

export type AnchorKind = 'socket' | 'switch' | 'gas' | 'drain' | 'water' | 'flue';
export type WallKind = 'wall' | 'door' | 'window' | 'pass';

/** 物件的功能朝向边，用于衣柜正前方、冰箱两侧等方向性净空 */
export type Face = 'any' | 'front' | 'back' | 'sides';

export type FurnitureVariant =
  | 'standard'
  | 'l-shape-left'
  | 'l-shape-right'
  | 'sliding-door'
  | 'hinged-door'
  | 'unknown';

/** 选择器：在方案里“找谁” */
export type Sel =
  | { current: true }
  | { type: ObjectType }
  | { id: string }
  | { wallKind: WallKind }
  | { anchor: AnchorKind };

export interface Point { x: number; y: number }

export interface RoomZone {
  id: string;
  space: Space;
  name: string;
  polygon: Point[];
  floorMaterial?: 'wood' | 'tile' | 'marble';
}

export interface Wall {
  id: string;
  a: Point;
  b: Point;
  thickness: number;
  heightMm?: number;
  /** 外墙：3D 斜角视角下朝向相机时淡化 */
  exterior?: boolean;
}

export interface Opening {
  id: string;
  wallId: string;
  kind: 'door' | 'window' | 'pass';
  offset: number;
  width: number;
  height?: number;
  sillHeightMm?: number;
  swing?: {
    /** 以有向墙 wall.a -> wall.b 为基准的左/右侧 */
    side: 'left' | 'right';
    hinge: 'start' | 'end';
    angleDeg?: number;
  };
}

export interface Anchor {
  id: string;
  kind: AnchorKind;
  wallId?: string;
  offset?: number;
  side?: 'left' | 'right';
  at?: Point;
  heightMm?: number;
  /** 屋主是否已现场确认（模板示例点位为 false） */
  confirmed?: boolean;
}

export interface FurnitureItem {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  /** 度数，0 度约定正面朝 +y */
  rotation: number;
  variant?: FurnitureVariant;
  chaiseW?: number;
  chaiseD?: number;
  materialPreset?: string;
  label?: string;
}

/** 参数化户型：客餐厅在左，厨房在右上，卧室在右下 */
export interface ShapeParams {
  /** 客餐厅开间 */
  livingW: number;
  /** 总进深 */
  depth: number;
  /** 右侧（厨房/卧室）开间 */
  sideW: number;
  /** 厨房进深，卧室进深 = depth - kitchenD */
  kitchenD: number;
}

/** 屋主笔记：可关联某件家具、某个点位或某条提醒 */
export interface PlanNote {
  id: string;
  text: string;
  createdAt: number;
  itemId?: string;
  anchorId?: string;
  /** 由“已核对”生成时记录对应提醒 ID */
  pitfallId?: string;
  done?: boolean;
}

/** 已核对的提醒：key 为 `${pitfallId}|${itemId ?? roomId}` */
export interface PitfallCheck {
  at: number;
  noteId?: string;
}

export interface Plan {
  id: string;
  version: 1;
  unit: 'mm';
  calibrated: boolean;
  meta: {
    name: string;
    areaSqm?: number;
    layout?: string;
    templateId?: string;
  };
  shape?: { kind: 'l-apartment'; params: ShapeParams };
  rooms: RoomZone[];
  walls: Wall[];
  openings: Opening[];
  anchors: Anchor[];
  fixtures: FurnitureItem[];
  furniture: FurnitureItem[];
  notes?: PlanNote[];
  checks?: Record<string, PitfallCheck>;
}

export interface GeomHit {
  /** 实测值（mm）。Infinity 表示存在候选但不满足高度重叠等前提 */
  valueMm: number;
  /** 发起方物件 ID */
  fromId?: string;
  /** 命中的插座/门/墙/家具 ID，用于 3D 高亮 */
  targetId?: string;
  /** 两个最近点坐标（mm），用于画红线 */
  witness?: [Point, Point];
}

export interface GeometryQuery {
  clearance(from: Sel, to: Sel, opts?: { face?: Face; checkHeight?: boolean }): GeomHit | null;
  distance(a: Sel, b: Sel, opts?: { checkHeight?: boolean }): GeomHit | null;
  overlap(a: Sel, b: Sel, opts?: { checkHeight?: boolean }): GeomHit | null;
  sweepBlocked(door: Sel, blockedBy: Sel): GeomHit | null;
  pathLength(parts: Sel[]): number | null;
  /** 物件顶面高出附近已确认插座中心的高度（mm）；无已确认插座返回 null */
  socketBelowTop(target: Sel, maxDistMm: number): GeomHit | null;
  getItemProp(target: Sel, field: 'w' | 'd' | 'h'): number | null;
  getItemVariant(target: Sel): FurnitureVariant | null;
  hasItem(target: Sel): boolean;
}

export interface QueryScope {
  selectedId?: string;
  roomId?: string;
  space?: Space;
}
