import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { extractCustomMeshFromThreeGeometry } from './geometryBuilder';
import { importDFFBuffer, importTXDBuffer } from './rwFormat';
import { createDefaultMaterial, DEFAULT_MODIFIERS, nextId } from './sceneTemplates';
import { SceneObjectData, TextureAsset, WModelerProject } from '../types/modeler';

export interface ImportedScenePayload {
  objects: SceneObjectData[];
  textures?: TextureAsset[];
  projectName?: string;
}

export async function parseImportedFile(file: File): Promise<ImportedScenePayload> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.dff')) {
    const buffer = await file.arrayBuffer();
    const baseName = file.name.replace(/\.dff$/i, '');
    const objects = importDFFBuffer(buffer, baseName);
    return {
      projectName: baseName,
      objects,
    };
  }

  if (lower.endsWith('.txd')) {
    const buffer = await file.arrayBuffer();
    const textures = await importTXDBuffer(buffer);
    return {
      objects: [],
      textures,
    };
  }

  if (lower.endsWith('.json') || lower.endsWith('.wmod.json')) {
    const text = await file.text();
    const parsed = JSON.parse(text) as Partial<WModelerProject>;
    if (Array.isArray(parsed.objects)) {
      return {
        projectName: parsed.name || file.name.replace(/\.wmod\.json$|\.json$/i, ''),
        objects: parsed.objects.map((o) => ({
          ...o,
          id: nextId('obj'),
        })),
      };
    }
    throw new Error('Invalid WMODELER project file.');
  }

  if (lower.endsWith('.obj')) {
    const text = await file.text();
    const loader = new OBJLoader();
    const group = loader.parse(text);
    const objects: SceneObjectData[] = [];
    let index = 0;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        index += 1;
        objects.push({
          id: nextId('obj'),
          name: child.name || `${file.name.replace(/\.obj$/i, '')} ${index}`,
          type: 'custom_mesh',
          position: { x: 0, y: 0.8, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          visible: true,
          locked: false,
          material: createDefaultMaterial({ color: '#cbd5e1', metalness: 0.2, roughness: 0.45 }),
          modifiers: { ...DEFAULT_MODIFIERS },
          customMesh: extractCustomMeshFromThreeGeometry(child.geometry),
        });
      }
    });
    if (objects.length === 0) throw new Error('No mesh geometry found in OBJ file.');
    return { objects };
  }

  if (lower.endsWith('.stl')) {
    const buffer = await file.arrayBuffer();
    const loader = new STLLoader();
    const geo = loader.parse(buffer);
    const obj: SceneObjectData = {
      id: nextId('obj'),
      name: file.name.replace(/\.stl$/i, ''),
      type: 'custom_mesh',
      position: { x: 0, y: 0.8, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      locked: false,
      material: createDefaultMaterial({ color: '#94a3b8', metalness: 0.35, roughness: 0.4 }),
      modifiers: { ...DEFAULT_MODIFIERS },
      customMesh: extractCustomMeshFromThreeGeometry(geo),
    };
    geo.dispose();
    return { objects: [obj] };
  }

  if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
    const buffer = await file.arrayBuffer();
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.parse(buffer, '', (res) => resolve(res), (err) => reject(err));
    });
    const objects: SceneObjectData[] = [];
    let index = 0;
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        index += 1;
        const matColor =
          child.material instanceof THREE.MeshStandardMaterial
            ? `#${child.material.color.getHexString()}`
            : '#cbd5e1';
        objects.push({
          id: nextId('obj'),
          name: child.name || `${file.name.replace(/\.(glb|gltf)$/i, '')} ${index}`,
          type: 'custom_mesh',
          position: { x: 0, y: 0.8, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          visible: true,
          locked: false,
          material: createDefaultMaterial({ color: matColor, metalness: 0.25, roughness: 0.42 }),
          modifiers: { ...DEFAULT_MODIFIERS },
          customMesh: extractCustomMeshFromThreeGeometry(child.geometry),
        });
      }
    });
    if (objects.length === 0) throw new Error('No mesh geometry found in GLB/GLTF file.');
    return { objects };
  }

  throw new Error('Unsupported 3D format. Use .dff, .txd, .glb, .gltf, .obj, .stl, or .wmod.json.');
}
