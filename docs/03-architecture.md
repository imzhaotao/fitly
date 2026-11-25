# 03 · 技术架构

## 目标与约束

| 约束 | 决定 |
|---|---|
| 单人开发，两周上线 | 不引入后端、不引入 WebGL、不引入 3D 引擎 |
| 当前最大未知数是**交互手感** | 选择能热更新、改一行就能看到效果的载体（Vite） |
| 将来可能上小程序 | 业务核心（几何 + 内容）必须是**纯 TS、零 DOM 依赖** |
| 流量早期全来自小红书 / 微信 | 分享链接必须能被任何人直接打开，不能要求登录 |

## 仓库结构

```
fitly/
├── docs/                       设计文档（当前阶段）
├── package.json                workspace root
├── pnpm-workspace.yaml
└── packages/
    ├── layout-engine/          @fitly/layout-engine
    │   ├── src/
    │   │   ├── types.ts        Plan / Wall / Opening / FurnitureItem
    │   │   ├── geometry.ts     多边形、间距、扫掠区
    │   │   ├── query.ts        GeometryQuery 的默认实现
    │   │   └── index.ts
    │   └── test/               几何用例，纯函数，先写测试
    ├── content/                @fitly/content
    │   ├── src/
    │   │   ├── types.ts        Pitfall / Trigger（见 02）
    │   │   ├── evaluate.ts     触发器求值
    │   │   ├── data/           living.ts / kitchen.ts / bedroom.ts
    │   │   └── index.ts
    │   └── test/
    └── web/                    @fitly/web
        ├── src/
        │   ├── App.tsx
        │   ├── plan/           户型选择、校准
        │   ├── canvas/         SVG 渲染层 + 拖拽
        │   ├── pitfall/        半屏卡片、全量列表
        │   └── share/          URL 编码 / 解码
        └── index.html
```

依赖方向**严格单向**：

```
web ──► content ──► layout-engine
                 ▲
        （只通过 GeometryQuery 接口反向注入）
```

`layout-engine` 不 import `content`，`content` 不 import `web`，谁都不 import React（除了 `web`）。

## 渲染：选 SVG，不选 Canvas 或 WebGL

| 方案 | 判断 |
|---|---|
| WebGL / Three.js | ❌ 第一版不做 3D，杀鸡用牛刀 |
| Canvas 2D | ⚠️ 性能没问题，但**命中检测、事件、尺寸标注、无障碍**全要自己写 |
| **SVG** | ✅ 每个家具是一个 `<g>`，拖拽用 pointer 事件，标注用 `<text>`，样式用 CSS |

客厅场景最多 10 来个物件，SVG 的性能绰绰有余。**省下来的时间全部用于打磨拖拽手感和间距显示**——这才是决定用户留不留下的东西。

将来要冲性能（全屋 50+ 物件）或上 3D，只需要替换 `web/src/canvas`，`layout-engine` 和 `content` 不动。

## 坐标系与单位

- 单位统一 **毫米（mm）**，整数。永远不要在内部用米或像素。
- 原点在户型包围盒左上角，**x 向右，y 向下**（屏幕坐标系，减少心智负担）。
- 旋转角度用**度数**，绕物件中心。
- 缩放只影响渲染，不影响数据。

这条规则写死：**任何进入 `layout-engine` 的数值都是 mm。** 显示时才转成"1.2 米"。

## 户型数据格式

```ts
// packages/layout-engine/src/types.ts

export interface Point { x: number; y: number }

export interface Wall {
  id: string;
  a: Point; b: Point;
  thickness: number;           // mm，常见 200 / 240
}

export interface Opening {
  id: string;
  wallId: string;
  kind: 'door' | 'window' | 'pass';
  offset: number;              // 从墙起点算的距离
  width: number;
  height?: number;
  swing?: {                    // 门扇扫掠
    dir: 'in' | 'out';
    hinge: 'start' | 'end';
    angleDeg?: number;         // 默认 90
  };
}

export interface Anchor {                 // 墙面上的点位，避坑要用
  id: string;
  kind: 'socket' | 'switch' | 'gas' | 'drain' | 'water' | 'flue';
  at: Point;
  heightMm?: number;           // 距地高度，用于"会不会被家具挡住"
  wallId?: string;
}

export interface FurnitureItem {
  id: string;
  type: ObjectType;
  x: number; y: number;        // 中心点
  w: number; d: number; h: number;
  rotation: number;
  catalogId?: string;
}

export interface Plan {
  id: string;
  version: 1;
  unit: 'mm';
  meta: {
    city: string;
    community: string;
    areaSqm: number;
    layout: string;            // '2室2厅1卫'
  };
  walls: Wall[];
  openings: Opening[];
  anchors: Anchor[];
  fixtures: FurnitureItem[];   // 固定的：烟道、柱子、门套
  furniture: FurnitureItem[];  // 用户放的
}
```

户型模板以 **JSON 文件**形式放在 `packages/web/src/plans/`，一期 3–5 个小区 × 每小区 2–3 套。**人工建模**，用脚本从 CAD 导出的坐标手填，不做自动识别。

## layout-engine 的核心能力

```ts
export interface GeometryQuery {
  clearance(from: Sel, to: Sel): number | null;
  distance(a: Sel, b: Sel): number | null;
  overlap(a: Sel, b: Sel): boolean;
  sweepBlocked(door: Sel, blockedBy: Sel): boolean;
  pathLength(parts: Sel[]): number | null;
}
```

底层只需要四个几何原语：

1. **`toPolygon(item)`** —— 任何物件 → 矩形按 rotation 旋转后的凸多边形
2. **`edgeGap(polyA, polyB)`** —— 两个凸多边形之间的最短边距（分离轴 + 顶点到边距离）
3. **`sweptArea(opening)`** —— 门扇按铰链点旋转 `angleDeg` 后的扇形多边形
4. **`intersects(polyA, polyB)`** —— SAT 相交检测

其余全部是组合。**先写这 4 个的单元测试，再写 UI。**

### 数据不足时的返回 `null`

用户没校准尺寸，或者户型模板缺插座点位——返回 `null` 而不是 `0`。

- `null` → 该条几何触发器不触发，降级为内容型提示
- UI 上标注"尺寸未校准"，并给一个"去校准"的入口

**宁可少提示，不要误报。** 误报一次，用户就不信你了。

## 内容包不依赖几何实现

`content` 只声明"我需要沙发到插座的距离"，由 `web` 层把 `layout-engine` 的实现注入进去：

```ts
// web/src/pitfall/evaluate.ts
import { createQuery } from '@fitly/layout-engine';
import { evaluate } from '@fitly/content';

const found = evaluate(pitfalls, ctx, createQuery(plan));
```

这样 `content` 可以被 Taro / 小程序直接引用，测试里也能塞一个假 query。

## 没有后端：方案编码进 URL

第一版**不做服务端**。存两版方案、分享给家人，全部靠 URL。

```ts
// 序列化：只存 id + 位置，不存完整户型
type SharePayload = {
  v: 1;
  planId: 'sh-kaiyun-89-a';
  layout: Array<[itemTypeId: number, x: number, y: number, rot: number]>;
  title?: string;
};
```

用 `lz-string` 的 `compressToEncodedURIComponent`，1KB 的 JSON 压成约 600 字符，完全放得进 URL。

好处：

- 零数据库、零登录、零运维
- 分享链接天然可被微信打开
- 用户改完再生成新链接，A/B 对比就是两个链接

代价：

- 链接长（可接受，微信里点一下就行）
- 无法统计"谁看了"（埋点查不到分享方的打开，只能靠前端事件——这部分先接受）

**什么时候加后端**：当需要"多设备同步"或"多人协同编辑"时。第一版不需要。

## 状态管理

用 `useReducer` + Context 就够，别上 Redux/Zustand。

状态形状：

```
{ plan, selection, history(undo栈), stage, shownPitfalls, dismissedIds }
```

撤销栈很重要——用户拖歪了要能一键回去，这是"敢乱试"的前提。**没有 undo，用户不敢拖。**

## 埋点

第一版可以用一个 30 行的自建上报（`navigator.sendBeacon` 到一个免费 endpoint），不用引 SDK。

| 事件 | 用途 |
|---|---|
| `plan_open` / `plan_entered` | 漏斗顶部：多少人真的进了试摆 |
| `item_selected` / `item_moved` | 交互深度 |
| `pitfall_shown` / `_expanded` / `_dismissed` / `_acted` | 内容是否有效（见 02） |
| `plan_saved` / `plan_shared` / `share_opened` | 核心动作 |
| `share_to_wechat` | 主动点击"发给家人" |

## 部署

- 静态站点，`vite build` 产物扔到任意静态托管
- **国内访问要备案**。早期可以用海外托管 + 自定义域名，但微信内打开可能被拦、速度也慢
- 备案主体如果是个人，注意内容类目要求；必要时先买域名、走备案流程，别卡在最后一天

## 测试策略

| 层 | 测什么 | 工具 |
|---|---|---|
| `layout-engine` | 4 个几何原语的边界用例（贴边、旋转 45°、门扇刚好擦过） | Vitest |
| `content` | 每条 `Pitfall` 的 `check` 拆解：删掉任一条件必须不触发 | Vitest |
| `web` | 只测分享编解码的往返一致性 | Vitest |

**不写 e2e**。两周内没有 ROI，手点十遍比写 Playwright 快。
