import * as THREE from 'three';
import { buildObjectGeometry } from './geometryBuilder';
import { createDefaultMaterial, DEFAULT_MODIFIERS, nextId } from './sceneTemplates';
import { SceneObjectData, TextureAsset } from '../types/modeler';

// RenderWare Chunk IDs
const RW_STRUCT = 0x0001;
const RW_STRING = 0x0002;
const RW_EXTENSION = 0x0003;
const RW_TEXTURE = 0x0006;
const RW_MATERIAL = 0x0007;
const RW_MATERIAL_LIST = 0x0008;
const RW_FRAME_LIST = 0x000e;
const RW_GEOMETRY = 0x000f;
const RW_CLUMP = 0x0010;
const RW_ATOMIC = 0x0014;
const RW_TEXTURE_NATIVE = 0x0015;
const RW_TEXDICTIONARY = 0x0016;
const RW_GEOMETRY_LIST = 0x001a;
const RW_FRAME_NAME = 0x0253f2fe;

// RW 3.6.0.3 (GTA San Andreas standard, widely compatible with PC & Android tools)
const RW_VERSION_36 = 0x1803ffff;

// Geometry flags
const rpGEOMETRYTRISTRIP = 0x00000001;
const rpGEOMETRYPOSITIONS = 0x00000002;
const rpGEOMETRYTEXTURED = 0x00000004;
const rpGEOMETRYPRELIT = 0x00000008;
const rpGEOMETRYNORMALS = 0x00000010;
const rpGEOMETRYLIGHT = 0x00000020;
const rpGEOMETRYMODULATEMATERIALCOLOR = 0x00000040;
const rpGEOMETRYTEXTURED2 = 0x00000080;

// Raster format flags
const RASTER_FORMAT_MASK = 0x0f00;
const RASTER_1555 = 0x0100;
const RASTER_565 = 0x0200;
const RASTER_4444 = 0x0300;
const RASTER_8888 = 0x0500;
const RASTER_888 = 0x0600;
const RASTER_PAL8 = 0x2000;
const RASTER_PAL4 = 0x4000;

interface RwChunkHeader {
  type: number;
  size: number;
  version: number;
  dataStart: number;
  dataEnd: number;
}

class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private totalLength = 0;

  writeUint8(val: number) {
    const b = new Uint8Array(1);
    b[0] = val & 0xff;
    this.push(b);
  }

  writeUint16(val: number) {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setUint16(0, val, true);
    this.push(new Uint8Array(buf));
  }

  writeInt32(val: number) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, val, true);
    this.push(new Uint8Array(buf));
  }

  writeUint32(val: number) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, val >>> 0, true);
    this.push(new Uint8Array(buf));
  }

  writeFloat32(val: number) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, val, true);
    this.push(new Uint8Array(buf));
  }

  writeFixedString(str: string, length: number) {
    const buf = new Uint8Array(length);
    for (let i = 0; i < Math.min(str.length, length - 1); i++) {
      buf[i] = str.charCodeAt(i) & 0x7f;
    }
    this.push(buf);
  }

  writeBytes(bytes: Uint8Array) {
    this.push(bytes);
  }

  private push(bytes: Uint8Array) {
    this.chunks.push(bytes);
    this.totalLength += bytes.length;
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.totalLength);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}

function wrapRwChunk(type: number, payload: Uint8Array, version = RW_VERSION_36): Uint8Array {
  const out = new Uint8Array(12 + payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, type >>> 0, true);
  dv.setUint32(4, payload.length >>> 0, true);
  dv.setUint32(8, version >>> 0, true);
  out.set(payload, 12);
  return out;
}

function concatChunks(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function readChunkHeader(dv: DataView, offset: number, limit: number): RwChunkHeader | null {
  if (offset + 12 > limit) return null;
  const type = dv.getUint32(offset, true);
  const size = dv.getUint32(offset + 4, true);
  const version = dv.getUint32(offset + 8, true);
  const dataStart = offset + 12;
  const dataEnd = Math.min(limit, dataStart + size);
  return { type, size, version, dataStart, dataEnd };
}

function readAscii(bytes: Uint8Array, offset: number, maxLen: number): string {
  let out = '';
  const end = Math.min(bytes.length, offset + maxLen);
  for (let i = offset; i < end; i++) {
    const c = bytes[i];
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out.trim();
}

function sanitizeTexName(name: string): string {
  const cleaned = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 31);
  return cleaned || 'wmod_tex';
}

function makeRwStringChunk(str: string): Uint8Array {
  // RW strings are null-terminated and padded to 4 bytes
  const rawLen = str.length + 1;
  const paddedLen = Math.ceil(rawLen / 4) * 4;
  const buf = new Uint8Array(paddedLen);
  for (let i = 0; i < str.length; i++) {
    buf[i] = str.charCodeAt(i) & 0x7f;
  }
  return wrapRwChunk(RW_STRING, buf);
}

// ============================================================================
// DFF EXPORT
// ============================================================================

export function exportProjectToDFF(
  objects: SceneObjectData[],
  textures: TextureAsset[],
): Uint8Array {
  const validObjects = objects.filter((o) => o.visible);
  const exportList = validObjects.length > 0 ? validObjects : objects;

  // 1. Build CLUMP STRUCT (atomicCount, lightCount, cameraCount)
  const clumpStructWriter = new BinaryWriter();
  clumpStructWriter.writeInt32(exportList.length);
  clumpStructWriter.writeInt32(0);
  clumpStructWriter.writeInt32(0);
  const clumpStructChunk = wrapRwChunk(RW_STRUCT, clumpStructWriter.toUint8Array());

  // 2. Build FRAME_LIST (1 root frame + 1 frame per object)
  const frameStructWriter = new BinaryWriter();
  const frameCount = exportList.length + 1;
  frameStructWriter.writeInt32(frameCount);

  // Root frame identity (Z-up)
  frameStructWriter.writeFloat32(1);
  frameStructWriter.writeFloat32(0);
  frameStructWriter.writeFloat32(0);
  frameStructWriter.writeFloat32(0);
  frameStructWriter.writeFloat32(1);
  frameStructWriter.writeFloat32(0);
  frameStructWriter.writeFloat32(0);
  frameStructWriter.writeFloat32(0);
  frameStructWriter.writeFloat32(1);
  frameStructWriter.writeFloat32(0);
  frameStructWriter.writeFloat32(0);
  frameStructWriter.writeFloat32(0);
  frameStructWriter.writeInt32(-1);
  frameStructWriter.writeInt32(0);

  const frameExtensions: Uint8Array[] = [];
  // Root frame name extension
  {
    const nameBytes = new TextEncoder().encode('WMODELER_ROOT');
    const nameChunk = wrapRwChunk(RW_FRAME_NAME, nameBytes);
    frameExtensions.push(wrapRwChunk(RW_EXTENSION, nameChunk));
  }

  const _rotEuler = new THREE.Euler();
  const _rotMat = new THREE.Matrix4();

  for (const obj of exportList) {
    // Convert Three.js Y-up rotation + position to RenderWare Z-up (x, -z, y)
    _rotEuler.set(
      THREE.MathUtils.degToRad(obj.rotation.x),
      THREE.MathUtils.degToRad(obj.rotation.y),
      THREE.MathUtils.degToRad(obj.rotation.z),
      'XYZ',
    );
    _rotMat.makeRotationFromEuler(_rotEuler);
    const e = _rotMat.elements;
    // Transform basis vectors from Three.js (X, Y, Z) -> RW (X, -Z, Y)
    // Column 0 (Right)
    frameStructWriter.writeFloat32(e[0]);
    frameStructWriter.writeFloat32(-e[2]);
    frameStructWriter.writeFloat32(e[1]);
    // Column 1 (Up in Y-up -> Forward/Up mapping)
    frameStructWriter.writeFloat32(-e[8]);
    frameStructWriter.writeFloat32(e[10]);
    frameStructWriter.writeFloat32(-e[9]);
    // Column 2 (Z in RW)
    frameStructWriter.writeFloat32(e[4]);
    frameStructWriter.writeFloat32(-e[6]);
    frameStructWriter.writeFloat32(e[5]);
    // Position (x, -z, y)
    frameStructWriter.writeFloat32(obj.position.x);
    frameStructWriter.writeFloat32(-obj.position.z);
    frameStructWriter.writeFloat32(obj.position.y);
    frameStructWriter.writeInt32(0); // parent = root frame 0
    frameStructWriter.writeInt32(0); // flags

    const safeName = obj.name.replace(/[^\x20-\x7e]/g, '_').slice(0, 31) || 'mesh';
    const nameBytes = new TextEncoder().encode(safeName);
    const nameChunk = wrapRwChunk(RW_FRAME_NAME, nameBytes);
    frameExtensions.push(wrapRwChunk(RW_EXTENSION, nameChunk));
  }

  const frameListChunk = wrapRwChunk(
    RW_FRAME_LIST,
    concatChunks([wrapRwChunk(RW_STRUCT, frameStructWriter.toUint8Array()), ...frameExtensions]),
  );

  // 3. Build GEOMETRY_LIST
  const geometryChunks: Uint8Array[] = [];
  for (const obj of exportList) {
    const geo = buildObjectGeometry(obj);
    geo.scale(obj.scale.x, obj.scale.y, obj.scale.z);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const normAttr = geo.attributes.normal as THREE.BufferAttribute;
    const uvAttr = geo.attributes.uv as THREE.BufferAttribute | undefined;
    const idxAttr = geo.index;

    const vertexCount = posAttr.count;
    const triCount = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(vertexCount / 3);
    const flags =
      rpGEOMETRYPOSITIONS |
      rpGEOMETRYTEXTURED |
      rpGEOMETRYNORMALS |
      rpGEOMETRYLIGHT |
      rpGEOMETRYMODULATEMATERIALCOLOR;

    const geoStructWriter = new BinaryWriter();
    geoStructWriter.writeInt32(flags);
    geoStructWriter.writeInt32(triCount);
    geoStructWriter.writeInt32(vertexCount);
    geoStructWriter.writeInt32(1); // morphTargetCount

    // UV Coordinates (1 layer) - flip V for RenderWare/DirectX convention
    for (let i = 0; i < vertexCount; i++) {
      const u = uvAttr ? uvAttr.getX(i) : 0;
      const v = uvAttr ? 1 - uvAttr.getY(i) : 0;
      geoStructWriter.writeFloat32(u);
      geoStructWriter.writeFloat32(v);
    }

    // Triangles: RW format is (vertex2, vertex1, materialId, vertex3) as uint16
    for (let t = 0; t < triCount; t++) {
      const i0 = idxAttr ? idxAttr.getX(t * 3) : t * 3;
      const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;
      geoStructWriter.writeUint16(i1);
      geoStructWriter.writeUint16(i0);
      geoStructWriter.writeUint16(0); // material index
      geoStructWriter.writeUint16(i2);
    }

    // Bounding Sphere (center x, -z, y, radius) + hasVertices + hasNormals
    const bs = geo.boundingSphere || new THREE.Sphere(new THREE.Vector3(), 1);
    geoStructWriter.writeFloat32(bs.center.x);
    geoStructWriter.writeFloat32(-bs.center.z);
    geoStructWriter.writeFloat32(bs.center.y);
    geoStructWriter.writeFloat32(bs.radius);
    geoStructWriter.writeInt32(1); // hasPositions
    geoStructWriter.writeInt32(1); // hasNormals

    // Vertices (RW Z-up: x, -z, y)
    for (let i = 0; i < vertexCount; i++) {
      geoStructWriter.writeFloat32(posAttr.getX(i));
      geoStructWriter.writeFloat32(-posAttr.getZ(i));
      geoStructWriter.writeFloat32(posAttr.getY(i));
    }

    // Normals (RW Z-up: nx, -nz, ny)
    for (let i = 0; i < vertexCount; i++) {
      geoStructWriter.writeFloat32(normAttr.getX(i));
      geoStructWriter.writeFloat32(-normAttr.getZ(i));
      geoStructWriter.writeFloat32(normAttr.getY(i));
    }

    geo.dispose();

    // Material List for this geometry
    const color = new THREE.Color(obj.material.color);
    const rByte = Math.round(color.r * 255);
    const gByte = Math.round(color.g * 255);
    const bByte = Math.round(color.b * 255);
    const aByte = Math.round(obj.material.opacity * 255);

    const assignedTex = obj.material.textureId
      ? textures.find((t) => t.id === obj.material.textureId)
      : null;
    const hasTex = Boolean(assignedTex);

    const matStruct = new BinaryWriter();
    matStruct.writeInt32(0); // flags
    matStruct.writeUint8(rByte);
    matStruct.writeUint8(gByte);
    matStruct.writeUint8(bByte);
    matStruct.writeUint8(aByte);
    matStruct.writeInt32(0); // unused
    matStruct.writeInt32(hasTex ? 1 : 0); // isTextured
    matStruct.writeFloat32(1.0); // ambient
    matStruct.writeFloat32(1.0 - obj.material.roughness * 0.5); // specular
    matStruct.writeFloat32(1.0); // diffuse

    const matChildren: Uint8Array[] = [wrapRwChunk(RW_STRUCT, matStruct.toUint8Array())];
    if (assignedTex) {
      const texStruct = new BinaryWriter();
      texStruct.writeUint16(0x0106); // linear mipmap filter + wrap
      texStruct.writeUint16(0x0001);
      const texName = sanitizeTexName(assignedTex.name);
      const texChunk = wrapRwChunk(
        RW_TEXTURE,
        concatChunks([
          wrapRwChunk(RW_STRUCT, texStruct.toUint8Array()),
          makeRwStringChunk(texName),
          makeRwStringChunk(''), // mask name
          wrapRwChunk(RW_EXTENSION, new Uint8Array(0)),
        ]),
      );
      matChildren.push(texChunk);
    }
    matChildren.push(wrapRwChunk(RW_EXTENSION, new Uint8Array(0)));

    const materialChunk = wrapRwChunk(RW_MATERIAL, concatChunks(matChildren));

    const matListStruct = new BinaryWriter();
    matListStruct.writeInt32(1); // 1 material
    matListStruct.writeInt32(-1); // instance index
    const matListChunk = wrapRwChunk(
      RW_MATERIAL_LIST,
      concatChunks([wrapRwChunk(RW_STRUCT, matListStruct.toUint8Array()), materialChunk]),
    );

    const geoChunk = wrapRwChunk(
      RW_GEOMETRY,
      concatChunks([
        wrapRwChunk(RW_STRUCT, geoStructWriter.toUint8Array()),
        matListChunk,
        wrapRwChunk(RW_EXTENSION, new Uint8Array(0)),
      ]),
    );
    geometryChunks.push(geoChunk);
  }

  const geoListStruct = new BinaryWriter();
  geoListStruct.writeInt32(geometryChunks.length);
  const geoListChunk = wrapRwChunk(
    RW_GEOMETRY_LIST,
    concatChunks([wrapRwChunk(RW_STRUCT, geoListStruct.toUint8Array()), ...geometryChunks]),
  );

  // 4. Build ATOMIC entries linking frameIndex (i+1) to geometryIndex (i)
  const atomicChunks: Uint8Array[] = [];
  for (let i = 0; i < exportList.length; i++) {
    const atomicWriter = new BinaryWriter();
    atomicWriter.writeInt32(i + 1); // frame index (skip root 0)
    atomicWriter.writeInt32(i); // geometry index
    atomicWriter.writeInt32(0x05); // flags: collisionTest + render
    atomicWriter.writeInt32(0); // unused
    atomicChunks.push(
      wrapRwChunk(
        RW_ATOMIC,
        concatChunks([
          wrapRwChunk(RW_STRUCT, atomicWriter.toUint8Array()),
          wrapRwChunk(RW_EXTENSION, new Uint8Array(0)),
        ]),
      ),
    );
  }

  return wrapRwChunk(
    RW_CLUMP,
    concatChunks([
      clumpStructChunk,
      frameListChunk,
      geoListChunk,
      ...atomicChunks,
      wrapRwChunk(RW_EXTENSION, new Uint8Array(0)),
    ]),
  );
}

// ============================================================================
// DFF IMPORT
// ============================================================================

interface ParsedFrame {
  position: THREE.Vector3;
  parentIndex: number;
  name: string;
}

interface ParsedGeometry {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  colorHex: string;
  opacity: number;
  textureName: string | null;
}

export function importDFFBuffer(buffer: ArrayBuffer, fallbackName: string): SceneObjectData[] {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  const root = readChunkHeader(dv, 0, bytes.length);
  if (!root || root.type !== RW_CLUMP) {
    throw new Error('Invalid DFF file: missing RenderWare Clump header.');
  }

  const frames: ParsedFrame[] = [];
  const geometries: ParsedGeometry[] = [];
  const atomics: Array<{ frameIndex: number; geometryIndex: number }> = [];

  let cursor = root.dataStart;
  while (cursor < root.dataEnd) {
    const chunk = readChunkHeader(dv, cursor, root.dataEnd);
    if (!chunk) break;

    if (chunk.type === RW_FRAME_LIST) {
      let fc = chunk.dataStart;
      let frameNameIdx = 0;
      while (fc < chunk.dataEnd) {
        const sub = readChunkHeader(dv, fc, chunk.dataEnd);
        if (!sub) break;
        if (sub.type === RW_STRUCT) {
          const count = dv.getInt32(sub.dataStart, true);
          let p = sub.dataStart + 4;
          for (let i = 0; i < count && p + 56 <= sub.dataEnd; i++) {
            // 9 floats rotation matrix (36 bytes), 3 floats pos (12 bytes), int32 parent, int32 flags
            const px = dv.getFloat32(p + 36, true);
            const py = dv.getFloat32(p + 40, true);
            const pz = dv.getFloat32(p + 44, true);
            const parentIndex = dv.getInt32(p + 48, true);
            frames.push({
              // RW Z-up (x, y, z) -> Three Y-up (x, z, -y)
              position: new THREE.Vector3(px, pz, -py),
              parentIndex,
              name: `${fallbackName}_${i}`,
            });
            p += 56;
          }
        } else if (sub.type === RW_EXTENSION) {
          let ec = sub.dataStart;
          while (ec < sub.dataEnd) {
            const ext = readChunkHeader(dv, ec, sub.dataEnd);
            if (!ext) break;
            if (ext.type === RW_FRAME_NAME && frames[frameNameIdx]) {
              const decoded = readAscii(bytes, ext.dataStart, ext.size);
              if (decoded) frames[frameNameIdx].name = decoded;
            }
            ec = ext.dataEnd;
          }
          frameNameIdx += 1;
        }
        fc = sub.dataEnd;
      }
    } else if (chunk.type === RW_GEOMETRY_LIST) {
      let gc = chunk.dataStart;
      while (gc < chunk.dataEnd) {
        const sub = readChunkHeader(dv, gc, chunk.dataEnd);
        if (!sub) break;
        if (sub.type === RW_GEOMETRY) {
          const parsed = parseGeometryChunk(bytes, dv, sub);
          if (parsed) geometries.push(parsed);
        }
        gc = sub.dataEnd;
      }
    } else if (chunk.type === RW_ATOMIC) {
      let ac = chunk.dataStart;
      while (ac < chunk.dataEnd) {
        const sub = readChunkHeader(dv, ac, chunk.dataEnd);
        if (!sub) break;
        if (sub.type === RW_STRUCT && sub.size >= 16) {
          const frameIndex = dv.getInt32(sub.dataStart, true);
          const geometryIndex = dv.getInt32(sub.dataStart + 4, true);
          atomics.push({ frameIndex, geometryIndex });
        }
        ac = sub.dataEnd;
      }
    }

    cursor = chunk.dataEnd;
  }

  if (geometries.length === 0) {
    throw new Error('No 3D geometry found inside DFF file.');
  }

  const mappings =
    atomics.length > 0
      ? atomics
      : geometries.map((_, idx) => ({ frameIndex: idx + 1, geometryIndex: idx }));

  const results: SceneObjectData[] = [];
  for (let i = 0; i < mappings.length; i++) {
    const { frameIndex, geometryIndex } = mappings[i];
    const geo = geometries[geometryIndex];
    if (!geo) continue;

    // Accumulate world frame position through parent chain
    const worldPos = new THREE.Vector3();
    let fIdx = frameIndex;
    let safety = 0;
    while (fIdx >= 0 && fIdx < frames.length && safety < 16) {
      worldPos.add(frames[fIdx].position);
      fIdx = frames[fIdx].parentIndex;
      safety += 1;
    }

    const frameName =
      frames[frameIndex]?.name && !frames[frameIndex].name.includes('ROOT')
        ? frames[frameIndex].name
        : `${fallbackName} ${i + 1}`;

    results.push({
      id: nextId('obj'),
      name: frameName,
      type: 'custom_mesh',
      position: {
        x: Math.round(worldPos.x * 1000) / 1000,
        y: Math.round(Math.max(0.2, worldPos.y) * 1000) / 1000,
        z: Math.round(worldPos.z * 1000) / 1000,
      },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      locked: false,
      material: createDefaultMaterial({
        color: geo.colorHex,
        opacity: geo.opacity,
        metalness: 0.2,
        roughness: 0.45,
      }),
      modifiers: { ...DEFAULT_MODIFIERS },
      requestedTextureName: geo.textureName || undefined,
      customMesh: {
        positions: geo.positions,
        normals: geo.normals,
        uvs: geo.uvs,
        indices: geo.indices,
      },
    });
  }

  return results;
}

function parseGeometryChunk(
  bytes: Uint8Array,
  dv: DataView,
  chunk: RwChunkHeader,
): ParsedGeometry | null {
  let cursor = chunk.dataStart;
  let positions: number[] = [];
  let normals: number[] = [];
  let uvs: number[] = [];
  let indices: number[] = [];
  let colorHex = '#cbd5e1';
  let opacity = 1;
  let textureName: string | null = null;

  while (cursor < chunk.dataEnd) {
    const sub = readChunkHeader(dv, cursor, chunk.dataEnd);
    if (!sub) break;

    if (sub.type === RW_STRUCT && sub.size >= 16) {
      let p = sub.dataStart;
      const flags = dv.getUint32(p, true);
      const triCount = dv.getInt32(p + 4, true);
      const vertCount = dv.getInt32(p + 8, true);
      // morphTargetCount at p + 12
      p += 16;

      // Older RW versions (< 0x34000) had ambient/specular/diffuse floats here
      if (sub.version < 0x1003ffff && sub.version < 0x34000) {
        p += 12;
      }

      const isNative = (flags & 0x01000000) !== 0;
      if (!isNative && vertCount > 0 && triCount > 0) {
        if (flags & rpGEOMETRYPRELIT) {
          p += vertCount * 4;
        }
        const texLayers =
          (flags & rpGEOMETRYTEXTURED2) !== 0
            ? 2
            : (flags & rpGEOMETRYTEXTURED) !== 0
              ? 1
              : 0;
        if (texLayers > 0) {
          uvs = new Array(vertCount * 2);
          for (let i = 0; i < vertCount && p + 8 <= sub.dataEnd; i++) {
            const u = dv.getFloat32(p, true);
            const v = dv.getFloat32(p + 4, true);
            uvs[i * 2] = u;
            uvs[i * 2 + 1] = 1 - v;
            p += 8;
          }
          if (texLayers > 1) {
            p += vertCount * 8 * (texLayers - 1);
          }
        }

        // Triangles: (v2, v1, matId, v3)
        indices = [];
        for (let t = 0; t < triCount && p + 8 <= sub.dataEnd; t++) {
          const v2 = dv.getUint16(p, true);
          const v1 = dv.getUint16(p + 2, true);
          // matId at p + 4
          const v3 = dv.getUint16(p + 6, true);
          if (v1 < vertCount && v2 < vertCount && v3 < vertCount) {
            indices.push(v1, v2, v3);
          }
          p += 8;
        }

        // Morph target: bounding sphere (16 bytes) + hasPositions (4) + hasNormals (4)
        if (p + 24 <= sub.dataEnd) {
          p += 16;
          const hasPositions = dv.getInt32(p, true) !== 0 || (flags & rpGEOMETRYPOSITIONS) !== 0;
          const hasNormals = dv.getInt32(p + 4, true) !== 0 || (flags & rpGEOMETRYNORMALS) !== 0;
          p += 8;

          if (hasPositions) {
            positions = new Array(vertCount * 3);
            for (let i = 0; i < vertCount && p + 12 <= sub.dataEnd; i++) {
              const vx = dv.getFloat32(p, true);
              const vy = dv.getFloat32(p + 4, true);
              const vz = dv.getFloat32(p + 8, true);
              // RW Z-up -> Three Y-up
              positions[i * 3] = vx;
              positions[i * 3 + 1] = vz;
              positions[i * 3 + 2] = -vy;
              p += 12;
            }
          }

          if (hasNormals) {
            normals = new Array(vertCount * 3);
            for (let i = 0; i < vertCount && p + 12 <= sub.dataEnd; i++) {
              const nx = dv.getFloat32(p, true);
              const ny = dv.getFloat32(p + 4, true);
              const nz = dv.getFloat32(p + 8, true);
              normals[i * 3] = nx;
              normals[i * 3 + 1] = nz;
              normals[i * 3 + 2] = -ny;
              p += 12;
            }
          }
        }
      }
      // If tristrip flag was set, keep triangle list conversion simple if needed
      if ((flags & rpGEOMETRYTRISTRIP) !== 0 && indices.length > 0) {
        // Indices already valid triangle tuples in standard RW files unless strip-packed
      }
    } else if (sub.type === RW_MATERIAL_LIST) {
      let mc = sub.dataStart;
      while (mc < sub.dataEnd) {
        const matChunk = readChunkHeader(dv, mc, sub.dataEnd);
        if (!matChunk) break;
        if (matChunk.type === RW_MATERIAL) {
          let mSubCursor = matChunk.dataStart;
          while (mSubCursor < matChunk.dataEnd) {
            const mSub = readChunkHeader(dv, mSubCursor, matChunk.dataEnd);
            if (!mSub) break;
            if (mSub.type === RW_STRUCT && mSub.size >= 8) {
              const r = bytes[mSub.dataStart + 4];
              const g = bytes[mSub.dataStart + 5];
              const b = bytes[mSub.dataStart + 6];
              const a = bytes[mSub.dataStart + 7];
              colorHex = `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
              opacity = Math.max(0.1, Math.round((a / 255) * 100) / 100);
            } else if (mSub.type === RW_TEXTURE && !textureName) {
              let tc = mSub.dataStart;
              while (tc < mSub.dataEnd) {
                const tSub = readChunkHeader(dv, tc, mSub.dataEnd);
                if (!tSub) break;
                if (tSub.type === RW_STRING && !textureName) {
                  const s = readAscii(bytes, tSub.dataStart, tSub.size);
                  if (s) textureName = s;
                }
                tc = tSub.dataEnd;
              }
            }
            mSubCursor = mSub.dataEnd;
          }
          break;
        }
        mc = matChunk.dataEnd;
      }
    }

    cursor = sub.dataEnd;
  }

  if (positions.length === 0) return null;
  return {
    positions,
    normals,
    uvs,
    indices,
    colorHex,
    opacity,
    textureName,
  };
}

// ============================================================================
// TXD EXPORT (Packs PNG textures into RenderWare Texture Dictionary)
// ============================================================================

async function loadImageToRGBA(dataUrl: string): Promise<{
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Keep max 512x512 for fast mobile TXD export
      const maxDim = 512;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(4, Math.round((img.naturalWidth * scale) / 4) * 4);
      const h = Math.max(4, Math.round((img.naturalHeight * scale) / 4) * 4);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      resolve({ width: w, height: h, rgba: imageData.data });
    };
    img.onerror = () => reject(new Error('Failed to decode PNG texture'));
    img.src = dataUrl;
  });
}

export async function exportTexturesToTXD(textures: TextureAsset[]): Promise<Uint8Array> {
  if (textures.length === 0) {
    throw new Error('No textures available to export into TXD.');
  }

  const dictStruct = new BinaryWriter();
  dictStruct.writeUint16(textures.length);
  dictStruct.writeUint16(2); // deviceId = Direct3D9 / PC-Android compatible
  const dictStructChunk = wrapRwChunk(RW_STRUCT, dictStruct.toUint8Array());

  const nativeChunks: Uint8Array[] = [];

  for (const tex of textures) {
    const { width, height, rgba } = await loadImageToRGBA(tex.dataUrl);
    const writer = new BinaryWriter();

    // Platform header (88 bytes for RW D3D9 Native Texture)
    writer.writeUint32(9); // platformId: 9 (D3D9)
    writer.writeUint32(0x00010106); // filter + wrap UV
    writer.writeFixedString(sanitizeTexName(tex.name), 32);
    writer.writeFixedString('', 32); // maskName
    writer.writeUint32(RASTER_8888); // rasterFormat: 32-bit BGRA8888
    writer.writeUint32(21); // D3DFMT_A8R8G8B8
    writer.writeUint16(width);
    writer.writeUint16(height);
    writer.writeUint8(32); // depth = 32 bpp
    writer.writeUint8(1); // numLevels = 1 mip
    writer.writeUint8(4); // rasterType = 4 (Texture)
    writer.writeUint8(0x01); // alpha flag

    // Pixel data size + BGRA bytes
    const pixelCount = width * height;
    const bgra = new Uint8Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const si = i * 4;
      bgra[si] = rgba[si + 2]; // B
      bgra[si + 1] = rgba[si + 1]; // G
      bgra[si + 2] = rgba[si]; // R
      bgra[si + 3] = rgba[si + 3]; // A
    }

    writer.writeUint32(bgra.length);
    writer.writeBytes(bgra);

    const nativeChunk = wrapRwChunk(
      RW_TEXTURE_NATIVE,
      concatChunks([
        wrapRwChunk(RW_STRUCT, writer.toUint8Array()),
        wrapRwChunk(RW_EXTENSION, new Uint8Array(0)),
      ]),
    );
    nativeChunks.push(nativeChunk);
  }

  return wrapRwChunk(RW_TEXDICTIONARY, concatChunks([dictStructChunk, ...nativeChunks]));
}

// ============================================================================
// TXD IMPORT (Decodes TXD rasters & DXT1/DXT3/DXT5 into PNG TextureAssets)
// ============================================================================

function rgb565ToRgba(c: number): [number, number, number] {
  const r = (((c >> 11) & 0x1f) * 255) / 31;
  const g = (((c >> 5) & 0x3f) * 255) / 63;
  const b = ((c & 0x1f) * 255) / 31;
  return [Math.round(r), Math.round(g), Math.round(b)];
}

function decodeDXTBlockColor(
  c0: number,
  c1: number,
  lut: number,
  alphaMode: 'dxt1' | 'opaque',
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(16 * 4);
  const [r0, g0, b0] = rgb565ToRgba(c0);
  const [r1, g1, b1] = rgb565ToRgba(c1);

  const colors: Array<[number, number, number, number]> = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 255],
  ];

  if (alphaMode === 'opaque' || c0 > c1) {
    colors[2] = [Math.round((2 * r0 + r1) / 3), Math.round((2 * g0 + g1) / 3), Math.round((2 * b0 + b1) / 3), 255];
    colors[3] = [Math.round((r0 + 2 * r1) / 3), Math.round((g0 + 2 * g1) / 3), Math.round((b0 + 2 * b1) / 3), 255];
  } else {
    colors[2] = [Math.round((r0 + r1) / 2), Math.round((g0 + g1) / 2), Math.round((b0 + b1) / 2), 255];
    colors[3] = [0, 0, 0, 0];
  }

  for (let i = 0; i < 16; i++) {
    const idx = (lut >>> (i * 2)) & 0x03;
    const col = colors[idx];
    out[i * 4] = col[0];
    out[i * 4 + 1] = col[1];
    out[i * 4 + 2] = col[2];
    out[i * 4 + 3] = col[3];
  }
  return out;
}

function decompressDXT(
  src: Uint8Array,
  offset: number,
  width: number,
  height: number,
  mode: 'DXT1' | 'DXT3' | 'DXT5',
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const blocksX = Math.max(1, Math.ceil(width / 4));
  const blocksY = Math.max(1, Math.ceil(height / 4));
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  let p = offset;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      if (p + (mode === 'DXT1' ? 8 : 16) > src.length) break;
      let alphaBlockOffset = p;
      if (mode !== 'DXT1') p += 8;

      const c0 = dv.getUint16(p, true);
      const c1 = dv.getUint16(p + 2, true);
      const lut = dv.getUint32(p + 4, true);
      p += 8;

      const block = decodeDXTBlockColor(c0, c1, lut, mode === 'DXT1' ? 'dxt1' : 'opaque');

      if (mode === 'DXT3') {
        for (let i = 0; i < 16; i++) {
          const byteVal = src[alphaBlockOffset + Math.floor(i / 2)];
          const nib = i % 2 === 0 ? byteVal & 0x0f : (byteVal >> 4) & 0x0f;
          block[i * 4 + 3] = nib * 17;
        }
      } else if (mode === 'DXT5') {
        const a0 = src[alphaBlockOffset];
        const a1 = src[alphaBlockOffset + 1];
        const alphas = [a0, a1, 0, 0, 0, 0, 0, 0];
        if (a0 > a1) {
          for (let k = 1; k <= 6; k++) {
            alphas[k + 1] = Math.round(((7 - k) * a0 + k * a1) / 7);
          }
        } else {
          for (let k = 1; k <= 4; k++) {
            alphas[k + 1] = Math.round(((5 - k) * a0 + k * a1) / 5);
          }
          alphas[6] = 0;
          alphas[7] = 255;
        }
        // 48-bit alpha lookup across 6 bytes
        let bits = 0n;
        for (let b = 0; b < 6; b++) {
          bits |= BigInt(src[alphaBlockOffset + 2 + b]) << BigInt(b * 8);
        }
        for (let i = 0; i < 16; i++) {
          const aIdx = Number((bits >> BigInt(i * 3)) & 0x7n);
          block[i * 4 + 3] = alphas[aIdx];
        }
      }

      for (let py = 0; py < 4; py++) {
        const gy = by * 4 + py;
        if (gy >= height) continue;
        for (let px = 0; px < 4; px++) {
          const gx = bx * 4 + px;
          if (gx >= width) continue;
          const si = (py * 4 + px) * 4;
          const di = (gy * width + gx) * 4;
          rgba[di] = block[si];
          rgba[di + 1] = block[si + 1];
          rgba[di + 2] = block[si + 2];
          rgba[di + 3] = block[si + 3];
        }
      }
    }
  }

  return rgba;
}

function rgbaToPngDataUrl(width: number, height: number, rgba: Uint8ClampedArray): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imgData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function importTXDBuffer(buffer: ArrayBuffer): Promise<TextureAsset[]> {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  const root = readChunkHeader(dv, 0, bytes.length);
  if (!root || root.type !== RW_TEXDICTIONARY) {
    throw new Error('Invalid TXD file: missing RenderWare Texture Dictionary header.');
  }

  const imported: TextureAsset[] = [];
  let cursor = root.dataStart;

  while (cursor < root.dataEnd) {
    const chunk = readChunkHeader(dv, cursor, root.dataEnd);
    if (!chunk) break;

    if (chunk.type === RW_TEXTURE_NATIVE) {
      let sc = chunk.dataStart;
      while (sc < chunk.dataEnd) {
        const sub = readChunkHeader(dv, sc, chunk.dataEnd);
        if (!sub) break;
        if (sub.type === RW_STRUCT && sub.size >= 88) {
          const tex = decodeNativeTextureStruct(bytes, dv, sub);
          if (tex) imported.push(tex);
        }
        sc = sub.dataEnd;
      }
    }
    cursor = chunk.dataEnd;
  }

  if (imported.length === 0) {
    throw new Error('No decodable textures found inside TXD archive.');
  }
  return imported;
}

function decodeNativeTextureStruct(
  bytes: Uint8Array,
  dv: DataView,
  sub: RwChunkHeader,
): TextureAsset | null {
  const s = sub.dataStart;
  const name = readAscii(bytes, s + 8, 32) || 'txd_texture';
  const rasterFormat = dv.getUint32(s + 72, true);
  const d3dFourCC = dv.getUint32(s + 76, true);
  const width = dv.getUint16(s + 80, true);
  const height = dv.getUint16(s + 82, true);
  const depth = bytes[s + 84];
  const compression = bytes[s + 87];

  if (width === 0 || height === 0 || width > 4096 || height > 4096) return null;

  let p = s + 88;
  let palette: Uint8Array | null = null;
  if ((rasterFormat & RASTER_PAL8) !== 0 && p + 1024 <= sub.dataEnd) {
    palette = bytes.subarray(p, p + 1024);
    p += 1024;
  } else if ((rasterFormat & RASTER_PAL4) !== 0 && p + 64 <= sub.dataEnd) {
    palette = bytes.subarray(p, p + 64);
    p += 64;
  }

  if (p + 4 > sub.dataEnd) return null;
  const dataSize = dv.getUint32(p, true);
  p += 4;
  if (p >= sub.dataEnd) return null;

  // Check for embedded PNG signature inside mobile TXD wrappers
  if (
    p + 8 <= sub.dataEnd &&
    bytes[p] === 0x89 &&
    bytes[p + 1] === 0x50 &&
    bytes[p + 2] === 0x4e &&
    bytes[p + 3] === 0x47
  ) {
    const pngSlice = bytes.subarray(p, Math.min(sub.dataEnd, p + dataSize));
    let bin = '';
    for (let i = 0; i < pngSlice.length; i++) bin += String.fromCharCode(pngSlice[i]);
    const dataUrl = `data:image/png;base64,${btoa(bin)}`;
    return {
      id: nextId('tex'),
      name,
      category: 'Custom',
      isBuiltIn: false,
      resolution: `${width}×${height}`,
      dataUrl,
      roughnessHint: 0.45,
      metalnessHint: 0.08,
      createdAt: Date.now(),
    };
  }

  const fourCCStr = String.fromCharCode(
    d3dFourCC & 0xff,
    (d3dFourCC >> 8) & 0xff,
    (d3dFourCC >> 16) & 0xff,
    (d3dFourCC >> 24) & 0xff,
  );

  let rgba: Uint8ClampedArray | null = null;

  if (fourCCStr === 'DXT1' || compression === 1) {
    rgba = decompressDXT(bytes, p, width, height, 'DXT1');
  } else if (fourCCStr === 'DXT3' || compression === 3) {
    rgba = decompressDXT(bytes, p, width, height, 'DXT3');
  } else if (fourCCStr === 'DXT5' || compression === 5) {
    rgba = decompressDXT(bytes, p, width, height, 'DXT5');
  } else if (palette && (rasterFormat & RASTER_PAL8) !== 0) {
    rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height && p + i < sub.dataEnd; i++) {
      const idx = bytes[p + i] * 4;
      rgba[i * 4] = palette[idx];
      rgba[i * 4 + 1] = palette[idx + 1];
      rgba[i * 4 + 2] = palette[idx + 2];
      rgba[i * 4 + 3] = palette[idx + 3];
    }
  } else if (palette && (rasterFormat & RASTER_PAL4) !== 0) {
    rgba = new Uint8ClampedArray(width * height * 4);
    const total = width * height;
    for (let i = 0; i < total; i++) {
      const b = bytes[p + Math.floor(i / 2)] || 0;
      const idx = (i % 2 === 0 ? b & 0x0f : (b >> 4) & 0x0f) * 4;
      rgba[i * 4] = palette[idx];
      rgba[i * 4 + 1] = palette[idx + 1];
      rgba[i * 4 + 2] = palette[idx + 2];
      rgba[i * 4 + 3] = palette[idx + 3];
    }
  } else if (depth === 32 || (rasterFormat & RASTER_FORMAT_MASK) === RASTER_8888 || (rasterFormat & RASTER_FORMAT_MASK) === RASTER_888) {
    rgba = new Uint8ClampedArray(width * height * 4);
    const hasAlpha = (rasterFormat & RASTER_FORMAT_MASK) === RASTER_8888;
    for (let i = 0; i < width * height && p + i * 4 + 3 < sub.dataEnd; i++) {
      const si = p + i * 4;
      rgba[i * 4] = bytes[si + 2]; // R
      rgba[i * 4 + 1] = bytes[si + 1]; // G
      rgba[i * 4 + 2] = bytes[si]; // B
      rgba[i * 4 + 3] = hasAlpha ? bytes[si + 3] : 255;
    }
  } else if (depth === 16) {
    rgba = new Uint8ClampedArray(width * height * 4);
    const fmt = rasterFormat & RASTER_FORMAT_MASK;
    for (let i = 0; i < width * height && p + i * 2 + 1 < sub.dataEnd; i++) {
      const v = dv.getUint16(p + i * 2, true);
      if (fmt === RASTER_1555) {
        rgba[i * 4] = (((v >> 10) & 0x1f) * 255) / 31;
        rgba[i * 4 + 1] = (((v >> 5) & 0x1f) * 255) / 31;
        rgba[i * 4 + 2] = ((v & 0x1f) * 255) / 31;
        rgba[i * 4 + 3] = v & 0x8000 ? 255 : 0;
      } else if (fmt === RASTER_4444) {
        rgba[i * 4] = ((v >> 8) & 0x0f) * 17;
        rgba[i * 4 + 1] = ((v >> 4) & 0x0f) * 17;
        rgba[i * 4 + 2] = (v & 0x0f) * 17;
        rgba[i * 4 + 3] = ((v >> 12) & 0x0f) * 17;
      } else {
        // RASTER_565
        const [r, g, b] = rgb565ToRgba(v);
        rgba[i * 4] = r;
        rgba[i * 4 + 1] = g;
        rgba[i * 4 + 2] = b;
        rgba[i * 4 + 3] = 255;
      }
    }
  }

  if (!rgba) return null;

  const dataUrl = rgbaToPngDataUrl(width, height, rgba);
  return {
    id: nextId('tex'),
    name,
    category: 'Custom',
    isBuiltIn: false,
    resolution: `${width}×${height}`,
    dataUrl,
    roughnessHint: 0.45,
    metalnessHint: 0.08,
    createdAt: Date.now(),
  };
}
