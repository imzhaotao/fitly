import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 程序化木地板：随机色差的长条板 */
export function woodTexture(): THREE.Texture {
  const key = 'wood';
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(512, 512);
  const g = c.getContext('2d')!;
  const plankH = 64;
  for (let row = 0; row < 512 / plankH; row++) {
    let x = row % 2 === 0 ? 0 : -180;
    while (x < 512) {
      const len = 260 + Math.random() * 200;
      const l = 62 + Math.random() * 8;
      g.fillStyle = `hsl(30, 32%, ${l}%)`;
      g.fillRect(x, row * plankH, len, plankH);
      // 木纹
      for (let i = 0; i < 6; i++) {
        g.strokeStyle = `hsla(28, 30%, ${l - 10}%, 0.25)`;
        g.lineWidth = 1;
        g.beginPath();
        const y = row * plankH + Math.random() * plankH;
        g.moveTo(x, y);
        g.bezierCurveTo(x + len / 3, y + 4, x + (2 * len) / 3, y - 4, x + len, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(60,40,20,0.35)';
      g.fillRect(x + len - 1, row * plankH, 2, plankH);
      x += len;
    }
    g.fillStyle = 'rgba(60,40,20,0.3)';
    g.fillRect(0, row * plankH, 512, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** 程序化瓷砖：浅色砖 + 勾缝 */
export function tileTexture(): THREE.Texture {
  const key = 'tile';
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#b9b5ae';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const l = 88 + Math.random() * 4;
      g.fillStyle = `hsl(40, 8%, ${l}%)`;
      g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** 带指定重复次数的纹理副本 */
export function repeated(base: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const t = base.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return t;
}
