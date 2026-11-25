# 03 · 技术架构

## 目标与设计原则

| 维度 | 决策 |
|---|---|
| **视觉与体验** | **高质感轻量 3D**：PBR 材质（木地板、墙漆、玻璃、织物）+ 柔和布光与接触阴影 + 高辨识度多部件家具，拒绝简陋线框 |
| **工程架构** | **Next.js App Router 全栈一体** + Drizzle ORM（PostgreSQL / 本地 SQLite），承接云端快照、短链分享、家人投票与埋点 |
| **核心纯度** | `@fitly/layout-engine` 与 `@fitly/content` **纯 TS、零 DOM/WebGL 依赖**，支持多房间与精确 `mm` 几何判定 |
| **免登录门槛** | 匿名工作区 Token（Cookie + LocalStorage）免登录即可试摆、存快照、发分享；后续可无缝绑定账号 |

## 仓库结构

```text
fitly/
├── docs/                       设计文档
├── package.json                pnpm workspace root
├── pnpm-workspace.yaml
└── packages/
    ├── layout-engine/          @fitly/layout-engine（纯 TS，零渲染依赖）
    │   ├── src/
    │   │   ├── types.ts        Plan / Room / Wall / Opening / Anchor / FurnitureItem
    │   │   ├── geometry.ts     多边形、方向性净空、高度遮挡、门扇扫掠、动线总长
    │   │   ├── query.ts        GeometryQuery 的默认实现（返回 GeomHit）
    │   │   └── index.ts
    │   └── test/               Vitest 几何边界测试
    ├── content/                @fitly/content（纯 TS，零渲染依赖）
    │   ├── src/
    │   │   ├── types.ts        Pitfall / Trigger / GeomHit（见 02）
    │   │   ├── evaluate.ts     触发器求值
    │   │   ├── data/           living.ts / kitchen.ts / bedroom.ts（31 条全量）
    │   │   └── index.ts
    │   └── test/               Vitest 规则与单条件拆解测试
    └── web/                    @fitly/web（Next.js App Router）
        ├── src/
        │   ├── app/            App Router 页面（工作台 / 户型编辑器 / 对比页 / SSR 分享页 / API）
        │   ├── db/             Drizzle schema & migrations（plans / snapshots / shares / votes / events）
        │   ├── scene/          React Three Fiber 3D 场景、PBR 材质、三视角相机、尺寸线、高亮
        │   ├── plan/           示例户型、参数化编辑器、底图辅助描墙与比例尺校准
        │   ├── pitfall/        半屏/侧边避坑卡片、全量列表、冷却状态
        │   └── compare/        任意两版对比（幽灵轮廓叠加 + 指标差异面板）
        ├── tests/e2e/          Playwright 端到端测试
        └── package.json
```

依赖方向**严格单向**：

```text
web ──► content ──► layout-engine
                 ▲
        （只通过 GeometryQuery 接口反向注入）
```

## 3D 引擎：高质感轻量 React Three Fiber

采用 `three` + `@react-three/fiber` + `@react-three/drei`：

1. **三视角一键切换**：
   - **3D 漫游/斜角视角**（`PerspectiveCamera`）：默认探索全局体量、采光与高度关系。
   - **人眼平视视角**（1650mm 视高）：站进客厅/卧室看压迫感、电视高度与过道宽度。
   - **正交顶视图**（`OrthographicCamera` 正上方俯视）：毫米级贴墙、对缝、精准拖拽量尺。
2. **PBR 质感与轻量性能平衡**：
   - **空间材质**：墙体采用哑光墙漆色阶；地面支持常见木地板/瓷砖程序化纹理；阳台门窗使用半透玻璃 + 金属框体；墙面插座/开关/燃气表位按真实 `heightMm` 呈现立体点位模型。
   - **光影**：半球环境光 + 定向主光 + `ContactShadows` 接触阴影，无需高耗能实时光线追踪即可获得清晰空间层次。
   - **家具建模**：多部件参数化组合几何体（如沙发拆分为底座、靠背、扶手、可选贵妃榻、抱枕；衣柜带可动画开合的平开门扇与扫掠扇区），支持切换常见尺寸规格与配色材质，保证尺寸随参数变化 **100% 精确无畸变**。
3. **跨端手势与操作体系**：
   - **手机端手势隔离**：未选中物件时单指 Orbit 旋转/双指缩放；选中家具后锁定相机，单指只在地面（XZ 平面）拖拽，配合智能贴墙/90°正交吸附、外置精确旋转按钮和尺寸切换条。
   - **桌面端**：支持鼠标拖拽 + 滚轮缩放 + 快捷键（撤销/重做、旋转、切换视角）。
4. **3D 实景标尺与避坑高亮**：
   - 根据 `GeomHit.witness` 在 3D 空间直接绘制净空距离标尺线与数字标签；触发避坑时脉冲高亮对应的插座、门扇扫掠区或冲突家具。

## 坐标系与单位

- **核心层（`layout-engine` / `content`）**：单位统一为**毫米（mm）**整数，平面坐标 `x` 向右、`y` 向深，高度字段 `z` / `h` / `heightMm` 向上。
- **渲染层（`web/src/scene`）**：进入 Three.js 时统一除以 `1000` 转为**米（m）**，映射 `(x, y, z_mm)` → `(x/1000, z_mm/1000, y/1000)`。

## 户型数据格式与三合一输入管线

```ts
// packages/layout-engine/src/types.ts

export interface Point { x: number; y: number }

export interface RoomZone {
  id: string;
  space: Space;                // 'living' | 'kitchen' | 'bedroom' | ...
  name: string;
  polygon: Point[];            // 闭合多边形边界，用于空间归属与地板渲染
  floorMaterial?: 'wood' | 'tile' | 'marble';
}

export interface Wall {
  id: string;
  a: Point; b: Point;
  thickness: number;           // mm，常见 120 / 200 / 240
  heightMm?: number;           // 默认 2800
}

export interface Opening {
  id: string;
  wallId: string;
  kind: 'door' | 'window' | 'pass';
  offset: number;              // 从墙起点算的距离
  width: number;
  height?: number;
  sillHeightMm?: number;
  swing?: {
    /** 与 Anchor.side 一致：以有向墙 wall.a -> wall.b 为基准的左/右侧，彻底消除共享墙 in/out 歧义 */
    side: 'left' | 'right';
    hinge: 'start' | 'end';
    angleDeg?: number;         // 默认 90
  };
}

export interface Anchor {
  id: string;
  kind: 'socket' | 'switch' | 'gas' | 'drain' | 'water' | 'flue';
  /** 贴墙点位优先绑定 wallId + offset，改墙尺寸时自动随墙移动 */
  wallId?: string;
  offset?: number;             // 从墙起点算的距离（mm）
  side?: 'left' | 'right';     // 墙体朝向哪一侧（以 wall.a -> wall.b 为基准）
  /** 地面独立点位（如地漏）或由 wallId+offset 实时解析出的世界坐标 */
  at?: Point;
  heightMm?: number;           // 距地高度，用于 3D 渲染与高度遮挡判定
  roomId?: string;
}

export interface FurnitureItem {
  id: string;
  type: ObjectType;
  roomId?: string;
  space?: Space;
  x: number; y: number;
  z?: number;                  // 离地高度（mm），挂墙电视/吊柜用
  w: number; d: number; h: number;
  rotation: number;            // 度数，0 度约定正面朝 +y
  variant?: 'standard' | 'l-shape-left' | 'l-shape-right' | 'sliding-door' | 'hinged-door' | 'unknown';
  chaiseW?: number;            // L 型转角贵妃位/拐角宽度（mm）
  chaiseD?: number;            // L 型转角突出进深（mm）
  materialPreset?: string;     // 配色/材质预设
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
  };
  rooms: RoomZone[];
  walls: Wall[];
  openings: Opening[];
  anchors: Anchor[];
  fixtures: FurnitureItem[];   // 固定构件：烟道、柱子、地漏等
  furniture: FurnitureItem[];  // 用户试摆的家具与大件家电
}
```

### 可编辑设计模板与三合一户型建图管线

1. **可编辑设计模板（`DesignPreset`）**：在典型中国住宅格局上预置多套功能取舍方案（如 3.6m 客厅提供“一家人观影型”和“亲子活动留空型”两套已配好家具的 `Plan`），用户选中后即可直接改房间开间进深、换沙发长度，降低空白页启动阻力。
2. **参数化房间编辑**：点击任意墙体/房间直接修改开间、进深、门窗位置与基于 `wall.a -> wall.b` 的开门左右侧，实时重生成 3D 空间。
3. **2D 户型图底图辅助建图**：
   - 用户上传平面户型图片后，采用**浏览器端 Canvas 灰度二值化 + 直线段检测算法**在本地提取候选墙段（纯前端、零接口费用、离线可用）；
   - 用户拉一条参考线标定已知长度（例如客厅开间 `3800mm`）完成比例尺校准；
   - 支持交互式拖拽墙角端点吸附（正交/45°吸附）与添加门窗/贴墙点位（自动绑定 `wallId + offset`），确保最终生成的 `Plan` 几何 100% 干净准确。

## layout-engine 的核心能力

```ts
export function createQuery(
  plan: Plan,
  scope?: { selectedId?: string; roomId?: string; space?: Space },
): GeometryQuery;

export interface GeometryQuery {
  clearance(from: Sel, to: Sel, opts?: { face?: Face; checkHeight?: boolean }): GeomHit | null;
  distance(a: Sel, b: Sel, opts?: { checkHeight?: boolean }): GeomHit | null;
  overlap(a: Sel, b: Sel, opts?: { checkHeight?: boolean }): GeomHit | null;
  sweepBlocked(door: Sel, blockedBy: Sel): GeomHit | null;
  pathLength(parts: Sel[]): number | null;
  getItemProp(target: Sel, field: 'w' | 'd' | 'h'): number | null;
  getItemVariant(target: Sel): FurnitureVariant | null;
}
```

底层几何原语：

1. **`toPolygons(item)`** —— 将物件分解为 1 个（普通矩形）或 2 个（L 型转角沙发 / L 型橱柜）旋转后的 2D 凸多边形及功能朝向边（`front` / `back` / `sides`），避免 L 型空角产生碰撞误报。
2. **`resolveAnchorPoint(anchor, walls)`** —— 贴墙点位由 `wallId + offset + side` 实时换算世界坐标，确保参数化改墙长时插座/燃气位自动跟随移动。
3. **`edgeGap(polysA, polysB)`** —— 多边形集合之间的最短边距及最近点对 `witness`。
4. **`heightOverlap(a, b)`** —— Z 轴高度区间重叠检测。
5. **`sweptArea(opening)`** —— 门扇扫掠扇形多边形。
6. **`intersects(polysA, polysB)`** —— SAT 相交检测。

**多房间隔离与 `null` 降级原则**：多房间 `Plan` 下，选择器优先绑定 `scope.selectedId` 并限定在当前 `roomId`/`space` 内求值（避免卧室床误匹配到客厅插座）；当 `plan.calibrated === false` 或点位缺失时返回 `null`，绝不误报。

## 数据库、快照对比与协同分享（Next.js + Drizzle ORM）

使用 Next.js App Router + Drizzle ORM（开发期兼容 SQLite / 生产接入 PostgreSQL）：

| 表 | 职责 |
|---|---|
| `plans` | 用户匿名工作区下的户型数据与当前最新布局 |
| `snapshots` | 自动快照与用户手动保存的命名版本（`snapshot_id`、`label`、`plan_json`、`created_at`） |
| `shares` | 短链分享记录（`short_code`、关联的一版或对比两版 `snapshot_id`、OG 摘要） |
| `votes` | 家人打开分享页后的选品表态（支持哪一版 + 昵称 + 一句话批注） |
| `events` | 核心产品漏斗与避坑命中行为埋点 |

### 核心能力闭环

- **任意两版对比**：选中任意两个快照，统一调用 `@fitly/content` 的静态审计入口 `auditPlan()` 计算两版冲突数与具体冲突项（彻底独立于当前选中家具、冷却或关闭状态，确保相同快照差异恒为零），配合 **3D 幽灵轮廓叠加**与**分屏对比**展示尺寸、净空与冲突数差异。
- **SSR 短链分享页 `/s/[code]`（严格区分 Server / Client 边界）**：
  - `next.config` 配置 `transpilePackages: ['@fitly/layout-engine', '@fitly/content']` 直接消费内部 TS 包。
  - **Server Component** 负责查询 Drizzle DB、注入微信友好的 SSR OpenGraph Meta 与方案摘要；**Client Component** 通过 `next/dynamic(..., { ssr: false })` 懒加载 React Three Fiber `<Canvas>` 避免服务端 WebGL 报错，打开后支持 3D 只读旋转查看与点击「我投这一版」/留批注。

## 状态管理

工作台采用 `useReducer` + Context（结合去抖云端同步与本地快照兜底）：

```text
{ plan, activeSpace, viewMode('3d'|'eye'|'top'), selection, history(undo/redo), snapshots, stage, shownPitfalls, dismissedIds }
```

## 测试与质量保障

| 层 | 测什么 | 工具 |
|---|---|---|
| `layout-engine` | 几何原语、方向净空、Z 轴高度遮挡、门扇扫掠、三角动线、`null` 降级 | Vitest |
| `content` | 全部 `Pitfall` 保留完整规则做输入边界/门型切换测试（含 `auditPlan` 静态快照一致性和边界不触发测试） | Vitest |
| `web` (API/逻辑) | 快照保存、对比 diff 计算、分享投票 API | Vitest |
| `web` (端到端) | 选/改户型 → 3D 放家具 → 触发避坑并修正 → 存快照对比 → 分享与投票 | Playwright |
