export type PrimitiveType =
  | 'cube'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'capsule'
  | 'plane'
  | 'icosahedron'
  | 'hexprism'
  | 'vase'
  | 'custom_mesh';

export type TransformMode = 'select' | 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'world' | 'local';
export type ShadingMode = 'solid' | 'wireframe' | 'normals';
export type CameraPreset = 'perspective' | 'top' | 'front' | 'side' | 'isometric';

export type PortraitTab = 'dashboard' | 'projects' | 'files' | 'textures' | 'settings';
export type DisplayModeOverride = 'auto' | 'landscape' | 'portrait';
export type ToolbarSide = 'left' | 'right';
export type UndoPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
export type ViewportTheme = 'obsidian' | 'slate' | 'clay';
export type UIDensity = 'auto' | 'compact' | 'standard' | 'large';
export type UVProjectionMode =
  | 'default'
  | 'from-view'
  | 'box'
  | 'planar-top'
  | 'planar-front'
  | 'cylindrical'
  | 'spherical';

export type ViewUVFitMode = 'aspect-bounds' | 'stretch-bounds' | 'screen-frame';

export interface UVMappingConfig {
  projection: UVProjectionMode;
  scaleU: number;
  scaleV: number;
  offsetU: number;
  offsetV: number;
  rotationDeg: number;
  flipU: boolean;
  flipV: boolean;
  viewFitMode?: ViewUVFitMode;
  projectedFromViewUVs?: number[];
}

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface MaterialConfig {
  color: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  opacity: number;
  emissive: string;
  emissiveIntensity: number;
  wireframe: boolean;
  flatShading: boolean;
  textureId: string | null;
}

export interface GeometryModifiers {
  twist: number; // -180 to 180 degrees
  taper: number; // -0.6 to 0.8
  inflate: number; // -0.4 to 0.6
  segments: number; // 8 to 48
}

export interface CustomMeshPayload {
  positions: number[];
  normals?: number[];
  uvs?: number[];
  indices?: number[];
}

export interface SceneObjectData {
  id: string;
  name: string;
  type: PrimitiveType;
  position: Vec3Tuple;
  rotation: Vec3Tuple; // degrees
  scale: Vec3Tuple;
  visible: boolean;
  locked: boolean;
  material: MaterialConfig;
  modifiers: GeometryModifiers;
  uvMapping?: UVMappingConfig;
  customMesh?: CustomMeshPayload;
  requestedTextureName?: string;
}

export interface WModelerProject {
  id: string;
  name: string;
  description: string;
  templateId: string;
  updatedAt: number;
  createdAt: number;
  objects: SceneObjectData[];
  thumbnailDataUrl?: string;
}

export interface StoredFileItem {
  id: string;
  name: string;
  format: 'wmod' | 'glb' | 'obj' | 'stl' | 'dff' | 'txd' | 'png';
  sizeBytes: number;
  createdAt: number;
  updatedAt: number;
  triangleCount: number;
  objectCount: number;
  contentText?: string;
  contentBase64?: string;
  projectId?: string;
}

export interface TextureAsset {
  id: string;
  name: string;
  category: 'Metal' | 'Composite' | 'Stone' | 'Wood' | 'Utility' | 'Custom';
  isBuiltIn: boolean;
  resolution: string;
  dataUrl: string;
  roughnessHint: number;
  metalnessHint: number;
  createdAt: number;
}

export interface AppSettings {
  displayOverride: DisplayModeOverride;
  toolbarSide: ToolbarSide;
  undoPosition: UndoPosition;
  propertiesPanelWidth: number;
  gizmoSize: number; // 0.9 to 1.6 for touchscreen ergonomics
  gridVisible: boolean;
  gridSize: number;
  snapEnabled: boolean;
  snapIncrement: number;
  touchGuardDefault: boolean;
  touchDeadzonePx: number;
  viewportTheme: ViewportTheme;
  autoSaveIntervalSec: number;
  hapticsEnabled: boolean;
  uiDensity: UIDensity;
}

export interface SceneStats {
  objectCount: number;
  triangleCount: number;
  vertexCount: number;
}
