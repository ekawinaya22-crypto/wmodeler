import * as THREE from 'three';
import { TextureAsset } from '../types/modeler';

function createCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function drawBrushedAluminum(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#c4ccd4';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    const tone = 175 + Math.floor(Math.sin(y * 0.7) * 18 + (Math.random() - 0.5) * 24);
    ctx.fillStyle = `rgb(${tone}, ${tone + 4}, ${tone + 10})`;
    ctx.fillRect(0, y, size, 1);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 140; i++) {
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
}

function drawCarbonWeave(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#181b20';
  ctx.fillRect(0, 0, size, size);
  const cell = size / 16;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const even = (x + y) % 2 === 0;
      const grad = ctx.createLinearGradient(
        x * cell,
        y * cell,
        (x + 1) * cell,
        (y + 1) * cell,
      );
      if (even) {
        grad.addColorStop(0, '#2c313a');
        grad.addColorStop(0.5, '#1b1f26');
        grad.addColorStop(1, '#101216');
      } else {
        grad.addColorStop(0, '#12151a');
        grad.addColorStop(0.5, '#252a33');
        grad.addColorStop(1, '#181c22');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

function drawConcrete(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#8e9399';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.6 + Math.random() * 2.2;
    const v = 115 + Math.floor(Math.random() * 55);
    ctx.fillStyle = `rgba(${v},${v + 1},${v + 3},0.35)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(40,44,50,0.16)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, size - 2, size - 2);
}

function drawTravertine(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#d6cfc2';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 2) {
    const wave = Math.sin(y * 0.08) * 10;
    const v = 196 + Math.floor(wave + (Math.random() - 0.5) * 14);
    ctx.fillStyle = `rgb(${v + 12}, ${v + 5}, ${v - 8})`;
    ctx.fillRect(0, y, size, 2);
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = 'rgba(130, 118, 98, 0.22)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 6 + Math.random() * 26, 1.5);
  }
}

function drawWalnutWood(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#5a3a26';
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x++) {
    const grain = Math.sin(x * 0.14 + Math.sin(x * 0.03) * 2.5);
    const r = 78 + Math.floor(grain * 18 + (Math.random() - 0.5) * 8);
    const g = 48 + Math.floor(grain * 11 + (Math.random() - 0.5) * 6);
    const b = 30 + Math.floor(grain * 7 + (Math.random() - 0.5) * 4);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, 0, 1, size);
  }
}

function drawUvChecker(ctx: CanvasRenderingContext2D, size: number) {
  const squares = 8;
  const step = size / squares;
  for (let y = 0; y < squares; y++) {
    for (let x = 0; x < squares; x++) {
      const dark = (x + y) % 2 === 0;
      ctx.fillStyle = dark ? '#1e2430' : '#d8dee9';
      ctx.fillRect(x * step, y * step, step, step);
      if (x === 0 || y === 0) {
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(x * step + 2, y * step + 2, 6, 6);
      }
    }
  }
}

function drawHexTech(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#252a34';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#4c566a';
  ctx.lineWidth = 2;
  const r = size / 8;
  const dx = r * 1.5;
  const dy = r * Math.sqrt(3);
  for (let row = -1; row < 10; row++) {
    for (let col = -1; col < 10; col++) {
      const cx = col * dx;
      const cy = row * dy + (col % 2 === 0 ? 0 : dy / 2);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = cx + (r - 2) * Math.cos(a);
        const py = cy + (r - 2) * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#2e3440';
      ctx.fill();
      ctx.stroke();
    }
  }
}

const BUILTIN_SPECS: Array<{
  id: string;
  name: string;
  category: TextureAsset['category'];
  roughnessHint: number;
  metalnessHint: number;
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}> = [
  {
    id: 'tex-brushed-aluminum',
    name: 'Brushed Aluminum',
    category: 'Metal',
    roughnessHint: 0.28,
    metalnessHint: 0.92,
    draw: drawBrushedAluminum,
  },
  {
    id: 'tex-carbon-weave',
    name: 'Carbon Twill Weave',
    category: 'Composite',
    roughnessHint: 0.34,
    metalnessHint: 0.18,
    draw: drawCarbonWeave,
  },
  {
    id: 'tex-concrete',
    name: 'Architectural Concrete',
    category: 'Stone',
    roughnessHint: 0.85,
    metalnessHint: 0.02,
    draw: drawConcrete,
  },
  {
    id: 'tex-travertine',
    name: 'Honed Travertine',
    category: 'Stone',
    roughnessHint: 0.65,
    metalnessHint: 0.0,
    draw: drawTravertine,
  },
  {
    id: 'tex-walnut',
    name: 'Quarter Walnut',
    category: 'Wood',
    roughnessHint: 0.56,
    metalnessHint: 0.0,
    draw: drawWalnutWood,
  },
  {
    id: 'tex-hex-tech',
    name: 'Machined Hex Knurl',
    category: 'Metal',
    roughnessHint: 0.36,
    metalnessHint: 0.85,
    draw: drawHexTech,
  },
  {
    id: 'tex-uv-checker',
    name: 'UV Calibration Grid',
    category: 'Utility',
    roughnessHint: 0.5,
    metalnessHint: 0.05,
    draw: drawUvChecker,
  },
];

let cachedBuiltIns: TextureAsset[] | null = null;

export function getBuiltInTextures(): TextureAsset[] {
  if (cachedBuiltIns) return cachedBuiltIns;
  cachedBuiltIns = BUILTIN_SPECS.map((spec) => {
    const [canvas, ctx] = createCanvas(256);
    spec.draw(ctx, 256);
    return {
      id: spec.id,
      name: spec.name,
      category: spec.category,
      isBuiltIn: true,
      resolution: '256×256',
      dataUrl: canvas.toDataURL('image/png'),
      roughnessHint: spec.roughnessHint,
      metalnessHint: spec.metalnessHint,
      createdAt: 1700000000000,
    };
  });
  return cachedBuiltIns;
}

const textureCache = new Map<string, THREE.Texture>();

export function resolveThreeTexture(
  textureId: string | null,
  allTextures: TextureAsset[],
  maxAnisotropy: number,
  onLoaded?: () => void,
): THREE.Texture | null {
  if (!textureId) return null;
  const asset = allTextures.find((t) => t.id === textureId);
  if (!asset) return null;

  const cacheKey = `${asset.id}:${asset.dataUrl.slice(0, 48)}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const img = new Image();
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.max(1, maxAnisotropy);
  img.onload = () => {
    tex.needsUpdate = true;
    onLoaded?.();
  };
  img.src = asset.dataUrl;
  textureCache.set(cacheKey, tex);
  return tex;
}

export function disposeCachedTextures(): void {
  textureCache.forEach((tex) => tex.dispose());
  textureCache.clear();
}
