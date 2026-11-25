import type { FurnitureItem, FurnitureVariant, ObjectType, Space } from '@fitly/layout-engine';

export interface CatalogEntry {
  type: ObjectType;
  label: string;
  space: Space;
  w: number;
  d: number;
  h: number;
  z?: number;
  variant?: FurnitureVariant;
  variants?: { value: FurnitureVariant; label: string }[];
  chaiseW?: number;
  chaiseD?: number;
  /** 常见尺寸规格，一键切换 */
  presets?: { label: string; w: number; d: number; h: number }[];
  colors: string[];
}

export const CATALOG: CatalogEntry[] = [
  {
    type: 'sofa', label: '沙发', space: 'living', w: 2400, d: 900, h: 850,
    variants: [
      { value: 'standard', label: '直排' },
      { value: 'l-shape-left', label: 'L 型（贵妃在左）' },
      { value: 'l-shape-right', label: 'L 型（贵妃在右）' },
    ],
    chaiseW: 700, chaiseD: 650,
    presets: [
      { label: '2.0 米', w: 2000, d: 880, h: 850 },
      { label: '2.4 米', w: 2400, d: 900, h: 850 },
      { label: '2.8 米', w: 2800, d: 950, h: 850 },
      { label: '3.2 米', w: 3200, d: 1000, h: 850 },
    ],
    colors: ['#c9bba8', '#8a9a8c', '#6f7d8c', '#b98d6c'],
  },
  {
    type: 'teaTable', label: '茶几', space: 'living', w: 1200, d: 600, h: 400,
    presets: [
      { label: '1.0 米', w: 1000, d: 500, h: 400 },
      { label: '1.2 米', w: 1200, d: 600, h: 400 },
      { label: '1.4 米', w: 1400, d: 700, h: 380 },
    ],
    colors: ['#a67c52', '#e8e2d8', '#3b3b3b'],
  },
  {
    type: 'tvCabinet', label: '电视柜', space: 'living', w: 2000, d: 400, h: 450,
    presets: [
      { label: '1.8 米', w: 1800, d: 400, h: 450 },
      { label: '2.0 米', w: 2000, d: 400, h: 450 },
      { label: '2.4 米', w: 2400, d: 400, h: 450 },
    ],
    colors: ['#e8e2d8', '#a67c52', '#3b3b3b'],
  },
  {
    type: 'tv', label: '电视', space: 'living', w: 1450, d: 80, h: 840, z: 900,
    presets: [
      { label: '65 寸', w: 1450, d: 80, h: 840 },
      { label: '75 寸', w: 1670, d: 80, h: 960 },
      { label: '85 寸', w: 1900, d: 80, h: 1090 },
    ],
    colors: ['#1d1d1f'],
  },
  { type: 'rug', label: '地毯', space: 'living', w: 2300, d: 1600, h: 10, colors: ['#d9cfc1', '#9fb0a3', '#c7a98f'] },
  { type: 'lamp', label: '落地灯', space: 'living', w: 400, d: 400, h: 1600, colors: ['#f2e6cf'] },
  { type: 'curtain', label: '窗帘', space: 'living', w: 1800, d: 150, h: 2600, colors: ['#e4dccf', '#9aa79c'] },
  { type: 'robot', label: '扫地机基站', space: 'living', w: 400, d: 450, h: 450, colors: ['#f4f4f4'] },
  {
    type: 'diningTable', label: '餐桌', space: 'living', w: 1400, d: 800, h: 750,
    presets: [
      { label: '1.2 米（4 人）', w: 1200, d: 750, h: 750 },
      { label: '1.4 米（4–6 人）', w: 1400, d: 800, h: 750 },
      { label: '1.6 米（6 人）', w: 1600, d: 900, h: 750 },
    ],
    colors: ['#a67c52', '#e8e2d8', '#5a4636'],
  },
  { type: 'diningChair', label: '餐椅', space: 'living', w: 450, d: 500, h: 850, colors: ['#5a4636', '#d9cfc1'] },
  {
    type: 'bed', label: '床', space: 'bedroom', w: 1800, d: 2100, h: 1000,
    presets: [
      { label: '1.5 米', w: 1500, d: 2100, h: 1000 },
      { label: '1.8 米', w: 1800, d: 2100, h: 1000 },
      { label: '2.0 米', w: 2000, d: 2200, h: 1000 },
    ],
    colors: ['#d9cfc1', '#8a9a8c', '#6f7d8c'],
  },
  { type: 'nightstand', label: '床头柜', space: 'bedroom', w: 450, d: 400, h: 500, colors: ['#a67c52', '#e8e2d8'] },
  {
    type: 'wardrobe', label: '衣柜', space: 'bedroom', w: 2000, d: 600, h: 2400, variant: 'unknown',
    variants: [
      { value: 'unknown', label: '门型未定' },
      { value: 'hinged-door', label: '平开门' },
      { value: 'sliding-door', label: '推拉门' },
    ],
    presets: [
      { label: '1.6 米', w: 1600, d: 600, h: 2400 },
      { label: '2.0 米', w: 2000, d: 600, h: 2400 },
      { label: '2.4 米', w: 2400, d: 600, h: 2600 },
    ],
    colors: ['#efe9df', '#c9b49a', '#7b6a5a'],
  },
  { type: 'fridge', label: '冰箱', space: 'kitchen', w: 700, d: 700, h: 1800,
    presets: [
      { label: '单门 600', w: 600, d: 650, h: 1700 },
      { label: '多门 700', w: 700, d: 700, h: 1800 },
      { label: '对开门 900', w: 910, d: 720, h: 1780 },
    ],
    colors: ['#d7dbe0', '#2f3237'] },
  { type: 'sink', label: '水槽柜', space: 'kitchen', w: 800, d: 600, h: 850, colors: ['#efe9df', '#7b8794'] },
  { type: 'stove', label: '灶台柜', space: 'kitchen', w: 800, d: 600, h: 850, colors: ['#efe9df', '#7b8794'] },
  { type: 'baseCabinet', label: '地柜', space: 'kitchen', w: 800, d: 600, h: 850, colors: ['#efe9df', '#7b8794'] },
  { type: 'counter', label: '转角台面', space: 'kitchen', w: 600, d: 600, h: 850, colors: ['#efe9df', '#7b8794'] },
  { type: 'dishwasher', label: '洗碗机', space: 'kitchen', w: 600, d: 600, h: 850, colors: ['#c4c8cc'] },
];

export const CATALOG_BY_TYPE = Object.fromEntries(CATALOG.map((c) => [c.type, c])) as Record<ObjectType, CatalogEntry | undefined>;

export function labelOf(item: FurnitureItem): string {
  return item.label ?? CATALOG_BY_TYPE[item.type]?.label ?? item.type;
}

export const ANCHOR_LABEL: Record<string, string> = {
  socket: '插座',
  switch: '开关',
  gas: '燃气',
  drain: '地漏',
  water: '水位',
  flue: '烟道',
};
