# 02 · 避坑触发器引擎

> 这是 Fitly 唯一别人抄不走的部分。设计它之前，先接受一句话：
> **它不是知识库，是触发器。**

---

## 1. 它不是什么

| 不是 | 为什么 |
|---|---|
| 不是文章列表 | 用户在拖家具，不会去读一篇《沙发选购指南》 |
| 不是 FAQ | 用户不知道自己该问什么，所以问不出来 |
| 不是 AI 生成的泛泛而谈 | 一份没有数字的"注意事项"，等于没提醒 |
| **不是"点一下弹一篇文章"** | 那只是内容站，跟小红书没区别 |

## 2. 它是：在用户做决定的瞬间，说出一句关于"他家"的具体事实

两个要素缺一不可：

- **关于他家** —— 带几何数据（"你这儿只剩 12cm"），不是通用建议
- **在做决定时** —— 出现在拖动沙发的那一刻，不是出现在首页

## 3. 四层触发器

| 层 | 触发源 | 例子 | 价值 |
|---|---|---|---|
| **L1 点选** | 用户点了沙发 / 衣柜 / 灶台 | 「平开门衣柜，前面要有 60cm 开门空间」 | 内容是通用的，但出现在正确时刻 |
| **L2 几何** | 算出来的距离 / 碰撞 / 扫掠 | 「沙发右端离插座 12cm，会被侧板挡住」 | **只有 Fitly 有**，需要户型数据 |
| **L3 空间** | 用户切到厨房 / 卫生间 | 「台面高度按身高算，别一刀切 85cm」 | 空间一进来就把关键坑铺好 |
| **L4 阶段** | 用户进入"确认方案" | 「先去量电梯净高和入户门净宽」 | 把不可逆的动作拦在下单前 |

**L1 是内容，L2 是护城河。** 只做 L1，你就是一个会弹卡片的装修百科；做了 L2，用户会觉得"它在看我家"。

## 4. 数据模型

```ts
// packages/content/src/types.ts

export type Space = 'living' | 'kitchen' | 'bedroom' | 'bath' | 'entry';
export type Stage = 'measure' | 'layout' | 'confirm';

export type ObjectType =
  | 'sofa' | 'teaTable' | 'tvCabinet' | 'tv' | 'rug' | 'aircon' | 'curtain'
  | 'wardrobe' | 'bed' | 'nightstand'
  | 'fridge' | 'stove' | 'sink' | 'counter' | 'dishwasher' | 'rangeHood';

export type Severity = 'blocking' | 'costly' | 'annoying';

/** 选择器：在方案里"找谁" */
export type Sel =
  | { type: ObjectType }      // 按物件类型
  | { id: string }            // 具体某个物件
  | { anchor: 'socket' | 'wall' | 'door' | 'window' | 'corner' };

/** 几何判定：需要 layout-engine 求值 */
export type GeomTest =
  | { op: 'clearance'; from: Sel; to: Sel; lt: number }   // 净空 < lt(mm)
  | { op: 'distance';  a: Sel; b: Sel; lt: number }       // 中心距 < lt(mm)
  | { op: 'overlap';   a: Sel; b: Sel }                   // 投影相交
  | { op: 'sweep';     door: Sel; blockedBy: Sel }        // 门扇扫掠区被挡
  | { op: 'sum';       parts: Sel[]; lt?: number; gt?: number }; // 动线总长

export type Trigger =
  | { kind: 'select'; space?: Space; objectType?: ObjectType }
  | { kind: 'enter';  space: Space }
  | { kind: 'stage';  stage: Stage }
  | { kind: 'geom';   test: GeomTest };

export interface Pitfall {
  id: string;                 // 'living.sofa.blocks-socket'
  space: Space;
  objectType?: ObjectType;

  /** 一句话就是坑本身，含数字。不要写成教程标题 */
  title: string;
  /** 为什么会踩 */
  why: string;
  /** 怎么解决，给数字或给动作 */
  fix?: string;
  /** 用户该去问谁、问什么 */
  ask?: string[];

  stage: Stage;
  severity: Severity;

  /** 满足全部条件才触发（AND）。要"任一"就拆成两条 */
  check: Trigger[];

  /** 出处 / 审校状态 */
  source?: string;
  verified: boolean;
}
```

### 设计取舍：`check` 是 AND，不是 OR

一条 `Pitfall` 里所有 `Trigger` 必须**同时**满足才显示。

- 好处：可预测、可测试、不出现"随机弹出"的诡异感
- 需要"任一条件"时，拆成两条 `Pitfall` —— 反正它们本来也是不同的坑

## 5. 求值流程

```
用户操作（选中 / 拖动 / 切空间 / 进确认页）
        │
        ▼
web 层收集事件 → 组装 EvalContext
        │
        ▼
content.evaluate(pitfalls, ctx, query)   ← 依赖注入几何查询，不直接依赖 layout-engine
        │
        ├── 按 kind 过滤：select / enter / stage 直接判
        └── kind==='geom' → query.clearance(...) 等
        │
        ▼
按 severity 排序 + 去重 + 冷却过滤
        │
        ▼
UI：默认只露 1 条 blocking，其余折叠
```

依赖倒置在这里很重要——`content` 只声明"我需要知道沙发到插座的距离"，由 `layout-engine` 实现查询。这样将来上小程序、换渲染层，内容包一行不用改。

```ts
export interface GeometryQuery {
  clearance(from: Sel, to: Sel): number | null;   // null = 数据不足，无法判定
  distance(a: Sel, b: Sel): number | null;
  overlap(a: Sel, b: Sel): boolean;
  sweepBlocked(door: Sel, blockedBy: Sel): boolean;
  pathLength(parts: Sel[]): number | null;
}

export function evaluate(
  pitfalls: Pitfall[],
  ctx: { selected?: ObjectType; space: Space; stage: Stage },
  q: GeometryQuery,
): Pitfall[];
```

**`null` 的处理是个关键设计**：几何数据不足时（用户没校准尺寸），不要当成"没问题"放过去，也不要用假数据吓人。此时降级——只显示 L1 的内容型提示，并在卡片上标一句"尺寸未校准，先标定再看结论"。

## 6. 严重度分级与呈现

| severity | 含义 | 颜色 | 呈现 |
|---|---|---|---|
| `blocking` | 会让方案做错、装完不可逆 | 红 | **主动弹出**，半屏卡片，必须看到 |
| `costly` | 会返工、会多花钱 | 黄 | 收在"还有 N 条"里，角标提醒 |
| `annoying` | 有点烦，能忍 | 灰 | 只在"全部"列表里 |

**同屏最多 1 条 blocking。** 一次弹 5 条等于没弹。

### 冷却与去重

- 同一 session 内，同一条 `Pitfall` 只主动弹 1 次
- 用户手动关掉的，24 小时内不再主动弹（但在"全部"里仍可查）
- 用户改了只影响这条的尺寸后（比如把沙发挪开），可以重新触发一次——这反而是"我改对了"的正反馈

## 7. UI 规范

点选家具后，从底部升起半屏卡片（高度约 40%，可拖拽）：

```
┌─────────────────────────────────┐
│ ● 你家这个插座会被沙发挡住        │  ← blocking，红点
│   沙发右端离它 12cm               │  ← 具体数字，不是"可能"
│                                  │
│   改到沙发两侧 / 抬高到 900mm      │  ← fix
│                                  │
│   问师傅：沙发背后还要留插座吗？    │  ← ask
│                                  │
│   还有 4 条  ›                    │
└─────────────────────────────────┘
```

规则：

- **标题必须带数字或明确动作**，不写"注意插座位置"这种废话
- 正文总长 ≤ 60 字（不含 ask）
- 卡片不遮挡正在拖的家具——从底部升起，图上物体自动上移视口
- 「还有 N 条」进全量列表，列表按 severity 排序，blocking 永远在最前

## 8. 内容红线（写之前先读这一段）

装修涉及**水电、燃气、承重、防水**，写错会害人，也会给自己招麻烦。三类内容只允许"提醒去问谁"，不允许给具体做法：

| 类别 | 允许写 | 禁止写 |
|---|---|---|
| **燃气** | 「燃气管道不能包死在柜体里，必须留检修口；具体以当地燃气公司要求为准」 | 具体的改管方案、管径、距离数值 |
| **承重结构** | 「拆改前必须找物业调结构图纸确认」 | 判断哪面墙能拆、怎么加固 |
| **电路增容** | 「大功率电器要单独回路，让电工核算总负荷」 | 具体线径、空开规格 |
| **防水** | 「做完要做闭水试验，以试验结果为准」 | 具体材料用量、施工工序细节 |

统一收尾句：**「最终以现场师傅和当地燃气/物业确认为准。」**

内容里**不出现品牌名、不承诺价格**。一旦出现，你的中立性就没了。

## 9. 写作规范

| 规则 | 好 | 坏 |
|---|---|---|
| 标题写后果 | 「平开门衣柜前面被床挡死，门只能开一半」 | 「衣柜选购注意事项」 |
| 带数字 | 「前面留够 60cm」 | 「留够一定的距离」 |
| 说清代价 | 「装完才发现，柜门要拆重做」 | 「影响使用体验」 |
| 给动作 | 「先把床挪 15cm，或换推拉门」 | 「需要注意一下」 |
| 不喊口号 | —— | 「千万要注意！」「一定要注意！」 |

## 10. 完整样例（可直接入库）

```jsonc
{
  "id": "living.sofa.blocks-socket",
  "space": "living",
  "objectType": "sofa",
  "title": "你家这个插座会被沙发挡住",
  "why": "沙发靠墙摆放时，侧板会把墙面插座挡住，手机充电、落地灯全都没法用。",
  "fix": "插座改到沙发两侧，或抬高到 900mm 左右藏在沙发背后；已经做好就买个薄的侧插。",
  "ask": ["沙发背后还需不需要留插座？", "沙发两侧墙面能开槽吗？"],
  "stage": "layout",
  "severity": "costly",
  "check": [
    { "kind": "select", "objectType": "sofa" },
    { "kind": "geom", "test": { "op": "clearance", "from": { "type": "sofa" }, "to": { "anchor": "socket" }, "lt": 300 } }
  ],
  "source": "常见施工做法",
  "verified": false
}
```

```jsonc
{
  "id": "living.sofa.blocked-by-door",
  "space": "living",
  "objectType": "sofa",
  "title": "转角沙发挡住了阳台门",
  "why": "门扇开到 90° 的扫掠区被沙发占住，只能开一条缝进人。",
  "fix": "把沙发往内侧挪出扫掠半径，或换成不带贵妃位的直排。",
  "stage": "layout",
  "severity": "blocking",
  "check": [
    { "kind": "geom", "test": { "op": "sweep", "door": { "anchor": "door" }, "blockedBy": { "type": "sofa" } } }
  ],
  "verified": false
}
```

```jsonc
{
  "id": "kitchen.counter.height",
  "space": "kitchen",
  "title": "台面别一刀切 85cm，按身高算",
  "why": "统一高度对高个子太低、弯腰洗菜；对矮个子太高、抬肩炒菜。",
  "fix": "操作台 ≈ 身高 ÷ 2 + 5cm；灶台再低 5–8cm 更省腰。",
  "stage": "layout",
  "severity": "costly",
  "check": [{ "kind": "enter", "space": "kitchen" }],
  "source": "常见人体工学做法",
  "verified": false
}
```

## 11. 埋点

这套东西能不能立住，全靠数据回答"用户是不是真的在意"：

| 事件 | 参数 | 回答什么问题 |
|---|---|---|
| `pitfall_shown` | pitfall_id, severity, layer | 哪类提示最常出现 |
| `pitfall_expanded` | pitfall_id | 用户会不会点开看细节 |
| `pitfall_dismissed` | pitfall_id, dwell_ms | **哪条提示是噪音**（关得越快越该删） |
| `pitfall_acted` | pitfall_id, action（挪动/改尺寸/复制 ask） | 提示有没有真的改变行为 |

**最重要的指标是 `pitfall_acted`。** 一条提示被看到 100 次、被行动 0 次，就应该删掉或重写。

## 12. 验收清单

- [ ] 数据不足时降级为 L1，不误报
- [ ] 删除 `check` 中任一条件，该条不再触发（每条触发器都有测试）
- [ ] 同屏最多 1 条 blocking
- [ ] 关闭后 24h 不再主动弹
- [ ] 所有 `blocking` 条目都通过人工审校（`verified: true`）
- [ ] 燃气/承重/电路三类内容，逐字检查过红线
- [ ] 每条都有 `source`
