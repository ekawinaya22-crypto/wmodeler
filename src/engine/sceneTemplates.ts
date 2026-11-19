import {
  AppSettings,
  GeometryModifiers,
  MaterialConfig,
  PrimitiveType,
  SceneObjectData,
  StoredFileItem,
  UVMappingConfig,
  WModelerProject,
} from '../types/modeler';

let uidCounter = 100;
export function nextId(prefix = 'id'): string {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
}

export const DEFAULT_MODIFIERS: GeometryModifiers = {
  twist: 0,
  taper: 0,
  inflate: 0,
  segments: 24,
};

export const DEFAULT_UV_MAPPING: UVMappingConfig = {
  projection: 'default',
  scaleU: 1,
  scaleV: 1,
  offsetU: 0,
  offsetV: 0,
  rotationDeg: 0,
  flipU: false,
  flipV: false,
  viewFitMode: 'aspect-bounds',
};

export function createDefaultMaterial(overrides?: Partial<MaterialConfig>): MaterialConfig {
  return {
    color: '#cbd5e1',
    metalness: 0.2,
    roughness: 0.45,
    clearcoat: 0.1,
    opacity: 1,
    emissive: '#000000',
    emissiveIntensity: 0,
    wireframe: false,
    flatShading: false,
    textureId: null,
    ...overrides,
  };
}

export function createPrimitiveObject(
  type: PrimitiveType,
  name?: string,
  offsetIndex = 0,
): SceneObjectData {
  const spreadX = ((offsetIndex % 5) - 2) * 0.45;
  const spreadZ = (Math.floor(offsetIndex / 5) % 3) * 0.45;
  const defaultY = type === 'plane' ? 0.02 : 0.65;

  const colorMap: Record<PrimitiveType, string> = {
    cube: '#94a3b8',
    sphere: '#60a5fa',
    cylinder: '#cbd5e1',
    cone: '#f59e0b',
    torus: '#38bdf8',
    capsule: '#a78bfa',
    plane: '#64748b',
    icosahedron: '#34d399',
    hexprism: '#eab308',
    vase: '#e2d5c3',
    custom_mesh: '#cbd5e1',
  };

  return {
    id: nextId('obj'),
    name: name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${offsetIndex + 1}`,
    type,
    position: { x: spreadX, y: defaultY, z: spreadZ },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    locked: false,
    material: createDefaultMaterial({
      color: colorMap[type],
      metalness: type === 'hexprism' || type === 'cylinder' ? 0.65 : 0.15,
      roughness: type === 'vase' ? 0.62 : 0.35,
    }),
    modifiers: { ...DEFAULT_MODIFIERS },
  };
}

export interface ProjectTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  buildObjects: () => SceneObjectData[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'rotary-actuator',
    name: 'Rotary Actuator Assembly',
    category: 'Mechanical CAD',
    description: '8-part precision anodized baseplate, brass rotor hub, fastener bolts, and optical housing.',
    buildObjects: () => [
      {
        id: nextId('obj'),
        name: 'Anodized Baseplate',
        type: 'cube',
        position: { x: 0, y: 0.14, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 3.2, y: 0.28, z: 2.6 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#2d333f',
          metalness: 0.78,
          roughness: 0.38,
          textureId: 'tex-brushed-aluminum',
        }),
        modifiers: { ...DEFAULT_MODIFIERS },
      },
      {
        id: nextId('obj'),
        name: 'Stator Flange Collar',
        type: 'hexprism',
        position: { x: 0, y: 0.52, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1.55, y: 0.48, z: 1.55 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#9aa4b2',
          metalness: 0.88,
          roughness: 0.24,
          clearcoat: 0.3,
        }),
        modifiers: { ...DEFAULT_MODIFIERS },
      },
      {
        id: nextId('obj'),
        name: 'Bearing Ring',
        type: 'torus',
        position: { x: 0, y: 0.86, z: 0 },
        rotation: { x: 90, y: 0, z: 0 },
        scale: { x: 1.15, y: 1.15, z: 0.7 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#3b82f6',
          metalness: 0.82,
          roughness: 0.22,
          clearcoat: 0.6,
        }),
        modifiers: { ...DEFAULT_MODIFIERS, segments: 32 },
      },
      {
        id: nextId('obj'),
        name: 'Brass Rotor Spindle',
        type: 'cylinder',
        position: { x: 0, y: 1.15, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.68, y: 0.92, z: 0.68 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#d4a34a',
          metalness: 0.94,
          roughness: 0.18,
          clearcoat: 0.2,
        }),
        modifiers: { ...DEFAULT_MODIFIERS, segments: 32 },
      },
      {
        id: nextId('obj'),
        name: 'Optical Sensor Dome',
        type: 'sphere',
        position: { x: 0, y: 1.72, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.44, y: 0.34, z: 0.44 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#93c5fd',
          metalness: 0.1,
          roughness: 0.08,
          clearcoat: 1.0,
          opacity: 0.78,
        }),
        modifiers: { ...DEFAULT_MODIFIERS, segments: 32 },
      },
      {
        id: nextId('obj'),
        name: 'Bolt NW',
        type: 'hexprism',
        position: { x: -1.15, y: 0.34, z: -0.9 },
        rotation: { x: 0, y: 15, z: 0 },
        scale: { x: 0.22, y: 0.14, z: 0.22 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({ color: '#cbd5e1', metalness: 0.92, roughness: 0.25 }),
        modifiers: { ...DEFAULT_MODIFIERS },
      },
      {
        id: nextId('obj'),
        name: 'Bolt NE',
        type: 'hexprism',
        position: { x: 1.15, y: 0.34, z: -0.9 },
        rotation: { x: 0, y: 45, z: 0 },
        scale: { x: 0.22, y: 0.14, z: 0.22 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({ color: '#cbd5e1', metalness: 0.92, roughness: 0.25 }),
        modifiers: { ...DEFAULT_MODIFIERS },
      },
      {
        id: nextId('obj'),
        name: 'Bolt SW',
        type: 'hexprism',
        position: { x: -1.15, y: 0.34, z: 0.9 },
        rotation: { x: 0, y: 30, z: 0 },
        scale: { x: 0.22, y: 0.14, z: 0.22 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({ color: '#cbd5e1', metalness: 0.92, roughness: 0.25 }),
        modifiers: { ...DEFAULT_MODIFIERS },
      },
    ],
  },
  {
    id: 'cantilever-pavilion',
    name: 'Cantilevered Pavilion',
    category: 'Architecture',
    description: 'Travertine plinth, colonnade pillars, and cantilevered timber-concrete canopy.',
    buildObjects: () => [
      {
        id: nextId('obj'),
        name: 'Travertine Plinth',
        type: 'cube',
        position: { x: 0, y: 0.12, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 4.2, y: 0.24, z: 3.0 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#dfd8cc',
          metalness: 0.0,
          roughness: 0.68,
          textureId: 'tex-travertine',
        }),
        modifiers: { ...DEFAULT_MODIFIERS },
      },
      ...[-1.5, -0.5, 0.5, 1.5].map((xPos, idx) => ({
        id: nextId('obj'),
        name: `Column ${idx + 1}`,
        type: 'cylinder' as PrimitiveType,
        position: { x: xPos, y: 1.04, z: -0.85 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.22, y: 1.35, z: 0.22 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#a3a8b0',
          metalness: 0.05,
          roughness: 0.8,
          textureId: 'tex-concrete',
        }),
        modifiers: { ...DEFAULT_MODIFIERS },
      })),
      {
        id: nextId('obj'),
        name: 'Canopy Roof Slab',
        type: 'cube',
        position: { x: 0, y: 1.94, z: 0.1 },
        rotation: { x: -3, y: 0, z: 0 },
        scale: { x: 4.5, y: 0.18, z: 2.8 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#7c5338',
          metalness: 0.0,
          roughness: 0.56,
          textureId: 'tex-walnut',
        }),
        modifiers: { ...DEFAULT_MODIFIERS },
      },
    ],
  },
  {
    id: 'ceramic-vessel-set',
    name: 'Lathe Ceramic Studio',
    category: 'Industrial Design',
    description: 'Turned stoneware vessels arranged on a walnut plinth with contrasting glazes.',
    buildObjects: () => [
      {
        id: nextId('obj'),
        name: 'Walnut Pedestal',
        type: 'cylinder',
        position: { x: 0, y: 0.15, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 2.5, y: 0.25, z: 2.5 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#6b4730',
          metalness: 0.0,
          roughness: 0.55,
          textureId: 'tex-walnut',
        }),
        modifiers: { ...DEFAULT_MODIFIERS, segments: 36 },
      },
      {
        id: nextId('obj'),
        name: 'Tall Fluted Amphora',
        type: 'vase',
        position: { x: -0.35, y: 1.05, z: -0.1 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.95, y: 1.0, z: 0.95 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#e6dfd3',
          metalness: 0.02,
          roughness: 0.32,
          clearcoat: 0.45,
        }),
        modifiers: { ...DEFAULT_MODIFIERS, segments: 36 },
      },
      {
        id: nextId('obj'),
        name: 'Cobalt Accent Vessel',
        type: 'vase',
        position: { x: 0.58, y: 0.78, z: 0.35 },
        rotation: { x: 0, y: 40, z: 0 },
        scale: { x: 0.65, y: 0.65, z: 0.65 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({
          color: '#2563eb',
          metalness: 0.08,
          roughness: 0.18,
          clearcoat: 0.9,
        }),
        modifiers: { ...DEFAULT_MODIFIERS, segments: 32, twist: 24 },
      },
    ],
  },
  {
    id: 'blank-studio',
    name: 'Blank Studio Scene',
    category: 'Starter',
    description: 'Clean studio grid with a single reference primitive ready for scratch modeling.',
    buildObjects: () => [
      {
        id: nextId('obj'),
        name: 'Reference Block',
        type: 'cube',
        position: { x: 0, y: 0.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visible: true,
        locked: false,
        material: createDefaultMaterial({ color: '#94a3b8', metalness: 0.25, roughness: 0.4 }),
        modifiers: { ...DEFAULT_MODIFIERS },
      },
    ],
  },
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  displayOverride: 'auto',
  toolbarSide: 'left',
  undoPosition: 'bottom-left',
  propertiesPanelWidth: 296,
  gizmoSize: 1.25,
  gridVisible: true,
  gridSize: 16,
  snapEnabled: false,
  snapIncrement: 0.25,
  touchGuardDefault: false,
  touchDeadzonePx: 6,
  viewportTheme: 'obsidian',
  autoSaveIntervalSec: 15,
  hapticsEnabled: true,
  uiDensity: 'auto',
};

export function createInitialProjects(): WModelerProject[] {
  const now = Date.now();
  return [
    {
      id: 'proj-rotary-actuator',
      name: 'Rotary Actuator MK-II',
      description: 'Precision CAD assembly with brushed aluminum housing and brass spindle.',
      templateId: 'rotary-actuator',
      createdAt: now - 86400000 * 3,
      updatedAt: now - 1200000,
      objects: PROJECT_TEMPLATES[0].buildObjects(),
    },
    {
      id: 'proj-pavilion',
      name: 'Cantilevered Pavilion',
      description: 'Architectural study featuring travertine base and walnut canopy.',
      templateId: 'cantilever-pavilion',
      createdAt: now - 86400000 * 6,
      updatedAt: now - 86400000,
      objects: PROJECT_TEMPLATES[1].buildObjects(),
    },
    {
      id: 'proj-ceramic-set',
      name: 'Lathe Ceramic Studio',
      description: 'Turned stoneware vessels with procedural cobalt glaze.',
      templateId: 'ceramic-vessel-set',
      createdAt: now - 86400000 * 10,
      updatedAt: now - 86400000 * 2,
      objects: PROJECT_TEMPLATES[2].buildObjects(),
    },
  ];
}

export function createInitialFiles(projects: WModelerProject[]): StoredFileItem[] {
  const now = Date.now();
  return projects.map((proj, idx) => {
    const json = JSON.stringify(proj, null, 2);
    return {
      id: `file-${proj.id}`,
      name: `${proj.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.wmod.json`,
      format: 'wmod',
      sizeBytes: new Blob([json]).size,
      createdAt: proj.createdAt,
      updatedAt: now - idx * 3600000,
      triangleCount: proj.objects.length * 420,
      objectCount: proj.objects.length,
      contentText: json,
      projectId: proj.id,
    };
  });
}
