import type {
  Face,
  FurnitureVariant,
  GeomHit,
  ObjectType,
  Sel,
  Space,
  Stage,
} from '@fitly/layout-engine';

export type { Face, FurnitureVariant, GeomHit, ObjectType, Sel, Space, Stage };

export type Severity = 'blocking' | 'costly' | 'annoying';

/** 几何判定：需要 layout-engine 求值 */
export type GeomTest =
  | { op: 'clearance'; from: Sel; face?: Face; to: Sel; lt: number; checkHeight?: boolean }
  | { op: 'distance'; a: Sel; b: Sel; lt: number }
  | { op: 'overlap'; a: Sel; b: Sel; checkHeight?: boolean }
  | { op: 'sweep'; door: Sel; blockedBy: Sel }
  | { op: 'sum'; parts: Sel[]; lt?: number; gt?: number }
  /** 物件顶面高出附近已确认插座中心多少（mm），用于“插座低于桌面” */
  | { op: 'socketBelowTop'; target: Sel; maxDistMm: number; gt: number };

export type PropTest =
  | { field: 'w' | 'd' | 'h'; gt?: number; lt?: number }
  | { field: 'variant'; eq?: FurnitureVariant; neq?: FurnitureVariant; in?: FurnitureVariant[] };

export type Trigger =
  | { kind: 'select'; space?: Space; objectType?: ObjectType }
  | { kind: 'enter'; space: Space }
  | { kind: 'stage'; stage: Stage }
  | { kind: 'exists'; target: Sel }
  | { kind: 'prop'; target: Sel; test: PropTest }
  | { kind: 'geom'; test: GeomTest };

export interface Pitfall {
  id: string;
  space: Space;
  objectType?: ObjectType;
  /** 支持 {{mm}} / {{cm}} 占位符 */
  title: string;
  why: string;
  fix?: string;
  ask?: string[];
  stage: Stage;
  severity: Severity;
  /** 全部满足才触发（AND） */
  check: Trigger[];
  /** 涉及水电燃气防水：统一追加免责收尾 */
  engineering?: boolean;
  source?: string;
  verified: boolean;
}

export interface EvaluatedPitfall {
  pitfall: Pitfall;
  /** 填好数值的标题 */
  title: string;
  itemId?: string;
  roomId?: string;
  hit?: GeomHit;
  /** 'L1' 纯提醒 / 'L2' 几何或属性实测 */
  layer: 'L1' | 'L2';
}

export interface EvalContext {
  selectedId?: string;
  selectedType?: ObjectType;
  roomId?: string;
  space: Space;
  stage: Stage;
}

export interface PlanAudit {
  blockingCount: number;
  costlyCount: number;
  annoyingCount: number;
  totalCount: number;
  conflicts: EvaluatedPitfall[];
}

export const ENGINEERING_DISCLAIMER = '经验值仅供参考，实际施工与点位改动以现场师傅、物业或燃气公司确认为准。';
