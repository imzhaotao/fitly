import { applyShape, DEFAULT_SHAPE, type Anchor, type FurnitureItem, type Plan } from '@fitly/layout-engine';

export interface TemplateInfo {
  id: string;
  name: string;
  summary: string;
  tags: string[];
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'movie',
    name: '一家人观影型',
    summary: '3.6 米客厅配 2.8 米 L 型沙发与 75 寸电视，餐桌靠墙；卧室 1.8 米床 + 推拉门衣柜。',
    tags: ['L 型沙发', '大屏', '推拉门衣柜'],
  },
  {
    id: 'kids',
    name: '亲子活动留空型',
    summary: '直排 2.4 米沙发，不放茶几，客厅中间留出 2 米见方的爬爬垫；衣柜门型还没定。',
    tags: ['直排沙发', '活动区', '门型待定'],
  },
];

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

function anchors(): Anchor[] {
  return [
    // 客餐厅
    { id: 'a-dining', kind: 'socket', wallId: 'w-left', offset: 2300, side: 'right', heightMm: 300, confirmed: false },
    { id: 'a-sofa', kind: 'socket', wallId: 'w-left', offset: 3550, side: 'right', heightMm: 300, confirmed: false },
    { id: 'a-tv', kind: 'socket', wallId: 'w-mid', offset: 5200, side: 'left', heightMm: 650, confirmed: false },
    { id: 'a-entry-switch', kind: 'switch', wallId: 'w-top', offset: 1350, side: 'left', heightMm: 1300, confirmed: false },
    // 厨房
    { id: 'a-kitchen-1', kind: 'socket', wallId: 'w-top', offset: 4500, side: 'left', heightMm: 1100, confirmed: false },
    { id: 'a-kitchen-2', kind: 'socket', wallId: 'w-right', offset: 2600, side: 'left', heightMm: 1100, confirmed: false },
    { id: 'a-gas', kind: 'gas', wallId: 'w-right', offset: 1900, side: 'left', heightMm: 1300, confirmed: false },
    // 卧室
    { id: 'a-bed-1', kind: 'socket', wallId: 'w-right', offset: 4000, side: 'left', heightMm: 700, confirmed: false },
    { id: 'a-bed-2', kind: 'socket', wallId: 'w-right', offset: 6450, side: 'left', heightMm: 700, confirmed: false },
  ];
}

function f(type: FurnitureItem['type'], x: number, y: number, w: number, d: number, h: number, rotation: number, extra: Partial<FurnitureItem> = {}): FurnitureItem {
  return { id: uid(type), type, x, y, w, d, h, rotation, ...extra };
}

function kitchenAndBedroom(wardrobe: FurnitureItem['variant']): FurnitureItem[] {
  return [
    // 厨房：沿北墙 冰箱—地柜—水槽—转角，东墙灶台
    f('fridge', 4070, 450, 700, 700, 1800, 0, { materialPreset: '#d7dbe0' }),
    f('baseCabinet', 4980, 400, 1000, 600, 850, 0),
    f('sink', 5880, 400, 800, 600, 850, 0),
    f('counter', 6540, 400, 520, 600, 850, 0),
    f('stove', 6500, 1300, 800, 600, 850, 90),
    // 卧室
    f('wardrobe', 3960, 5500, 2000, 600, 2400, -90, { variant: wardrobe }),
    f('bed', 5750, 5230, 1800, 2100, 1000, 90),
    f('nightstand', 6600, 4060, 450, 400, 500, 90),
    f('nightstand', 6600, 6400, 450, 400, 500, 90),
  ];
}

function dining(tableW: number): FurnitureItem[] {
  const x0 = 150 + tableW / 2;
  return [
    f('diningTable', x0, 2300, tableW, 800, 750, 0, { materialPreset: '#a67c52' }),
    f('diningChair', x0 - tableW / 4, 1650, 450, 500, 850, 0),
    f('diningChair', x0 + tableW / 4, 1650, 450, 500, 850, 0),
    f('diningChair', x0 - tableW / 4, 2950, 450, 500, 850, 180),
    f('diningChair', x0 + tableW / 4, 2950, 450, 500, 850, 180),
  ];
}

export function createTemplatePlan(templateId: string): Plan {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0];
  const base: Plan = {
    id: uid('plan'),
    version: 1,
    unit: 'mm',
    calibrated: true,
    meta: { name: `我家 · ${t.name}`, layout: '两室（客餐厅 + 厨房 + 卧室）', templateId: t.id },
    rooms: [],
    walls: [],
    openings: [],
    anchors: anchors(),
    fixtures: [],
    furniture: [],
  };
  const plan = applyShape(base, DEFAULT_SHAPE);

  if (t.id === 'kids') {
    plan.furniture = [
      ...dining(1200),
      f('sofa', 550, 5300, 2400, 900, 850, -90, { variant: 'standard', materialPreset: '#8a9a8c' }),
      f('rug', 1900, 5300, 2000, 2000, 10, -90, { materialPreset: '#9fb0a3', label: '爬爬垫' }),
      f('tvCabinet', 3340, 5300, 1800, 400, 450, 90, { materialPreset: '#e8e2d8' }),
      f('tv', 3500, 5300, 1450, 80, 840, 90, { z: 900 }),
      f('robot', 3300, 4000, 400, 450, 450, 90),
      ...kitchenAndBedroom('unknown'),
    ];
  } else {
    plan.furniture = [
      ...dining(1400),
      f('sofa', 550, 5200, 2800, 900, 850, -90, { variant: 'l-shape-left', chaiseW: 700, chaiseD: 650, materialPreset: '#c9bba8' }),
      f('rug', 1700, 5000, 2300, 1600, 10, -90, { materialPreset: '#d9cfc1' }),
      f('teaTable', 1700, 5000, 1200, 600, 400, -90, { materialPreset: '#a67c52' }),
      f('tvCabinet', 3340, 5200, 2000, 400, 450, 90, { materialPreset: '#a67c52' }),
      f('tv', 3500, 5200, 1670, 80, 960, 90, { z: 900 }),
      f('lamp', 350, 3420, 400, 400, 1600, 0),
      ...kitchenAndBedroom('sliding-door'),
    ];
  }
  return plan;
}
