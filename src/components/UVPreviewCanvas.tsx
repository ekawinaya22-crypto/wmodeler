import React, { useEffect, useRef } from 'react';
import { buildObjectGeometry } from '../engine/geometryBuilder';
import { SceneObjectData, TextureAsset } from '../types/modeler';

interface UVPreviewCanvasProps {
  object: SceneObjectData;
  texture: TextureAsset | null;
}

export const UVPreviewCanvas: React.FC<UVPreviewCanvasProps> = ({ object, texture }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 220;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const drawOverlay = () => {
      // Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const p = (size / 4) * i;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
        ctx.stroke();
      }

      // Draw actual mesh UV triangles
      const geo = buildObjectGeometry(object);
      const uvAttr = geo.attributes.uv;
      const idxAttr = geo.index;

      if (uvAttr) {
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.85)';
        ctx.lineWidth = 0.85;
        const triCount = idxAttr
          ? Math.floor(idxAttr.count / 3)
          : Math.floor(uvAttr.count / 3);
        const step = triCount > 1600 ? Math.ceil(triCount / 1600) : 1;

        ctx.beginPath();
        for (let t = 0; t < triCount; t += step) {
          const i0 = idxAttr ? idxAttr.getX(t * 3) : t * 3;
          const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;

          const u0 = uvAttr.getX(i0) * size;
          const v0 = (1 - uvAttr.getY(i0)) * size;
          const u1 = uvAttr.getX(i1) * size;
          const v1 = (1 - uvAttr.getY(i1)) * size;
          const u2 = uvAttr.getX(i2) * size;
          const v2 = (1 - uvAttr.getY(i2)) * size;

          ctx.moveTo(u0, v0);
          ctx.lineTo(u1, v1);
          ctx.lineTo(u2, v2);
          ctx.lineTo(u0, v0);
        }
        ctx.stroke();
      }
      geo.dispose();
    };

    ctx.fillStyle = '#121418';
    ctx.fillRect(0, 0, size, size);

    if (texture) {
      const img = new Image();
      img.onload = () => {
        ctx.globalAlpha = 0.82;
        ctx.drawImage(img, 0, 0, size, size);
        ctx.globalAlpha = 1;
        drawOverlay();
      };
      img.src = texture.dataUrl;
    } else {
      drawOverlay();
    }
  }, [object, texture]);

  const modeLabel =
    object.uvMapping?.projection === 'from-view'
      ? 'From View'
      : object.uvMapping?.projection || 'default';

  return (
    <div className="rounded-xl border border-white/12 bg-[#121418] p-2 flex flex-col items-center gap-1.5">
      <canvas
        ref={canvasRef}
        className="w-[200px] h-[200px] rounded-lg border border-white/15"
      />
      <span className="text-[10px] font-mono text-slate-400 text-center">
        UV ({modeLabel}) · {texture ? texture.name : 'No Texture'}
      </span>
    </div>
  );
};
