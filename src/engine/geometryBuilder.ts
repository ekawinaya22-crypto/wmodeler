import * as THREE from 'three';
import { SceneObjectData } from '../types/modeler';

function createHexPrismGeometry(segments: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const sides = 6;
  const radius = 0.65;
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: Math.max(1, Math.round(segments / 8)),
    depth: 0.9,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 3,
  });
  geo.center();
  geo.rotateX(Math.PI / 2);
  return geo;
}

function createVaseGeometry(segments: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -0.75),
    new THREE.Vector2(0.38, -0.75),
    new THREE.Vector2(0.46, -0.55),
    new THREE.Vector2(0.62, -0.15),
    new THREE.Vector2(0.56, 0.25),
    new THREE.Vector2(0.32, 0.55),
    new THREE.Vector2(0.4, 0.78),
    new THREE.Vector2(0.34, 0.78),
    new THREE.Vector2(0.26, 0.52),
    new THREE.Vector2(0.0, 0.48),
  ];
  const geo = new THREE.LatheGeometry(pts, Math.max(12, segments));
  geo.computeVertexNormals();
  return geo;
}

function createCustomMeshGeometry(obj: SceneObjectData): THREE.BufferGeometry {
  const payload = obj.customMesh;
  if (!payload || payload.positions.length === 0) {
    return new THREE.BoxGeometry(1, 1, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(payload.positions, 3));
  if (payload.normals && payload.normals.length === payload.positions.length) {
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(payload.normals, 3));
  }
  if (payload.uvs && payload.uvs.length > 0) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(payload.uvs, 2));
  }
  if (payload.indices && payload.indices.length > 0) {
    geo.setIndex(payload.indices);
  }
  if (!payload.normals || payload.normals.length === 0) {
    geo.computeVertexNormals();
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export function buildObjectGeometry(obj: SceneObjectData): THREE.BufferGeometry {
  const seg = Math.max(8, Math.min(48, Math.round(obj.modifiers.segments || 24)));
  const sub = Math.max(1, Math.round(seg / 6));
  let geo: THREE.BufferGeometry;

  switch (obj.type) {
    case 'cube':
      geo = new THREE.BoxGeometry(1, 1, 1, sub, sub, sub);
      break;
    case 'sphere':
      geo = new THREE.SphereGeometry(0.62, seg, Math.max(8, Math.round(seg * 0.75)));
      break;
    case 'cylinder':
      geo = new THREE.CylinderGeometry(0.55, 0.55, 1.2, seg, sub);
      break;
    case 'cone':
      geo = new THREE.ConeGeometry(0.62, 1.3, seg, sub);
      break;
    case 'torus':
      geo = new THREE.TorusGeometry(0.58, 0.22, Math.max(10, Math.round(seg * 0.6)), seg);
      break;
    case 'capsule':
      geo = new THREE.CapsuleGeometry(0.42, 0.75, Math.max(4, Math.round(seg / 4)), seg);
      break;
    case 'plane':
      geo = new THREE.PlaneGeometry(1.6, 1.6, sub, sub);
      geo.rotateX(-Math.PI / 2);
      break;
    case 'icosahedron':
      geo = new THREE.IcosahedronGeometry(0.68, Math.min(3, Math.floor(seg / 14)));
      break;
    case 'hexprism':
      geo = createHexPrismGeometry(seg);
      break;
    case 'vase':
      geo = createVaseGeometry(seg);
      break;
    case 'custom_mesh':
      geo = createCustomMeshGeometry(obj);
      break;
    default:
      geo = new THREE.BoxGeometry(1, 1, 1);
  }

  // Apply procedural vertex modifiers (twist, taper, inflate)
  const { twist, taper, inflate } = obj.modifiers;
  const hasModifiers =
    Math.abs(twist) > 0.01 || Math.abs(taper) > 0.001 || Math.abs(inflate) > 0.001;

  if (hasModifiers) {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    if (!geo.attributes.normal) {
      geo.computeVertexNormals();
    }
    const norm = geo.attributes.normal as THREE.BufferAttribute;
    const twistRad = THREE.MathUtils.degToRad(twist);

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      if (Math.abs(inflate) > 0.001 && norm) {
        x += norm.getX(i) * inflate;
        y += norm.getY(i) * inflate;
        z += norm.getZ(i) * inflate;
      }

      if (Math.abs(taper) > 0.001) {
        const factor = Math.max(0.15, 1 + y * taper);
        x *= factor;
        z *= factor;
      }

      if (Math.abs(twistRad) > 0.001) {
        const angle = y * twistRad;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const nx = x * cosA - z * sinA;
        const nz = x * sinA + z * cosA;
        x = nx;
        z = nz;
      }

      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  applyUVMapping(geo, obj);

  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export function applyUVMapping(geo: THREE.BufferGeometry, obj: SceneObjectData): void {
  const uvCfg = obj.uvMapping;
  const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
  if (!posAttr) return;

  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }
  const normAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;

  let uvAttr = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uvAttr) {
    uvAttr = new THREE.BufferAttribute(new Float32Array(posAttr.count * 2), 2);
    geo.setAttribute('uv', uvAttr);
  }

  if (!uvCfg) return;

  // Compute bounding box for normalized projection modes
  geo.computeBoundingBox();
  const box = geo.boundingBox || new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const sizeX = Math.max(0.001, box.max.x - box.min.x);
  const sizeY = Math.max(0.001, box.max.y - box.min.y);
  const sizeZ = Math.max(0.001, box.max.z - box.min.z);
  const cx = (box.min.x + box.max.x) * 0.5;
  const cy = (box.min.y + box.max.y) * 0.5;
  const cz = (box.min.z + box.max.z) * 0.5;

  const rotRad = THREE.MathUtils.degToRad(uvCfg.rotationDeg || 0);
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    let u = uvAttr.getX(i);
    let v = uvAttr.getY(i);

    if (
      uvCfg.projection === 'from-view' &&
      uvCfg.projectedFromViewUVs &&
      uvCfg.projectedFromViewUVs.length === posAttr.count * 2
    ) {
      u = uvCfg.projectedFromViewUVs[i * 2];
      v = uvCfg.projectedFromViewUVs[i * 2 + 1];
    } else if (uvCfg.projection === 'planar-top') {
      u = (x - box.min.x) / sizeX;
      v = (z - box.min.z) / sizeZ;
    } else if (uvCfg.projection === 'planar-front') {
      u = (x - box.min.x) / sizeX;
      v = (y - box.min.y) / sizeY;
    } else if (uvCfg.projection === 'box' && normAttr) {
      const nx = Math.abs(normAttr.getX(i));
      const ny = Math.abs(normAttr.getY(i));
      const nz = Math.abs(normAttr.getZ(i));
      if (ny >= nx && ny >= nz) {
        u = (x - box.min.x) / sizeX;
        v = (z - box.min.z) / sizeZ;
      } else if (nx >= ny && nx >= nz) {
        u = (z - box.min.z) / sizeZ;
        v = (y - box.min.y) / sizeY;
      } else {
        u = (x - box.min.x) / sizeX;
        v = (y - box.min.y) / sizeY;
      }
    } else if (uvCfg.projection === 'cylindrical') {
      const angle = Math.atan2(x - cx, z - cz);
      u = angle / (Math.PI * 2) + 0.5;
      v = (y - box.min.y) / sizeY;
    } else if (uvCfg.projection === 'spherical') {
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      const r = Math.max(0.0001, Math.hypot(dx, dy, dz));
      u = Math.atan2(dx, dz) / (Math.PI * 2) + 0.5;
      v = Math.asin(THREE.MathUtils.clamp(dy / r, -1, 1)) / Math.PI + 0.5;
    }

    if (uvCfg.flipU) u = 1 - u;
    if (uvCfg.flipV) v = 1 - v;

    // Rotate around (0.5, 0.5), then scale & offset
    const du = u - 0.5;
    const dv = v - 0.5;
    const ru = du * cosR - dv * sinR + 0.5;
    const rv = du * sinR + dv * cosR + 0.5;

    const finalU = ru * uvCfg.scaleU + uvCfg.offsetU;
    const finalV = rv * uvCfg.scaleV + uvCfg.offsetV;

    uvAttr.setXY(i, finalU, finalV);
  }

  uvAttr.needsUpdate = true;
}

export function extractCustomMeshFromThreeGeometry(
  geometry: THREE.BufferGeometry,
): SceneObjectData['customMesh'] {
  const cloned = geometry.clone();
  cloned.computeBoundingBox();
  const box = cloned.boundingBox;
  if (box) {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scaleFactor = 1.6 / maxDim;
    cloned.translate(-center.x, -center.y, -center.z);
    cloned.scale(scaleFactor, scaleFactor, scaleFactor);
  }
  if (!cloned.attributes.normal) {
    cloned.computeVertexNormals();
  }
  const posAttr = cloned.attributes.position;
  const normAttr = cloned.attributes.normal;
  const uvAttr = cloned.attributes.uv;
  const idxAttr = cloned.index;

  const payload: SceneObjectData['customMesh'] = {
    positions: Array.from(posAttr.array as Float32Array),
    normals: normAttr ? Array.from(normAttr.array as Float32Array) : undefined,
    uvs: uvAttr ? Array.from(uvAttr.array as Float32Array) : undefined,
    indices: idxAttr ? Array.from(idxAttr.array as Uint16Array | Uint32Array) : undefined,
  };
  cloned.dispose();
  return payload;
}
