# 02 · 避坑触发器引擎

> 这是 Fitly 唯一别人抄不走的部分。设计它之前，先接受一句话：
> **它不是知识库，是跟 3D 几何数据联动的触发器。**

---

## 1. 它不是什么

| 不是 | 为什么 |
|---|---|
| 不是文章列表 | 用户在摆家具，不会去读一篇《沙发选购指南》 |
| 不是 FAQ | 用户不知道自己该问什么，所以问不出来 |
| 不是 AI 生成的泛泛而谈 | 一份没有数字的“注意事项”，等于没提醒 |
| 不是硬装施工手册 | Fitly 只管软装与家具布局，不教拆墙、改水电、做防水 |

## 2. 它是：在用户做决定的瞬间，说出一句关于“他家”的具体事实

两个要素缺一不可：

- **关于他家** —— 带 3D 几何实测数据（“沙发离右侧插座只有 12cm，高度 40cm 会被靠背挡住”），不是通用建议
- **在做决定时** —— 出现在拖动或选中家具的那一刻，并在 3D 场景里高亮对应的门/插座/净空尺寸线

## 3. 四层触发器

| 层 | 触发源 | 例子 | 价值 |
|---|---|---|---|
| **L1 点选 / 属性** | 选中某类家具或尺寸超阈值 | 「沙发长度超过 2.2 米，下单前先量电梯和入户门」 | 内容通用，但出现在正确时刻 |
| **L2 3D 几何** | 算出来的距离 / 方向净空 / 高度遮挡 / 门扇扫掠 | 「沙发右端离插座 12cm，会被 82cm 高的靠背挡住」 | **只有 Fitly 有**，直接绑定 3D 空间 |
| **L3 空间** | 切换到厨房 / 卧室等特定空间 | 「操作台面高度按身高算，别一刀切 85cm」 | 空间一进来就把关键坑铺好 |
| **L4 阶段** | 用户进入“确认方案 / 准备下单” | 「定制柜/大件入户前，先确认电梯轿厢与门洞净宽」 | 把不可逆的动作拦在下单前 |

**L1 是基础内容，L2 是护城河。** 只做 L1 只是个会弹卡片的百科；做了 L2，用户会觉得“它在看我家”。

## 4. 数据模型

```ts
// packages/content/src/types.ts

export type Space = 'living' | 'kitchen' | 'bedroom' | 'bath' | 'entry';
export type Stage = 'measure' | 'layout' | 'confirm';

export type ObjectType =
  | 'sofa' | 'teaTable' | 'tvCabinet' | 'tv' | 'rug' | 'aircon' | 'curtain' | 'robot' | 'lamp'
  | 'wardrobe' | 'bed' | 'nightstand'
  | 'fridge' | 'stove' | 'sink' | 'counter' | 'baseCabinet' | 'dishwasher' | 'oven' | 'rangeHood';

export type Severity = 'blocking' | 'costly' | 'annoying';

/** 物件的功能朝向边，用于衣柜正前方、冰箱两侧等方向性净空 */
export type Face = 'any' | 'front' | 'back' | 'sides';

/** 选择器：在方案里“找谁” */
export type Sel =
  | { current: true }                                   // 当前选中/正在拖动的物件
  | { type: ObjectType }                                // 按物件类型（若与当前选中同类型，优先绑定 selectedId）
  | { id: string }                                      // 具体某个物件
  | { wallKind: 'wall' | 'door' | 'window' | 'pass' }   // 墙体或洞口（优先限定在当前房间）
  | { anchor: 'socket' | 'switch' | 'gas' | 'drain' | 'water' | 'flue' }; // 墙面/地面点位（优先限定在当前房间）

/** 几何判定：需要 layout-engine 在 3D/平面上求值 */
export type GeomTest =
  | { op: 'clearance'; from: Sel; face?: Face; to: Sel; lt: number; checkHeight?: boolean } // 净空 < lt(mm)
  | { op: 'distance';  a: Sel; b: Sel; lt: number }                                         // 中心/投影距 < lt(mm)
  | { op: 'overlap';   a: Sel; b: Sel; checkHeight?: boolean }                              // 投影（或含 Z 轴高度）相交
  | { op: 'sweep';     door: Sel; blockedBy: Sel }                                          // 门扇扫掠区被挡
  | { op: 'sum';       parts: Sel[]; lt?: number; gt?: number };                            // 动线总长

export type FurnitureVariant =
  | 'standard'
  | 'l-shape-left'
  | 'l-shape-right'
  | 'sliding-door'
  | 'hinged-door'
  | 'unknown';

/** 物件自身尺寸或款式条件，用于“沙发 > 2200mm”或“衣柜为平开门/未知门型”判断 */
export type PropTest =
  | { field: 'w' | 'd' | 'h'; gt?: number; lt?: number }
  | { field: 'variant'; eq?: FurnitureVariant; neq?: FurnitureVariant; in?: FurnitureVariant[] };

export type Trigger =
  | { kind: 'select'; space?: Space; objectType?: ObjectType }
  | { kind: 'enter';  space: Space }
  | { kind: 'stage';  stage: Stage }
  | { kind: 'prop';   target: Sel; test: PropTest }
  | { kind: 'geom';   test: GeomTest };

export interface Pitfall {
  id: string;                 // 'living.sofa.blocks-socket'
  space: Space;
  objectType?: ObjectType;

  /** 一句话就是坑本身，尽量带结果或数字，支持 {{mm}} / {{cm}} 等测量占位符 */
  title: string;
  /** 为什么会踩 */
  why: string;
  /** 怎么解决，给数字或给动作（仅限软装/布局调整或检查动作） */
  fix?: string;
  /** 用户该去问谁、问什么 */
  ask?: string[];

  stage: Stage;
  severity: Severity;

  /** 满足全部条件才触发（AND）。要“任一”就拆成两条 */
  check: Trigger[];

  /** 出处 / 审校状态 */
  source?: string;
  verified: boolean;
}
```

### 设计取舍：`check` 是 AND，不是 OR

一条 `Pitfall` 里所有 `Trigger` 必须**同时**满足才显示。

- 好处：可预测、可测试、不出现“随机弹出”的诡异感
- 需要“任一条件”时，拆成两条 `Pitfall` —— 反正它们本来也是不同的坑

## 5. 求值流程与 3D 证据回传

```text
用户操作（选中 / 3D 拖动 / 改尺寸 / 切空间 / 进确认页）
        │
        ▼
web 层收集事件 → 组装 EvalContext
        │
        ▼
content.evaluateInteractive(pitfalls, ctx, query) ← 依赖注入 GeometryQuery，不直接依赖 layout-engine
        │
        ├── select / enter / stage / prop 直接判
        └── kind==='geom' → query.clearance(...) 等，返回命中距离 + 目标 ID + 测量点
        │
        ▼
按 severity 排序 + 去重 + 冷却过滤
        │
        ▼
UI：默认只露 1 条 blocking，同时在 3D 场景高亮目标对象与红色尺寸线
```

依赖倒置很重要——`content` 只声明“我需要知道沙发到插座的距离与高度是否遮挡”，由 `layout-engine` 实现查询，返回具体的**命中结果**，以便 UI 既能算出具体数值（“12cm”），又能在 3D 里精准高亮哪一个插座或哪一扇门：

```ts
export interface GeomHit {
  valueMm: number;                        // 实测距离（mm）
  targetId?: string;                      // 命中的插座/门/墙体 ID，用于 3D 高亮
  witness?: [[number, number], [number, number]]; // 两个最近点坐标，用于在场景画红线
}

export interface GeometryQuery {
  clearance(from: Sel, to: Sel, opts?: { face?: Face; checkHeight?: boolean }): GeomHit | null;
  distance(a: Sel, b: Sel, opts?: { checkHeight?: boolean }): GeomHit | null;
  overlap(a: Sel, b: Sel, opts?: { checkHeight?: boolean }): GeomHit | null;
  sweepBlocked(door: Sel, blockedBy: Sel): GeomHit | null;
  pathLength(parts: Sel[]): number | null;
  getItemProp(target: Sel, field: 'w' | 'd' | 'h'): number | null;
  getItemVariant(target: Sel): FurnitureVariant | null;
}

export interface EvaluatedPitfall {
  pitfall: Pitfall;
  itemId?: string; // 命中的具体物件 ID（用于去重与高亮）
  roomId?: string;
  hit?: GeomHit;   // 若由几何触发，附带实测数值与 3D 高亮线索
}

export interface EvalContext {
  selectedId?: string;
  selectedType?: ObjectType;
  roomId?: string;   // 当前选中物件或相机聚焦所在房间，用于多房间点位/门扇隔离
  space: Space;
  stage: Stage;
}

/** 1. 交互态求值：响应用户当前点选、拖拽与页面阶段（受会话冷却与关闭状态过滤） */
export function evaluateInteractive(
  pitfalls: Pitfall[],
  ctx: EvalContext,
  q: GeometryQuery,
): EvaluatedPitfall[];

export interface PlanAudit {
  blockingCount: number;
  costlyCount: number;
  annoyingCount: number;
  totalCount: number;
  conflicts: EvaluatedPitfall[]; // 按 (pitfall.id, itemId/roomId) 唯一去重
}

/**
 * 2. 快照静态审计口径：专用于版本对比与分享页摘要
 *    不依赖当前选中物件、所处空间或 UI 冷却状态；遍历方案内所有房间与已摆放家具，
 *    仅统计可客观判定的几何冲突与确定性属性告警（如平开门净空、超长沙发入户门槛），
 *    保证两份相同快照在任何操作状态下算出的冲突数与差异恒为零。
 */
export function auditPlan(
  pitfalls: Pitfall[],
  plan: unknown,
  createQueryForScope: (scope: { selectedId?: string; roomId?: string; space?: Space }) => GeometryQuery,
): PlanAudit;
```

**`null` 的处理是关键底线**：几何数据不足时（例如用户上传底图还没标定比例尺，或模板没有录入插座点位），查询返回 `null` 而不是 `0`。此时该条几何触发器不触发，只降级保留 L1 内容型提示，并提示“未标定真实尺寸/点位，先校准后再检测”。**宁可少提示，绝不误报。**

## 6. 严重度分级与呈现

| severity | 含义 | 颜色 | 呈现 |
|---|---|---|---|
| `blocking` | 会让方案摆错/装错、退换或返工代价极大 | 红 | **主动弹出**，底部半屏卡片 + 3D 场景红线高亮 |
| `costly` | 体验大打折扣、或需要改点位/多花钱 | 黄 | 收在“还有 N 条”里，角标提醒 |
| `annoying` | 有点不顺手，但能忍 | 灰 | 只在“全部”列表里 |

**同屏最多 1 条 blocking。** 一次弹 5 条等于没弹。

### 冷却与去重

- 同一 session 内，同一条 `Pitfall` 只主动弹 1 次
- 用户手动关掉的，24 小时内不再主动弹（但在“全部”里仍可查）
- 用户拖动家具消除了问题、之后又重新拖回触发区间时，允许再次触发（强化“位置改对了/又撞上了”的即时正反馈）

## 7. UI 规范

点选家具或在 3D 中拖动触发后，从底部升起轻量半屏卡片（高度约 35%–40%，可下拉收起），3D 场景相机自动将选中物体居中偏上，避免被卡片遮挡：

```text
┌─────────────────────────────────┐
│ ● 你家这个插座会被沙发挡住        │  ← blocking，红点
│   沙发右端离它 12cm，靠背高 82cm  │  ← 来自 GeomHit 的真实数值
│                                  │
│   换窄款或把沙发左移；看清是否要改位 │  ← fix（软装动作/核对建议）
│                                  │
│   问师傅：沙发背后还留这个插座吗？   │  ← ask（可直接复制）
│                                  │
│   还有 4 条  ›                    │
└─────────────────────────────────┘
```

规则：

- **标题尽量写具体后果或带数字**，不写“注意插座位置”这种废话
- 正文总长 ≤ 60 字（不含 `ask`）
- 卡片不遮挡正在编辑的 3D 家具
- 「还有 N 条」进入全量列表，按 severity 排序，`blocking` 永远在最前

## 8. 软装边界与安全红线（写内容前必读）

Fitly 的核心定位是**软装与家具布局试装**，**不涉足硬装拆改与施工指导**：

- **完全不涉及拆墙与结构**：拆墙、砸飘窗、判断承重墙属于硬装结构改造，**不在 Fitly 产品范围与内容范围内，不做任何拆改提示或判断**。
- **水电、燃气、防水只提醒“问谁”，绝不给施工做法**：当家具或大件家电（如冰箱、洗碗机、地柜、落地窗帘等）邻接水电/燃气/防水点位时，因为存在安全与合规风险，**严禁输出具体施工参数**，只输出风险提示与提问清单（`ask`）：

| 类别 | 允许写 | 严禁写 |
|---|---|---|
| **燃气邻接** | 「燃气管道和阀门区域不要被柜体彻底封死，需留可检修空间；具体以当地燃气公司要求为准」 | 具体的改管方案、管径、安全距离标准 |
| **电路负荷与点位** | 「大功率家电通常建议独立回路，下单前把电器功率清单拿给电工核算」 | 具体电线平方数、空开安培数、接线方式 |
| **涉水区域防水** | 「柜体/设备邻近厨卫湿区需注意防潮与渗水检查，具体以现场闭水验收结果为准」 | 防水涂刷遍数、材料用量、施工工序 |

每条涉工程类提示统一带免责收尾：**「经验值仅供参考，实际施工与点位改动以现场师傅、物业或燃气公司确认为准。」**

内容里**不出现品牌名、不承诺价格**，保持工具中立性。

## 9. 写作规范（含 L1 vs L2 诚实表达纪律）

- **L1 纯提醒（无几何/确定属性校验）必须写成待核对的提问或条件提醒**，绝不允许在没做几何计算时断定“你家已经出错”。
- **L2 几何触发（已实测净空/扫掠/遮挡）才说确定结论**，并尽可能给出实测数值。

| 规则 | 好 | 坏 |
|---|---|---|
| L1 写核对问题 | 「客厅若只留中央主灯，沙发看书背光吗？」 | 「你家只留了主灯，沙发看书一定背光」 |
| L2 写确定后果 | 「平开门衣柜前面被床挡住，净空仅 42cm」 | 「衣柜选购注意事项」 |
| 带数字 | 「前面留够 60cm」 | 「留够一定的距离」 |
| 说清代价 | 「送到家才发现放不下，大件退货运费高」 | 「影响使用体验」 |
| 给动作 | 「先把沙发缩到 2.4 米，或往左挪 20cm」 | 「需要注意一下」 |
| 不喊口号 | —— | 「千万要注意！」「一定要注意！」 |

## 10. 完整样例（可直接入库）

```jsonc
{
  "id": "living.sofa.blocks-socket",
  "space": "living",
  "objectType": "sofa",
  "title": "你家这个插座会被沙发靠背挡住",
  "why": "沙发靠墙摆放且靠背高于插座时，侧面或背后插座没法正常插拔，手机充电和落地灯都用不了。",
  "fix": "把沙发往一侧挪出空位，或选侧边不遮挡的款式；如果还没做水电，可提前和电工确认是否调高或侧移。",
  "ask": ["这个插座离地高度确定了吗？", "沙发背后还需不需要留插座，还是挪到两侧？"],
  "stage": "layout",
  "severity": "costly",
  "check": [
    { "kind": "select", "objectType": "sofa" },
    {
      "kind": "geom",
      "test": { "op": "clearance", "from": { "type": "sofa" }, "to": { "anchor": "socket" }, "lt": 150, "checkHeight": true }
    }
  ],
  "source": "常见软装布局与室内人体工学经验",
  "verified": false
}
```

```jsonc
{
  "id": "living.sofa.blocked-by-door",
  "space": "living",
  "objectType": "sofa",
  "title": "转角沙发挡住了阳台门",
  "why": "门扇开到 90° 的扫掠区被沙发贵妃位占住，门只能开一条缝进人。",
  "fix": "把沙发往内侧挪出扫掠半径，或换成不带贵妃位的直排沙发。",
  "ask": ["这扇阳台门平时向内开还是改成推拉门？"],
  "stage": "layout",
  "severity": "blocking",
  "check": [
    { "kind": "geom", "test": { "op": "sweep", "door": { "wallKind": "door" }, "blockedBy": { "type": "sofa" } } }
  ],
  "source": "常见室内动线与门扇扫掠规范",
  "verified": false
}
```

```jsonc
{
  "id": "living.sofa.cannot-enter",
  "space": "living",
  "objectType": "sofa",
  "title": "超过 2.2 米的整装沙发可能进不了电梯或入户门",
  "why": "很多小区电梯轿厢高度或入户门拐角不够，沙发送到楼下进不了门，大件退换运费极高。",
  "fix": "下单前先量电梯门高/对角线和入户门净宽，或确认沙发能否分体拆包进门。",
  "ask": ["这款沙发是整装还是分段可拆包发货？外包装最长边多少？"],
  "stage": "confirm",
  "severity": "costly",
  "check": [
    { "kind": "select", "objectType": "sofa" },
    { "kind": "prop", "target": { "type": "sofa" }, "test": { "field": "w", "gt": 2200 } }
  ],
  "source": "家具入户搬运常见门槛",
  "verified": false
}
```

## 11. 埋点

| 事件 | 参数 | 回答什么问题 |
|---|---|---|
| `pitfall_shown` | pitfall_id, severity, layer | 哪类提示最常出现 |
| `pitfall_expanded` | pitfall_id | 用户会不会点开看细节 |
| `pitfall_dismissed` | pitfall_id, dwell_ms | **哪条提示是噪音**（关得越快越该删） |
| `pitfall_acted` | pitfall_id, action（挪动/改尺寸/复制 ask） | 提示有没有真的改变购买或布局决定 |

**最重要的指标是 `pitfall_acted`。** 一条提示被看到 100 次、被行动 0 次，就应该删掉或重写。

## 12. 验收清单

- [ ] 几何数据不足时返回 `null` 降级为 L1，不误报
- [ ] **保留完整规则，逐项改动测试输入边界**：例如 `w > 2200` 在 `w=2201` 且选中沙发时触发，`w=2200` 或取消选中时不触发；平开门衣柜挡住时触发，切到推拉门后立即解除
- [ ] **L1 纯内容提醒全部采用待核对提问/条件式表达**，不误判用户现状
- [ ] **`auditPlan` 静态快照审计独立于交互选态**：同一份快照无论当前选中哪件家具、关闭过哪些提示，冲突计数与对比差异恒为零
- [ ] 同屏最多 1 条 `blocking`
- [ ] 关闭后 24h 不再主动弹
- [ ] 所有涉水电/燃气/防水条目均只给提醒和 `ask` 问题清单，无施工参数、无承重/拆改内容
- [ ] 上线条目经过规范核对，并在合适时机请专业人士复核标 `verified: true`
