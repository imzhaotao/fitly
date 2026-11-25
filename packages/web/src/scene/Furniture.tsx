'use client';

import { localRects, type FurnitureItem } from '@fitly/layout-engine';
import { Edges } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, type ReactNode } from 'react';
import type * as THREE from 'three';
import { CATALOG_BY_TYPE } from '@/plan/catalog';

const M = 1 / 1000;

interface PartProps {
  x?: number;
  y?: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  color: string;
  rough?: number;
  metal?: number;
  ghost?: boolean;
  opacity?: number;
  emissive?: string;
}

/** 本地坐标（mm，x 右、y 朝前、z 向上，z 为底面高度）下的盒子部件 */
function Part({ x = 0, y = 0, z = 0, w, d, h, color, rough = 0.75, metal = 0, ghost, opacity, emissive }: PartProps) {
  const transparent = ghost || opacity != null;
  return (
    <mesh position={[x * M, (z + h / 2) * M, y * M]} castShadow={!ghost} receiveShadow={!ghost}>
      <boxGeometry args={[Math.max(w, 1) * M, Math.max(h, 1) * M, Math.max(d, 1) * M]} />
      <meshStandardMaterial
        color={color}
        roughness={rough}
        metalness={metal}
        transparent={transparent}
        opacity={ghost ? 0.28 : (opacity ?? 1)}
        depthWrite={!ghost}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissive ? 0.6 : 0}
      />
    </mesh>
  );
}

function Cyl({ x = 0, y = 0, z = 0, r, r2, h, color, ghost, rough = 0.6 }: { x?: number; y?: number; z?: number; r: number; r2?: number; h: number; color: string; ghost?: boolean; rough?: number }) {
  return (
    <mesh position={[x * M, (z + h / 2) * M, y * M]} castShadow={!ghost}>
      <cylinderGeometry args={[(r2 ?? r) * M, r * M, h * M, 24]} />
      <meshStandardMaterial color={color} roughness={rough} transparent={ghost} opacity={ghost ? 0.28 : 1} depthWrite={!ghost} />
    </mesh>
  );
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const STONE = '#f1eee8';

function Legs({ w, d, h, color, inset = 60, size = 40, ghost }: { w: number; d: number; h: number; color: string; inset?: number; size?: number; ghost?: boolean }) {
  const xs = [-w / 2 + inset, w / 2 - inset];
  const ys = [-d / 2 + inset, d / 2 - inset];
  return (
    <>
      {xs.flatMap((x) => ys.map((y) => <Part key={`${x}-${y}`} x={x} y={y} w={size} d={size} h={h} color={color} ghost={ghost} />))}
    </>
  );
}

function Cabinet({ item, color, ghost, top }: { item: FurnitureItem; color: string; ghost?: boolean; top?: ReactNode }) {
  const { w, d, h } = item;
  return (
    <>
      <Part y={10} w={w - 4} d={d - 20} h={80} z={0} color="#3a3a3a" ghost={ghost} />
      <Part w={w} d={d - 20} y={-10} z={80} h={h - 130} color={color} ghost={ghost} />
      <Part w={w} d={d} z={h - 50} h={50} color={STONE} rough={0.35} ghost={ghost} />
      {/* 门缝 */}
      {w > 500 && <Part y={d / 2 - 19} x={0} z={90} w={6} d={2} h={h - 160} color={shade(color, -40)} ghost={ghost} />}
      {top}
    </>
  );
}

function Model({ item, ghost }: { item: FurnitureItem; ghost?: boolean }) {
  const cat = CATALOG_BY_TYPE[item.type];
  const color = item.materialPreset ?? cat?.colors[0] ?? '#cccccc';
  const { w, d, h } = item;
  const g = ghost;
  switch (item.type) {
    case 'sofa': {
      const arm = 150;
      const back = 200;
      const seatH = 430;
      const chaise = localRects(item)[1];
      return (
        <>
          <Part w={w} d={d} h={seatH - 120} z={100} color={color} ghost={g} />
          <Legs w={w} d={d} h={100} color="#3a2f28" size={35} ghost={g} />
          <Part y={-d / 2 + back / 2} w={w} d={back} h={h - 100} z={100} color={shade(color, -12)} ghost={g} />
          <Part x={-w / 2 + arm / 2} w={arm} d={d} h={620 - 100} z={100} color={shade(color, -8)} ghost={g} />
          <Part x={w / 2 - arm / 2} w={arm} d={d} h={620 - 100} z={100} color={shade(color, -8)} ghost={g} />
          {[0, 1, 2].map((i) => {
            const inner = w - arm * 2;
            const cw = inner / 3 - 10;
            return (
              <Part key={i} x={-inner / 2 + inner / 6 + (i * inner) / 3} y={back / 2} w={cw} d={d - back - 20} z={seatH - 120 + 100} h={120} color={shade(color, 10)} rough={0.95} ghost={g} />
            );
          })}
          {chaise && (
            <>
              <Part
                x={(chaise.x0 + chaise.x1) / 2}
                y={(chaise.y0 + chaise.y1) / 2}
                w={chaise.x1 - chaise.x0}
                d={chaise.y1 - chaise.y0}
                z={100}
                h={seatH - 100}
                color={shade(color, 6)}
                rough={0.95}
                ghost={g}
              />
            </>
          )}
        </>
      );
    }
    case 'teaTable':
    case 'diningTable':
      return (
        <>
          <Part w={w} d={d} h={36} z={h - 36} color={color} rough={0.45} ghost={g} />
          <Legs w={w} d={d} h={h - 36} color={shade(color, -50)} inset={item.type === 'teaTable' ? 50 : 70} ghost={g} />
        </>
      );
    case 'diningChair':
      return (
        <>
          <Part w={w} d={d} h={40} z={440} color={color} ghost={g} />
          <Part y={-d / 2 + 20} w={w} d={30} h={h - 480} z={480} color={color} ghost={g} />
          <Legs w={w} d={d} h={440} color={shade(color, -30)} inset={30} size={30} ghost={g} />
        </>
      );
    case 'tvCabinet':
      return (
        <>
          <Part w={w} d={d} h={h - 80} z={80} color={color} rough={0.55} ghost={g} />
          <Part w={w - 60} d={d - 60} h={80} color="#2b2b2b" ghost={g} />
          {[-1, 0, 1].map((i) => (
            <Part key={i} x={(i * w) / 3} y={d / 2} w={4} d={2} h={h - 120} z={100} color={shade(color, -40)} ghost={g} />
          ))}
        </>
      );
    case 'tv':
      return (
        <>
          <Part w={w} d={d} h={h} z={item.z ?? 0} color="#111214" rough={0.3} ghost={g} />
          <Part y={d / 2} w={w - 20} d={2} h={h - 20} z={(item.z ?? 0) + 10} color="#1b2533" rough={0.15} metal={0.2} ghost={g} emissive={g ? undefined : '#0d1a2b'} />
        </>
      );
    case 'rug':
      return <Part w={w} d={d} h={Math.max(h, 8)} color={color} rough={1} ghost={g} />;
    case 'lamp':
      return (
        <>
          <Cyl r={160} h={30} color="#3b3b3b" ghost={g} />
          <Cyl r={12} h={h - 330} z={30} color="#3b3b3b" ghost={g} />
          <Cyl r={200} r2={130} h={300} z={h - 300} color={color} ghost={g} rough={0.9} />
        </>
      );
    case 'curtain':
      return (
        <>
          {Array.from({ length: Math.max(3, Math.round(w / 150)) }, (_, i) => {
            const n = Math.max(3, Math.round(w / 150));
            return <Part key={i} x={-w / 2 + (w / n) * (i + 0.5)} y={i % 2 === 0 ? 20 : -20} w={w / n + 10} d={d - 60} h={h} color={shade(color, i % 2 === 0 ? 0 : -10)} rough={1} ghost={g} />;
          })}
        </>
      );
    case 'robot':
      return (
        <>
          <Part y={-d / 2 + 80} w={w} d={160} h={h} color={color} rough={0.4} ghost={g} />
          <Cyl y={60} r={170} h={90} color="#e9e9e9" ghost={g} rough={0.4} />
        </>
      );
    case 'bed': {
      const head = 90;
      return (
        <>
          <Part w={w} d={d} h={300} z={0} color={shade(color, -25)} ghost={g} />
          <Part y={head / 2} w={w - 40} d={d - head - 40} h={240} z={300} color="#f7f5f1" rough={0.95} ghost={g} />
          <Part y={-d / 2 + head / 2} w={w} d={head} h={h} color={color} rough={0.9} ghost={g} />
          {[-1, 1].map((s) => (
            <Part key={s} x={(s * w) / 4} y={-d / 2 + head + 180} w={w / 2 - 120} d={300} h={120} z={540} color="#ffffff" rough={1} ghost={g} />
          ))}
          <Part y={d / 2 - (d * 0.62) / 2 - 20} w={w - 20} d={d * 0.62} h={50} z={540} color={shade(color, 15)} rough={1} ghost={g} />
        </>
      );
    }
    case 'nightstand':
      return (
        <>
          <Part w={w} d={d} h={h - 80} z={80} color={color} rough={0.55} ghost={g} />
          <Legs w={w} d={d} h={80} color="#3a2f28" inset={30} size={25} ghost={g} />
          <Part y={d / 2} w={w - 40} d={2} h={4} z={h - 160} color={shade(color, -50)} ghost={g} />
        </>
      );
    case 'wardrobe': {
      const v = item.variant ?? 'unknown';
      const doors = Math.max(2, Math.round(w / 500));
      return (
        <>
          <Part w={w} d={d - 30} y={-15} h={h} color={color} rough={0.6} ghost={g} />
          {v === 'sliding-door' ? (
            <>
              <Part x={-w / 4} y={d / 2 - 25} w={w / 2 + 40} d={20} h={h - 40} z={20} color={shade(color, 6)} rough={0.5} ghost={g} />
              <Part x={w / 4} y={d / 2 - 5} w={w / 2 + 40} d={20} h={h - 40} z={20} color={shade(color, -4)} rough={0.5} ghost={g} />
            </>
          ) : (
            Array.from({ length: doors }, (_, i) => (
              <group key={i}>
                <Part x={-w / 2 + (w / doors) * (i + 0.5)} y={d / 2 - 15} w={w / doors - 6} d={18} h={h - 20} z={10} color={v === 'unknown' ? shade(color, 4) : color} rough={0.55} ghost={g} />
                {v === 'hinged-door' && (
                  <Part x={-w / 2 + (w / doors) * (i + (i % 2 === 0 ? 0.88 : 0.12))} y={d / 2 + 5} w={14} d={20} h={300} z={h / 2 - 150} color="#8c8c8c" metal={0.6} rough={0.3} ghost={g} />
                )}
              </group>
            ))
          )}
        </>
      );
    }
    case 'fridge':
      return (
        <>
          <Part w={w} d={d} h={h} color={color} rough={0.3} metal={0.35} ghost={g} />
          <Part y={d / 2} w={w - 10} d={4} h={6} z={h * 0.62} color={shade(color, -60)} ghost={g} />
          <Part x={w / 2 - 70} y={d / 2 + 15} w={20} d={30} h={400} z={h * 0.62 - 450} color="#9a9a9a" metal={0.7} ghost={g} />
          <Part x={w / 2 - 70} y={d / 2 + 15} w={20} d={30} h={300} z={h * 0.62 + 60} color="#9a9a9a" metal={0.7} ghost={g} />
        </>
      );
    case 'sink':
      return (
        <Cabinet
          item={item}
          color={color}
          ghost={g}
          top={
            <>
              <Part y={20} w={Math.min(w - 160, 680)} d={d - 200} h={4} z={h} color="#8d9399" metal={0.8} rough={0.25} ghost={g} />
              <Cyl y={-d / 2 + 70} r={18} h={300} z={h} color="#b8bcc0" ghost={g} rough={0.2} />
            </>
          }
        />
      );
    case 'stove':
      return (
        <Cabinet
          item={item}
          color={color}
          ghost={g}
          top={
            <>
              <Part w={Math.min(w - 80, 740)} d={d - 120} h={8} z={h} color="#1a1a1a" rough={0.15} ghost={g} />
              {[-1, 1].map((s) => (
                <Cyl key={s} x={(s * Math.min(w - 80, 740)) / 4} r={110} h={14} z={h + 8} color="#3a3a3a" ghost={g} />
              ))}
            </>
          }
        />
      );
    case 'dishwasher':
      return (
        <>
          <Part w={w} d={d - 20} y={-10} h={h - 50} color={color} metal={0.6} rough={0.3} ghost={g} />
          <Part w={w} d={d} z={h - 50} h={50} color={STONE} rough={0.35} ghost={g} />
        </>
      );
    case 'baseCabinet':
    case 'counter':
      return <Cabinet item={item} color={color} ghost={g} />;
    default:
      return <Part w={w} d={d} h={h} z={item.z ?? 0} color={color} ghost={g} />;
  }
}

/** 选中框：沿家具足迹画出包围线 */
function SelectionBox({ item, color = '#2f6fed' }: { item: FurnitureItem; color?: string }) {
  const top = (item.z ?? 0) + item.h;
  return (
    <>
      {localRects(item).map((r, i) => (
        <mesh key={i} position={[((r.x0 + r.x1) / 2) * M, ((item.z ?? 0) + top) / 2 * M, ((r.y0 + r.y1) / 2) * M]}>
          <boxGeometry args={[(r.x1 - r.x0 + 30) * M, (top - (item.z ?? 0) + 30) * M, (r.y1 - r.y0 + 30) * M]} />
          <meshBasicMaterial transparent opacity={0.06} color={color} depthWrite={false} />
          <Edges color={color} lineWidth={2} />
        </mesh>
      ))}
    </>
  );
}

/** 避坑高亮：红色脉冲包围盒 */
export function AlertGlow({ item }: { item: FurnitureItem }) {
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame(({ clock }) => {
    const o = 0.12 + 0.12 * (Math.sin(clock.elapsedTime * 5) + 1) / 2;
    mats.current.forEach((m) => m && (m.opacity = o));
  });
  const top = (item.z ?? 0) + item.h;
  return (
    <>
      {localRects(item).map((r, i) => (
        <mesh key={i} position={[((r.x0 + r.x1) / 2) * M, ((item.z ?? 0) + top) / 2 * M, ((r.y0 + r.y1) / 2) * M]}>
          <boxGeometry args={[(r.x1 - r.x0 + 40) * M, (top - (item.z ?? 0) + 40) * M, (r.y1 - r.y0 + 40) * M]} />
          <meshBasicMaterial ref={(m) => { if (m) mats.current[i] = m; }} transparent color="#ff3b30" depthWrite={false} />
          <Edges color="#ff3b30" />
        </mesh>
      ))}
    </>
  );
}

export interface FurnitureProps {
  item: FurnitureItem;
  selected?: boolean;
  alert?: boolean;
  ghost?: boolean;
  /** 拖动中：浮起 4cm，表示“拿起来了” */
  lifted?: boolean;
  onPointerDown?: (e: import('@react-three/fiber').ThreeEvent<PointerEvent>) => void;
}

export function Furniture({ item, selected, alert, ghost, lifted, onPointerDown }: FurnitureProps) {
  return (
    <group
      position={[item.x * M, lifted && item.h > 30 ? 0.04 : 0, item.y * M]}
      rotation={[0, (-item.rotation * Math.PI) / 180, 0]}
      onPointerDown={onPointerDown}
    >
      <Model item={item} ghost={ghost} />
      {selected && <SelectionBox item={item} />}
      {alert && <AlertGlow item={item} />}
    </group>
  );
}
