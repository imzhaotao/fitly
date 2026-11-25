'use client';

import { anchorNormal, pointInPolygon, resolveAnchorPoint, resolveMove, toPolygons, wallDir, wallLength, type Anchor, type FurnitureItem, type Plan, type Point, type RoomZone } from '@fitly/layout-engine';
import { ContactShadows, Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Furniture } from './Furniture';
import { RoomShell } from './Room';
import { dimLabelClass } from '@/ui';

const M = 1 / 1000;

export type ViewMode = '3d' | 'eye' | 'top';

export interface Highlight {
  itemIds: Set<string>;
  targetIds: Set<string>;
  witness?: [Point, Point];
  label?: string;
}

export interface SceneProps {
  plan: Plan;
  view: ViewMode;
  focusRoomId?: string;
  selection?: { kind: 'item' | 'anchor'; id: string } | null;
  highlight?: Highlight;
  ghost?: Plan;
  readOnly?: boolean;
  showMeasures?: boolean;
  /** 变化时相机回到默认视角（“回正”） */
  resetKey?: number;
  /** 正在拖动：选中的家具微微浮起 */
  dragging?: boolean;
  onSelect?: (sel: { kind: 'item' | 'anchor'; id: string } | null) => void;
  /** 拖拽：start 时记录起点，move 时实时更新，end 时入撤销栈 */
  onDrag?: (phase: 'start' | 'move' | 'end' | 'cancel', id: string, pos?: { x: number; y: number }) => void;
  /** 墙上点位沿墙拖动 */
  onAnchorDrag?: (phase: 'start' | 'move' | 'end' | 'cancel', id: string, patch?: Partial<Anchor>) => void;
}

function bounds(poly: Point[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function planBounds(plan: Plan, roomId?: string) {
  const rooms = roomId ? plan.rooms.filter((r) => r.id === roomId) : plan.rooms;
  const all = rooms.flatMap((r) => r.polygon);
  if (all.length === 0) return { x0: 0, x1: 6000, y0: 0, y1: 6000 };
  return bounds(all);
}

function roomAt(plan: Plan, p: Point): RoomZone | undefined {
  return plan.rooms.find((r) => pointInPolygon(p, r.polygon));
}

/** 拖拽吸附：10mm 网格 + 距房间墙面 120mm 内贴墙 */
export function snapPosition(plan: Plan, item: FurnitureItem, x: number, y: number): { x: number; y: number } {
  let nx = Math.round(x / 10) * 10;
  let ny = Math.round(y / 10) * 10;
  const room = roomAt(plan, { x: nx, y: ny }) ?? roomAt(plan, item);
  if (!room) return { x: nx, y: ny };
  const rb = bounds(room.polygon);
  const fb = bounds(toPolygons({ ...item, x: nx, y: ny }).flat());
  const T = 120;
  if (Math.abs(fb.x0 - rb.x0) < T) nx += rb.x0 - fb.x0;
  else if (Math.abs(fb.x1 - rb.x1) < T) nx += rb.x1 - fb.x1;
  if (Math.abs(fb.y0 - rb.y0) < T) ny += rb.y0 - fb.y0;
  else if (Math.abs(fb.y1 - rb.y1) < T) ny += rb.y1 - fb.y1;
  // 不允许穿墙：放得下时把足迹约束在房间内
  const b2 = bounds(toPolygons({ ...item, x: nx, y: ny }).flat());
  if (b2.x1 - b2.x0 <= rb.x1 - rb.x0) {
    if (b2.x0 < rb.x0) nx += rb.x0 - b2.x0;
    else if (b2.x1 > rb.x1) nx -= b2.x1 - rb.x1;
  }
  if (b2.y1 - b2.y0 <= rb.y1 - rb.y0) {
    if (b2.y0 < rb.y0) ny += rb.y0 - b2.y0;
    else if (b2.y1 > rb.y1) ny -= b2.y1 - rb.y1;
  }
  return { x: Math.round(nx), y: Math.round(ny) };
}

function Cameras({ plan, view, focusRoomId, resetKey = 0 }: { plan: Plan; view: ViewMode; focusRoomId?: string; resetKey?: number }) {
  const size = useThree((s) => s.size);
  const b = planBounds(plan, focusRoomId);
  const cx = ((b.x0 + b.x1) / 2) * M;
  const cz = ((b.y0 + b.y1) / 2) * M;
  const w = (b.x1 - b.x0) * M;
  const d = (b.y1 - b.y0) * M;
  const key = `${view}-${focusRoomId ?? 'all'}-${resetKey}`;

  if (view === 'top') {
    const zoom = Math.min(size.width / (w + 0.8), size.height / (d + 0.8)) * 0.92;
    return (
      <>
        <OrthographicCamera key={key} makeDefault position={[cx, 30, cz]} zoom={zoom} up={[0, 0, -1]} near={0.1} far={100} />
        <OrbitControls
          key={`c-${key}`}
          makeDefault
          target={[cx, 0, cz]}
          enableRotate={false}
          enableDamping
          dampingFactor={0.15}
          screenSpacePanning
          mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
          touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
      </>
    );
  }
  if (view === 'eye') {
    // 人眼平视：站在房间靠左 15% 处，视高 1650mm，原地环顾
    const ex = (b.x0 + (b.x1 - b.x0) * 0.15) * M;
    const pos: [number, number, number] = [ex, 1.65, cz];
    return (
      <>
        <PerspectiveCamera key={key} makeDefault position={pos} fov={size.width < size.height ? 85 : 70} near={0.05} far={60} />
        <OrbitControls
          key={`c-${key}`}
          makeDefault
          target={[ex + 0.05, 1.6, cz]}
          enableZoom={false}
          enablePan={false}
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={-0.35}
          minPolarAngle={Math.PI * 0.25}
          maxPolarAngle={Math.PI * 0.75}
        />
      </>
    );
  }
  // 按画面宽高比取能完整装下户型的距离（手机竖屏时宽度是瓶颈）
  const aspect = size.width / Math.max(size.height, 1);
  const fov = 42;
  const t = Math.tan(((fov / 2) * Math.PI) / 180);
  const fit = Math.max(w / 2 / (t * aspect), d / 2 / t);
  const dist = fit * 1.3 + 0.6;
  const dir = new THREE.Vector3(-0.12, 1.05, 0.5).normalize();
  return (
    <>
      <PerspectiveCamera
        key={key}
        makeDefault
        position={[cx + dir.x * dist, dir.y * dist, cz + dir.z * dist]}
        fov={fov}
        near={0.1}
        far={120}
      />
      {/* 惯性 + 俯仰限制在 25°–75°：竖向拖很快到头，转起来不容易歪 */}
      <OrbitControls
        key={`c-${key}`}
        makeDefault
        target={[cx, 0, cz]}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.8}
        minPolarAngle={(25 * Math.PI) / 180}
        maxPolarAngle={(75 * Math.PI) / 180}
        minDistance={1.5}
        maxDistance={30}
      />
    </>
  );
}

/** 双击对准：把旋转中心平滑移到目标点，相机跟着平移，视角不变 */
function FocusController({ goal }: { goal: { p: THREE.Vector3; n: number } | null }) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.Camera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t: number } | null>(null);
  useEffect(() => {
    if (!goal || !controls) return;
    anim.current = { from: controls.target.clone(), to: goal.p.clone(), t: 0 };
  }, [goal, controls]);
  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt / 0.35);
    const k = 1 - Math.pow(1 - a.t, 3);
    const next = a.from.clone().lerp(a.to, k);
    const delta = next.sub(controls.target);
    controls.target.add(delta);
    camera.position.add(delta);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

const TWIST_THRESHOLD = (12 * Math.PI) / 180;

/**
 * 双指扭转：3D 视角绕旋转中心水平转，顶视图旋转平面图。
 * 扭过 12° 才生效，避免双指缩放时手指带一点角度就乱转；与 OrbitControls 的缩放/平移并存。
 */
function TwistController({ view }: { view: ViewMode }) {
  const { camera, gl, controls } = useThree() as unknown as {
    camera: THREE.Camera;
    gl: THREE.WebGLRenderer;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  useEffect(() => {
    if (view === 'eye') return;
    const el = gl.domElement;
    const pts = new Map<number, { x: number; y: number }>();
    let last: number | null = null;
    let accum = 0;
    let engaged = false;
    const angle = () => {
      const [a, b] = [...pts.values()];
      return Math.atan2(b.y - a.y, b.x - a.x);
    };
    const reset = () => {
      last = pts.size === 2 ? angle() : null;
      accum = 0;
      engaged = false;
    };
    const rotate = (delta: number) => {
      if (!controls || delta === 0) return;
      // 手指顺时针扭，画面跟着顺时针转：相机绕竖直轴反向转
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), delta);
      const offset = camera.position.clone().sub(controls.target).applyQuaternion(q);
      camera.position.copy(controls.target).add(offset);
      camera.up.applyQuaternion(q);
      camera.lookAt(controls.target);
      controls.update();
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      reset();
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size !== 2 || last == null) return;
      const a = angle();
      let d = a - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      last = a;
      if (!engaged) {
        accum += d;
        if (Math.abs(accum) < TWIST_THRESHOLD) return;
        engaged = true;
        d = accum - Math.sign(accum) * TWIST_THRESHOLD;
      }
      rotate(d);
    };
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      reset();
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [view, camera, gl, controls]);
  return null;
}

/** 点位拖动时避开门洞：落在门洞范围内就推到较近的门边 */
function avoidDoors(plan: Plan, wallId: string, offset: number): number {
  for (const o of plan.openings) {
    if (o.wallId !== wallId || (o.kind !== 'door' && o.kind !== 'pass')) continue;
    const a = o.offset - 60;
    const b = o.offset + o.width + 60;
    if (offset > a && offset < b) return offset - a < b - offset ? a : b;
  }
  return offset;
}

type DragTarget =
  | { kind: 'item'; item: FurnitureItem }
  | { kind: 'anchor'; anchor: Anchor };

/** 拖动控制：家具在地面上拖，墙上点位沿墙拖；期间锁定相机，第二根手指落下即取消 */
function useDrag(plan: Plan, view: ViewMode, onDrag: SceneProps['onDrag'], onAnchorDrag: SceneProps['onAnchorDrag']) {
  const { camera, gl, controls } = useThree() as unknown as {
    camera: THREE.Camera;
    gl: THREE.WebGLRenderer;
    controls: { enabled: boolean } | null;
  };
  /** started=false 时还在判断是拖动还是双指缩放 */
  const state = useRef<{
    target: DragTarget;
    pointerId: number;
    touch: boolean;
    startX: number;
    startY: number;
    started: boolean;
    /** 起点处“指针位置 → 物体位置”的偏移 */
    base: { dx: number; dy: number; dh: number };
    last: Point;
    /** 长按拿起：等待计时中（手指一动就取消，交还给转视角） */
    hold?: ReturnType<typeof setTimeout>;
    curX: number;
    curY: number;
  } | null>(null);
  const pointers = useRef(new Set<number>());
  const planRef = useRef(plan);
  planRef.current = plan;

  const ray = (clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const r = new THREE.Raycaster();
    r.setFromCamera(ndc, camera);
    return r.ray;
  };
  const groundHit = (clientX: number, clientY: number): Point | null => {
    const hit = new THREE.Vector3();
    if (!ray(clientX, clientY).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return { x: hit.x / M, y: hit.z / M };
  };
  /** 指针在点位所在墙面上的位置：沿墙距离 + 离地高度（顶视图只取沿墙距离） */
  const wallHit = (anchor: Anchor, clientX: number, clientY: number): { offset: number; height: number | null } | null => {
    const w = planRef.current.walls.find((x) => x.id === anchor.wallId);
    const n = anchorNormal(anchor, planRef.current.walls);
    const surf = resolveAnchorPoint(anchor, planRef.current.walls);
    if (!w || !n || !surf) return null;
    const d = wallDir(w);
    let px: number;
    let py: number;
    let height: number | null = null;
    if (view === 'top') {
      const g = groundHit(clientX, clientY);
      if (!g) return null;
      px = g.x;
      py = g.y;
    } else {
      const normal = new THREE.Vector3(n.x, 0, n.y);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(surf.x * M, 0, surf.y * M));
      const hit = new THREE.Vector3();
      if (!ray(clientX, clientY).intersectPlane(plane, hit)) return null;
      px = hit.x / M;
      py = hit.z / M;
      height = hit.y / M;
    }
    return { offset: (px - w.a.x) * d.x + (py - w.a.y) * d.y, height };
  };

  const rebase = (s: NonNullable<typeof state.current>, clientX: number, clientY: number) => {
    if (s.target.kind === 'item') {
      const p = groundHit(clientX, clientY);
      if (!p) return false;
      s.base = { dx: s.target.item.x - p.x, dy: s.target.item.y - p.y, dh: 0 };
    } else {
      const h = wallHit(s.target.anchor, clientX, clientY);
      if (!h) return false;
      s.base = { dx: (s.target.anchor.offset ?? 0) - h.offset, dy: 0, dh: h.height == null ? 0 : (s.target.anchor.heightMm ?? 0) - h.height };
    }
    return true;
  };

  useEffect(() => {
    const finish = (phase: 'end' | 'cancel') => {
      const s = state.current;
      if (!s) return;
      clearTimeout(s.hold);
      state.current = null;
      if (controls) controls.enabled = true;
      if (!s.started) return;
      if (s.target.kind === 'item') onDrag?.(phase, s.target.item.id);
      else onAnchorDrag?.(phase, s.target.anchor.id);
    };
    // 捕获阶段：第二根手指落下时先取消拖动、恢复相机，让 OrbitControls 接到这根手指做双指缩放
    const down = (e: PointerEvent) => {
      pointers.current.add(e.pointerId);
      const s = state.current;
      if (s && e.pointerId !== s.pointerId) finish('cancel');
    };
    const move = (e: PointerEvent) => {
      const s = state.current;
      if (!s || e.pointerId !== s.pointerId) return;
      s.curX = e.clientX;
      s.curY = e.clientY;
      if (s.hold && !s.started) {
        // 长按还没到时间就移动了：这是在转视角，放弃拿起
        if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > 8) finish('cancel');
        return;
      }
      if (!s.started) {
        if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < 6) return;
        if (pointers.current.size > 1) return finish('cancel');
        // 触屏：以开始拖动这一刻为基准，避免相机在判定期间转动导致跳位
        if (s.touch && !rebase(s, e.clientX, e.clientY)) return;
        s.started = true;
        if (controls) controls.enabled = false;
        if (s.target.kind === 'item') onDrag?.('start', s.target.item.id);
        else onAnchorDrag?.('start', s.target.anchor.id);
        if (s.touch) return;
      }
      if (s.target.kind === 'item') {
        const item = s.target.item;
        const p = groundHit(e.clientX, e.clientY);
        if (!p) return;
        const snapped = snapPosition(planRef.current, item, p.x + s.base.dx, p.y + s.base.dy);
        // 撞到家具或墙就停在最后一个合法位置，可沿障碍滑动
        const next = resolveMove(planRef.current, item, s.last, snapped);
        if (next.x === s.last.x && next.y === s.last.y) return;
        s.last = next;
        onDrag?.('move', item.id, next);
      } else {
        const a = s.target.anchor;
        const h = wallHit(a, e.clientX, e.clientY);
        const w = planRef.current.walls.find((x) => x.id === a.wallId);
        if (!h || !w) return;
        const len = wallLength(w);
        let offset = Math.round((h.offset + s.base.dx) / 10) * 10;
        offset = Math.max(60, Math.min(len - 60, offset));
        offset = avoidDoors(planRef.current, w.id, offset);
        const patch: Partial<Anchor> = { offset };
        if (h.height != null) patch.heightMm = Math.max(100, Math.min(2400, Math.round((h.height + s.base.dh) / 10) * 10));
        onAnchorDrag?.('move', a.id, patch);
      }
    };
    const up = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      const s = state.current;
      if (!s || e.pointerId !== s.pointerId) return;
      finish('end');
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  return (target: DragTarget, e: ThreeEvent<PointerEvent>, opts?: { longPress?: boolean }) => {
    const ne = e.nativeEvent;
    // 已有其他手指在屏幕上（正在双指操作）时不开始拖动
    if (pointers.current.size > 1) return;
    const touch = ne.pointerType !== 'mouse';
    const s: NonNullable<typeof state.current> = {
      target,
      pointerId: ne.pointerId,
      touch,
      startX: ne.clientX,
      startY: ne.clientY,
      curX: ne.clientX,
      curY: ne.clientY,
      started: false,
      base: { dx: 0, dy: 0, dh: 0 },
      last: target.kind === 'item' ? { x: target.item.x, y: target.item.y } : { x: 0, y: 0 },
    };
    if (!rebase(s, ne.clientX, ne.clientY)) return;
    state.current = s;
    // 鼠标只有一个指针，直接锁定相机，避免顶视图下先平移了画面
    if (!touch && controls) controls.enabled = false;
    if (touch && opts?.longPress) {
      // 按住不动 300ms 才拿起；期间手指移动则视为转视角
      s.hold = setTimeout(() => {
        if (state.current !== s || pointers.current.size > 1) return;
        if (!rebase(s, s.curX, s.curY)) return;
        s.hold = undefined;
        s.started = true;
        if (controls) controls.enabled = false;
        try {
          navigator.vibrate?.(15);
        } catch {
          // 部分浏览器不支持震动
        }
        if (s.target.kind === 'item') onDrag?.('start', s.target.item.id);
        else onAnchorDrag?.('start', s.target.anchor.id);
      }, 300);
    }
  };
}

/** 选中家具到所在房间四面墙的实时尺寸线 */
function Measures({ plan, item }: { plan: Plan; item: FurnitureItem }) {
  const room = roomAt(plan, item);
  if (!room) return null;
  const rb = bounds(room.polygon);
  const fb = bounds(toPolygons(item).flat());
  const cx = (fb.x0 + fb.x1) / 2;
  const cy = (fb.y0 + fb.y1) / 2;
  const h = 0.02;
  const lines: { a: Point; b: Point; v: number }[] = [
    { a: { x: rb.x0, y: cy }, b: { x: fb.x0, y: cy }, v: fb.x0 - rb.x0 },
    { a: { x: fb.x1, y: cy }, b: { x: rb.x1, y: cy }, v: rb.x1 - fb.x1 },
    { a: { x: cx, y: rb.y0 }, b: { x: cx, y: fb.y0 }, v: fb.y0 - rb.y0 },
    { a: { x: cx, y: fb.y1 }, b: { x: cx, y: rb.y1 }, v: rb.y1 - fb.y1 },
  ].filter((l) => l.v > 15);
  return (
    <group>
      {lines.map((l, i) => (
        <group key={i}>
          <Line points={[[l.a.x * M, h, l.a.y * M], [l.b.x * M, h, l.b.y * M]]} color="#2f6fed" lineWidth={1.5} dashed dashSize={0.05} gapSize={0.03} />
          <Html position={[((l.a.x + l.b.x) / 2) * M, h, ((l.a.y + l.b.y) / 2) * M]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <span className={dimLabelClass()}>{Math.round(l.v / 10)} cm</span>
          </Html>
        </group>
      ))}
    </group>
  );
}

function WitnessLine({ witness, label }: { witness: [Point, Point]; label?: string }) {
  const [a, b] = witness;
  const y = 0.05;
  return (
    <group>
      <Line points={[[a.x * M, y, a.y * M], [b.x * M, y, b.y * M]]} color="#ff3b30" lineWidth={3} />
      {[a, b].map((p, i) => (
        <mesh key={i} position={[p.x * M, y, p.y * M]}>
          <sphereGeometry args={[0.03, 12, 12]} />
          <meshBasicMaterial color="#ff3b30" />
        </mesh>
      ))}
      {label && (
        <Html position={[((a.x + b.x) / 2) * M, 0.3, ((a.y + b.y) / 2) * M]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <span className={dimLabelClass(true)}>{label}</span>
        </Html>
      )}
    </group>
  );
}

function World(props: SceneProps) {
  const { plan, view, selection, highlight, ghost, readOnly, onSelect, onDrag, onAnchorDrag, showMeasures = true } = props;
  const startDrag = useDrag(plan, view, onDrag, onAnchorDrag);
  const alertIds = useMemo(() => new Set([...(highlight?.targetIds ?? [])]), [highlight]);
  const b = planBounds(plan);
  const selectedItem = selection?.kind === 'item' ? plan.furniture.find((f) => f.id === selection.id) : undefined;

  // 双击 / 双点：把旋转中心移过去
  const [focusGoal, setFocusGoal] = useState<{ p: THREE.Vector3; n: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const isDoubleTap = (e: ThreeEvent<PointerEvent>) => {
    const now = performance.now();
    const { clientX: x, clientY: y } = e.nativeEvent;
    const prev = lastTap.current;
    const hit = !!prev && now - prev.t < 320 && Math.hypot(x - prev.x, y - prev.y) < 24;
    lastTap.current = hit ? null : { t: now, x, y };
    return hit;
  };
  const focusAt = (p: THREE.Vector3) => {
    if (view === 'eye') return;
    setFocusGoal((g) => ({ p: new THREE.Vector3(p.x, 0, p.z), n: (g?.n ?? 0) + 1 }));
  };
  useEffect(() => setFocusGoal(null), [view, props.focusRoomId, props.resetKey]);

  const onItemDown = (item: FurnitureItem) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (isDoubleTap(e)) {
      focusAt(new THREE.Vector3(item.x * M, 0, item.y * M));
      return;
    }
    if (readOnly) return;
    const already = selection?.kind === 'item' && selection.id === item.id;
    onSelect?.({ kind: 'item', id: item.id });
    // 鼠标、已选中：按下即可拖；触屏未选中：长按 300ms 拿起，快速划过仍是转视角
    if (already || e.nativeEvent.pointerType === 'mouse') startDrag({ kind: 'item', item }, e);
    else startDrag({ kind: 'item', item }, e, { longPress: true });
  };

  return (
    <>
      <color attach="background" args={['#f4f1ec']} />
      <hemisphereLight args={['#fffaf2', '#b7aa98', 0.9]} />
      <directionalLight
        position={[((b.x0 + b.x1) / 2) * M - 3, 12, ((b.y0 + b.y1) / 2) * M + 4]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0004}
      />
      <ambientLight intensity={0.25} />
      <Cameras plan={plan} view={view} focusRoomId={props.focusRoomId} resetKey={props.resetKey} />
      <FocusController goal={focusGoal} />
      <TwistController view={view} />

      {/* 室外地面，点空白处取消选中 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[((b.x0 + b.x1) / 2) * M, -0.01, ((b.y0 + b.y1) / 2) * M]}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (isDoubleTap(e)) focusAt(e.point);
          else if (!readOnly) onSelect?.(null);
        }}
        receiveShadow
      >
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#e9e4dc" roughness={1} />
      </mesh>

      <RoomShell
        plan={plan}
        cutaway={view === '3d'}
        selectedAnchorId={selection?.kind === 'anchor' ? selection.id : undefined}
        alertIds={alertIds}
        onAnchorDown={
          readOnly
            ? undefined
            : (id, e) => {
                e.stopPropagation();
                const anchor = plan.anchors.find((a) => a.id === id);
                const already = selection?.kind === 'anchor' && selection.id === id;
                onSelect?.({ kind: 'anchor', id });
                if (!anchor?.wallId) return;
                if (already || e.nativeEvent.pointerType === 'mouse') startDrag({ kind: 'anchor', anchor }, e);
                else startDrag({ kind: 'anchor', anchor }, e, { longPress: true });
              }
        }
      />

      {plan.furniture.map((f) => (
        <Furniture
          key={f.id}
          item={f}
          selected={selection?.kind === 'item' && selection.id === f.id}
          lifted={!!props.dragging && selection?.kind === 'item' && selection.id === f.id}
          alert={highlight?.itemIds.has(f.id) || alertIds.has(f.id)}
          onPointerDown={onItemDown(f)}
        />
      ))}
      {ghost?.furniture.map((f) => <Furniture key={`g-${f.id}`} item={f} ghost />)}

      {selectedItem && showMeasures && !readOnly && <Measures plan={plan} item={selectedItem} />}
      {highlight?.witness && <WitnessLine witness={highlight.witness} label={highlight.label} />}

      <ContactShadows position={[((b.x0 + b.x1) / 2) * M, 0.002, ((b.y0 + b.y1) / 2) * M]} scale={14} blur={2.2} opacity={0.35} far={2.5} resolution={512} />
    </>
  );
}

export default function Scene(props: SceneProps) {
  return (
    // 屏蔽长按菜单 / 右键菜单，避免拖动时误触
    <div className="no-callout size-full" onContextMenu={(e) => e.preventDefault()}>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: false }} style={{ touchAction: 'none' }}>
        <World {...props} />
      </Canvas>
    </div>
  );
}
