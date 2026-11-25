'use client';

import {
  anchorNormal,
  doorSwing,
  leftNormal,
  resolveAnchorPoint,
  wallDir,
  wallLength,
  type Anchor,
  type Opening,
  type Plan,
  type RoomZone,
  type Wall,
} from '@fitly/layout-engine';
import { Html, Line } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { repeated, tileTexture, woodTexture } from './textures';
import { dimLabelClass } from '@/ui';

const M = 1 / 1000;
const WALL_H = 2800;

function Floor({ room }: { room: RoomZone }) {
  const { geom, tex } = useMemo(() => {
    const shape = new THREE.Shape();
    room.polygon.forEach((p, i) => (i === 0 ? shape.moveTo(p.x * M, -p.y * M) : shape.lineTo(p.x * M, -p.y * M)));
    shape.closePath();
    const geom = new THREE.ShapeGeometry(shape);
    // UV 用世界米坐标，纹理按米重复
    const pos = geom.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i);
      uv[i * 2 + 1] = pos.getY(i);
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const tex = room.floorMaterial === 'tile' ? repeated(tileTexture(), 1 / 0.6, 1 / 0.6) : repeated(woodTexture(), 1 / 1.8, 1 / 1.2);
    return { geom, tex };
  }, [room]);
  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial map={tex} roughness={room.floorMaterial === 'tile' ? 0.35 : 0.65} />
    </mesh>
  );
}

interface Segment { from: number; to: number; z0: number; z1: number; glass?: boolean }

/** 把墙按洞口切成若干实体段：门洞上方留过梁，窗洞上下留墙 */
function wallSegments(w: Wall, openings: Opening[]): Segment[] {
  const len = wallLength(w);
  const ops = openings.filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset);
  const segs: Segment[] = [];
  let cur = 0;
  for (const o of ops) {
    if (o.offset > cur) segs.push({ from: cur, to: o.offset, z0: 0, z1: WALL_H });
    const top = (o.sillHeightMm ?? 0) + (o.height ?? 2100);
    if (top < WALL_H) segs.push({ from: o.offset, to: o.offset + o.width, z0: top, z1: WALL_H });
    if (o.kind === 'window' && (o.sillHeightMm ?? 0) > 0) {
      segs.push({ from: o.offset, to: o.offset + o.width, z0: 0, z1: o.sillHeightMm! });
      segs.push({ from: o.offset, to: o.offset + o.width, z0: o.sillHeightMm!, z1: top, glass: true });
    }
    cur = o.offset + o.width;
  }
  if (cur < len) segs.push({ from: cur, to: len, z0: 0, z1: WALL_H });
  return segs;
}

function WallMesh({ wall, openings, center, cutaway }: { wall: Wall; openings: Opening[]; center: THREE.Vector3; cutaway: boolean }) {
  const d = wallDir(wall);
  const angle = -Math.atan2(d.y, d.x);
  const segs = useMemo(() => wallSegments(wall, openings), [wall, openings]);
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  const mid = new THREE.Vector3(((wall.a.x + wall.b.x) / 2) * M, 0, ((wall.a.y + wall.b.y) / 2) * M);
  // 外墙的朝外法线
  const n = leftNormal(wall);
  const outward = new THREE.Vector3(n.x, 0, n.y);
  if (outward.dot(center.clone().sub(mid)) > 0) outward.negate();

  useFrame(({ camera }) => {
    let o = 1;
    if (cutaway) {
      const toCam = camera.position.clone().sub(mid).setY(0);
      if (wall.exterior) {
        if (toCam.dot(outward) > 0) o = 0.12;
      }
    }
    mats.current.forEach((m) => {
      if (!m) return;
      m.opacity = m.userData.glass ? Math.min(o, 0.25) : o;
      m.transparent = m.userData.glass || o < 1;
      m.depthWrite = o >= 1 && !m.userData.glass;
    });
  });

  return (
    <group>
      {segs.map((s, i) => {
        const cx = wall.a.x + d.x * ((s.from + s.to) / 2);
        const cy = wall.a.y + d.y * ((s.from + s.to) / 2);
        return (
          <mesh
            key={i}
            position={[cx * M, ((s.z0 + s.z1) / 2) * M, cy * M]}
            rotation={[0, angle, 0]}
            castShadow={!s.glass}
            receiveShadow
          >
            <boxGeometry args={[(s.to - s.from) * M, (s.z1 - s.z0) * M, (s.glass ? 30 : wall.thickness) * M]} />
            <meshStandardMaterial
              ref={(m) => {
                if (m) {
                  m.userData.glass = !!s.glass;
                  mats.current[i] = m;
                }
              }}
              color={s.glass ? '#bcd7e6' : '#f3efe8'}
              roughness={s.glass ? 0.05 : 0.92}
              metalness={s.glass ? 0.1 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function DoorMesh({ opening, walls, alert }: { opening: Opening; walls: Wall[]; alert?: boolean }) {
  const sw = useMemo(() => doorSwing(opening, walls, 24), [opening, walls]);
  const fill = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (fill.current) fill.current.opacity = alert ? 0.25 + 0.2 * Math.sin(clock.elapsedTime * 5) : 0.08;
  });
  const geom = useMemo(() => {
    if (!sw) return null;
    const shape = new THREE.Shape();
    sw.sector.forEach((p, i) => (i === 0 ? shape.moveTo(p.x * M, -p.y * M) : shape.lineTo(p.x * M, -p.y * M)));
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [sw]);
  if (!sw || !geom) return null;
  // 门扇开到约 80° 展示
  const a = (80 * Math.PI) / 180;
  const dir = {
    x: sw.closedDir.x * Math.cos(a) + sw.openDir.x * Math.sin(a),
    y: sw.closedDir.y * Math.cos(a) + sw.openDir.y * Math.sin(a),
  };
  const leafCenter = { x: sw.hinge.x + (dir.x * sw.radius) / 2, y: sw.hinge.y + (dir.y * sw.radius) / 2 };
  const arc = sw.sector.slice(1).map((p) => [p.x * M, 0.004, p.y * M] as [number, number, number]);
  return (
    <group>
      <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <meshBasicMaterial ref={fill} color={alert ? '#ff3b30' : '#2f6fed'} transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <Line points={arc} color={alert ? '#ff3b30' : '#7d8aa3'} lineWidth={1.2} dashed dashSize={0.06} gapSize={0.04} />
      <mesh position={[leafCenter.x * M, 1.02, leafCenter.y * M]} rotation={[0, -Math.atan2(dir.y, dir.x), 0]} castShadow>
        <boxGeometry args={[sw.radius * M - 0.02, 2.04, 0.04]} />
        <meshStandardMaterial color="#d8c7ad" roughness={0.6} />
      </mesh>
    </group>
  );
}

const ANCHOR_COLOR: Record<string, string> = {
  socket: '#ffffff',
  switch: '#ffffff',
  gas: '#f5c542',
  water: '#4aa3df',
  drain: '#7b8794',
  flue: '#7b8794',
};

function AnchorMesh({
  anchor,
  walls,
  selected,
  alert,
  onSelect,
}: {
  anchor: Anchor;
  walls: Wall[];
  selected?: boolean;
  alert?: boolean;
  onSelect?: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const p = resolveAnchorPoint(anchor, walls);
  const n = anchorNormal(anchor, walls);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (ring.current) ring.current.opacity = alert ? 0.4 + 0.4 * Math.sin(clock.elapsedTime * 6) : selected ? 0.8 : 0;
  });
  if (!p || anchor.heightMm == null) return null;
  const angle = n ? -Math.atan2(n.y, n.x) + Math.PI / 2 : 0;
  const pos: [number, number, number] = [(p.x + (n?.x ?? 0) * 6) * M, anchor.heightMm * M, (p.y + (n?.y ?? 0) * 6) * M];
  return (
    <group position={pos} rotation={[0, angle, 0]} onPointerDown={onSelect}>
      <mesh castShadow>
        <boxGeometry args={[0.086, 0.086, 0.012]} />
        <meshStandardMaterial color={ANCHOR_COLOR[anchor.kind] ?? '#ffffff'} roughness={0.4} emissive={anchor.confirmed ? '#000000' : '#555555'} emissiveIntensity={0.15} />
      </mesh>
      {anchor.kind === 'socket' && (
        <mesh position={[0, 0, 0.007]}>
          <boxGeometry args={[0.05, 0.012, 0.002]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      )}
      {/* 点击热区更大，手机上更好点 */}
      <mesh>
        <boxGeometry args={[0.2, 0.2, 0.05]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {selected && (
        <Html position={[0, 0.13, 0.02]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <span className={dimLabelClass()}>离地 {Math.round(anchor.heightMm / 10)} cm</span>
        </Html>
      )}
      <mesh position={[0, 0, 0.01]}>
        <ringGeometry args={[0.07, 0.1, 32]} />
        <meshBasicMaterial ref={ring} color={alert ? '#ff3b30' : '#2f6fed'} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export interface RoomShellProps {
  plan: Plan;
  cutaway: boolean;
  selectedAnchorId?: string;
  alertIds?: Set<string>;
  onAnchorDown?: (id: string, e: ThreeEvent<PointerEvent>) => void;
}

export function RoomShell({ plan, cutaway, selectedAnchorId, alertIds, onAnchorDown }: RoomShellProps) {
  const center = useMemo(() => {
    const xs = plan.walls.flatMap((w) => [w.a.x, w.b.x]);
    const ys = plan.walls.flatMap((w) => [w.a.y, w.b.y]);
    return new THREE.Vector3(((Math.min(...xs) + Math.max(...xs)) / 2) * M, 0, ((Math.min(...ys) + Math.max(...ys)) / 2) * M);
  }, [plan.walls]);
  return (
    <group>
      {plan.rooms.map((r) => (
        <Floor key={r.id} room={r} />
      ))}
      {plan.walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={plan.openings} center={center} cutaway={cutaway} />
      ))}
      {plan.openings
        .filter((o) => o.kind === 'door')
        .map((o) => (
          <DoorMesh key={o.id} opening={o} walls={plan.walls} alert={alertIds?.has(o.id)} />
        ))}
      {plan.anchors.map((a) => (
        <AnchorMesh
          key={a.id}
          anchor={a}
          walls={plan.walls}
          selected={a.id === selectedAnchorId}
          alert={alertIds?.has(a.id)}
          onSelect={onAnchorDown ? (e) => onAnchorDown(a.id, e) : undefined}
        />
      ))}
    </group>
  );
}
