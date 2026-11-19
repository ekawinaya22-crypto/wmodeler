import React, { useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Box,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Cylinder,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Globe,
  Grid3x3,
  Hexagon,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  MousePointer2,
  Move,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scan,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Triangle,
  Undo2,
  Unlock,
  Upload,
  Video,
} from 'lucide-react';
import { exportProjectToDFF, exportTexturesToTXD } from '../engine/rwFormat';
import { DEFAULT_UV_MAPPING } from '../engine/sceneTemplates';
import { ViewportCanvas, ViewportHandle } from '../engine/ViewportCanvas';
import { UVPreviewCanvas } from './UVPreviewCanvas';
import {
  AppSettings,
  CameraPreset,
  PrimitiveType,
  SceneObjectData,
  SceneStats,
  ShadingMode,
  TextureAsset,
  TransformMode,
  TransformSpace,
  UVMappingConfig,
  UVProjectionMode,
  Vec3Tuple,
  ViewUVFitMode,
  WModelerProject,
} from '../types/modeler';

interface LandscapeWorkspaceProps {
  project: WModelerProject;
  selectedId: string | null;
  onSelectObject: (id: string | null) => void;
  onAddPrimitive: (type: PrimitiveType) => void;
  onUpdateObject: (
    id: string,
    updater: (obj: SceneObjectData) => SceneObjectData,
    commitHistory?: boolean,
  ) => void;
  onTransformLive: (id: string, pos: Vec3Tuple, rot: Vec3Tuple, scale: Vec3Tuple) => void;
  onTransformCommit: (id: string, pos: Vec3Tuple, rot: Vec3Tuple, scale: Vec3Tuple) => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onMirrorSelected: () => void;
  onSnapToFloor: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  textures: TextureAsset[];
  onSaveProject: () => void;
  onImportFile: (file: File) => void;
  onExportRecord: (
    format: 'glb' | 'obj' | 'stl' | 'dff' | 'txd' | 'wmod' | 'png',
    blob: Blob,
    filename: string,
    stats: SceneStats,
  ) => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  onResetScene: () => void;
  statusMessage: string | null;
}

type InspectorTab = 'scene' | 'transform' | 'material' | 'uv' | 'modify';

const COLOR_SWATCHES = [
  '#e2e8f0',
  '#94a3b8',
  '#334155',
  '#1e293b',
  '#3b82f6',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#d4a34a',
  '#7c5338',
  '#a855f7',
];

const PRIMITIVE_ACTIONS: Array<{ type: PrimitiveType; label: string; icon: React.ReactNode }> = [
  { type: 'cube', label: 'Cube', icon: <Box className="w-4 h-4" /> },
  { type: 'sphere', label: 'Sphere', icon: <Circle className="w-4 h-4" /> },
  { type: 'cylinder', label: 'Cylinder', icon: <Cylinder className="w-4 h-4" /> },
  { type: 'cone', label: 'Cone', icon: <Triangle className="w-4 h-4" /> },
  { type: 'torus', label: 'Torus', icon: <RotateCw className="w-4 h-4" /> },
  { type: 'hexprism', label: 'Hex', icon: <Hexagon className="w-4 h-4" /> },
  { type: 'vase', label: 'Lathe', icon: <Layers className="w-4 h-4" /> },
  { type: 'capsule', label: 'Capsule', icon: <Plus className="w-4 h-4" /> },
  { type: 'icosahedron', label: 'Ico', icon: <Sparkles className="w-4 h-4" /> },
  { type: 'plane', label: 'Plane', icon: <Grid3x3 className="w-4 h-4" /> },
];

export const LandscapeWorkspace: React.FC<LandscapeWorkspaceProps> = ({
  project,
  selectedId,
  onSelectObject,
  onAddPrimitive,
  onUpdateObject,
  onTransformLive,
  onTransformCommit,
  onDuplicateSelected,
  onDeleteSelected,
  onMirrorSelected,
  onSnapToFloor,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  settings,
  onUpdateSettings,
  textures,
  onSaveProject,
  onImportFile,
  onExportRecord,
  onOpenDashboard,
  onOpenSettings,
  onResetScene,
  statusMessage,
}) => {
  const viewportRef = useRef<ViewportHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [transformSpace, setTransformSpace] = useState<TransformSpace>('world');
  const [shadingMode, setShadingMode] = useState<ShadingMode>('solid');
  const [touchGuard, setTouchGuard] = useState<boolean>(settings.touchGuardDefault);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('transform');
  const [panelOpen, setPanelOpen] = useState<boolean>(() => window.innerWidth >= 720);
  const [bottomOpen, setBottomOpen] = useState<boolean>(true);
  const [zenMode, setZenMode] = useState<boolean>(false);
  const [fileMenuOpen, setFileMenuOpen] = useState<boolean>(false);
  const [cameraMenuOpen, setCameraMenuOpen] = useState<boolean>(false);
  const [stats, setStats] = useState<SceneStats>({
    objectCount: project.objects.length,
    triangleCount: 0,
    vertexCount: 0,
  });

  const [viewportDims, setViewportDims] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 800,
    h: typeof window !== 'undefined' ? window.innerHeight : 400,
  }));

  React.useEffect(() => {
    const onResize = () => {
      setViewportDims({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const selectedObj = project.objects.find((o) => o.id === selectedId) || null;
  const toolbarOnRight = settings.toolbarSide === 'right';
  const panelSideClass = toolbarOnRight ? 'left-0 border-r' : 'right-0 border-l';

  const effectivePanelWidth =
    viewportDims.w < 768
      ? Math.min(settings.propertiesPanelWidth, Math.max(204, Math.floor(viewportDims.w * 0.44)))
      : settings.propertiesPanelWidth;
  const compactToolbar =
    settings.uiDensity === 'compact' ||
    (settings.uiDensity === 'auto' && viewportDims.h <= 440);
  const largeToolbar =
    settings.uiDensity === 'large' ||
    (settings.uiDensity === 'auto' && viewportDims.w >= 1024 && viewportDims.h >= 640);
  const toolBtnSizeClass = compactToolbar
    ? 'min-w-[40px] min-h-[38px]'
    : largeToolbar
      ? 'min-w-[50px] min-h-[50px]'
      : 'min-w-[44px] min-h-[44px]';
  const dockBtnSizeClass = compactToolbar
    ? 'min-w-[46px] min-h-[40px] px-2'
    : largeToolbar
      ? 'min-w-[58px] min-h-[50px] px-3'
      : 'min-w-[52px] min-h-[44px] px-2.5';

  // Panel horizontal resize drag (touch + mouse)
  const handlePanelResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = effectivePanelWidth;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const nextWidth = toolbarOnRight ? startWidth + dx : startWidth - dx;
      onUpdateSettings({
        propertiesPanelWidth: Math.max(210, Math.min(440, Math.round(nextWidth))),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleExport = async (
    format: 'glb' | 'obj' | 'stl' | 'dff' | 'txd' | 'wmod' | 'png',
  ) => {
    setFileMenuOpen(false);
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'wmodeler_scene';
    if (format === 'wmod') {
      const json = JSON.stringify(project, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      onExportRecord('wmod', blob, `${slug}.wmod.json`, stats);
      return;
    }
    if (format === 'dff') {
      const dffBytes = exportProjectToDFF(project.objects, textures);
      onExportRecord(
        'dff',
        new Blob([dffBytes.slice().buffer], { type: 'application/octet-stream' }),
        `${slug}.dff`,
        stats,
      );
      return;
    }
    if (format === 'txd') {
      const usedTexIds = new Set(
        project.objects.map((o) => o.material.textureId).filter((id): id is string => Boolean(id)),
      );
      const packTextures =
        usedTexIds.size > 0
          ? textures.filter((t) => usedTexIds.has(t.id))
          : textures.slice(0, 8);
      const txdBytes = await exportTexturesToTXD(packTextures);
      onExportRecord(
        'txd',
        new Blob([txdBytes.slice().buffer], { type: 'application/octet-stream' }),
        `${slug}.txd`,
        stats,
      );
      return;
    }
    if (!viewportRef.current) return;
    if (format === 'glb') {
      const blob = await viewportRef.current.exportGLB();
      onExportRecord('glb', blob, `${slug}.glb`, stats);
    } else if (format === 'obj') {
      const text = viewportRef.current.exportOBJ();
      onExportRecord('obj', new Blob([text], { type: 'text/plain' }), `${slug}.obj`, stats);
    } else if (format === 'stl') {
      const buf = viewportRef.current.exportSTL();
      onExportRecord(
        'stl',
        new Blob([buf], { type: 'application/octet-stream' }),
        `${slug}.stl`,
        stats,
      );
    } else if (format === 'png') {
      const dataUrl = viewportRef.current.capturePNG();
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      onExportRecord('png', blob, `${slug}_render.png`, stats);
    }
  };

  const adjustAxisValue = (
    group: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    delta: number,
  ) => {
    if (!selectedObj || selectedObj.locked) return;
    onUpdateObject(
      selectedObj.id,
      (obj) => {
        const nextVal = Math.round((obj[group][axis] + delta) * 1000) / 1000;
        const clamped = group === 'scale' ? Math.max(0.05, nextVal) : nextVal;
        return {
          ...obj,
          [group]: { ...obj[group], [axis]: clamped },
        };
      },
      true,
    );
  };

  const handleSelectUVFromView = (fitModeOverride?: ViewUVFitMode, openUVPanel = false) => {
    if (!selectedObj || !viewportRef.current) return;
    const fitMode =
      fitModeOverride || selectedObj.uvMapping?.viewFitMode || 'aspect-bounds';
    const projected = viewportRef.current.projectUVFromView(selectedObj.id, fitMode);
    if (!projected) return;
    onUpdateObject(
      selectedObj.id,
      (o) => ({
        ...o,
        uvMapping: {
          ...DEFAULT_UV_MAPPING,
          projection: 'from-view',
          viewFitMode: fitMode,
          projectedFromViewUVs: projected,
        },
      }),
      true,
    );
    if (openUVPanel) {
      setPanelOpen(true);
      setInspectorTab('uv');
    }
  };

  const setAxisValue = (
    group: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    val: number,
  ) => {
    if (!selectedObj || selectedObj.locked || Number.isNaN(val)) return;
    onUpdateObject(
      selectedObj.id,
      (obj) => ({
        ...obj,
        [group]: {
          ...obj[group],
          [axis]: group === 'scale' ? Math.max(0.05, val) : val,
        },
      }),
      true,
    );
  };

  // Compute safe floating position for Undo / Redo buttons so they don't overlap toolbars
  const undoPosStyle = (): React.CSSProperties => {
    const toolbarOffset = compactToolbar ? 60 : largeToolbar ? 76 : 68;
    const padX = toolbarOnRight ? 12 : toolbarOffset;
    const rightPadX = toolbarOnRight ? toolbarOffset : 12;
    const panelOffset = panelOpen ? effectivePanelWidth + 12 : 12;
    const bottomPad = bottomOpen ? (compactToolbar ? 68 : 76) : 18;

    switch (settings.undoPosition) {
      case 'bottom-right':
        return {
          bottom: `calc(${bottomPad}px + var(--safe-bottom))`,
          right: toolbarOnRight ? `calc(${rightPadX}px + var(--safe-right))` : panelOffset,
        };
      case 'top-left':
        return {
          top: 'calc(58px + var(--safe-top))',
          left: toolbarOnRight ? panelOffset : `calc(${padX}px + var(--safe-left))`,
        };
      case 'top-right':
        return {
          top: 'calc(58px + var(--safe-top))',
          right: toolbarOnRight ? `calc(${rightPadX}px + var(--safe-right))` : panelOffset,
        };
      case 'bottom-left':
      default:
        return {
          bottom: `calc(${bottomPad}px + var(--safe-bottom))`,
          left: toolbarOnRight ? panelOffset : `calc(${padX}px + var(--safe-left))`,
        };
    }
  };

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-[#121418] text-slate-100 select-none">
      {/* Full-screen Interactive 3D Viewport */}
      <div className="absolute inset-0">
        <ViewportCanvas
          ref={viewportRef}
          objects={project.objects}
          selectedId={selectedId}
          onSelectObject={onSelectObject}
          onTransformLive={onTransformLive}
          onTransformCommit={onTransformCommit}
          transformMode={transformMode}
          transformSpace={transformSpace}
          shadingMode={shadingMode}
          touchGuard={touchGuard}
          settings={settings}
          textures={textures}
          onStatsChange={setStats}
        />
      </div>

      {/* Hidden File Importer */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".dff,.txd,.glb,.gltf,.obj,.stl,.json,.wmod.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f);
          e.target.value = '';
        }}
      />

      {/* Zen Mode Restore Button */}
      {zenMode && (
        <button
          onClick={() => setZenMode(false)}
          className="fixed top-3 right-3 z-40 min-h-[44px] min-w-[44px] px-3 rounded-lg bg-[#181B22]/95 border border-white/15 text-xs font-medium text-slate-100 flex items-center gap-2 shadow-lg whitespace-nowrap"
        >
          <Eye className="w-4 h-4 text-blue-400" />
          Show Workspace
        </button>
      )}

      {!zenMode && (
        <>
          {(fileMenuOpen || cameraMenuOpen) && (
            <div
              className="fixed inset-0 z-25"
              onClick={() => {
                setFileMenuOpen(false);
                setCameraMenuOpen(false);
              }}
            />
          )}

          {/* TOP MENU BAR */}
          <header
            className="fixed top-0 left-0 right-0 z-30 bg-[#181B22]/95 border-b border-white/10 px-3 flex items-center justify-between gap-2"
            style={{
              height: 'calc(48px + var(--safe-top))',
              paddingTop: 'var(--safe-top)',
              paddingLeft: 'max(12px, var(--safe-left))',
              paddingRight: 'max(12px, var(--safe-right))',
            }}
          >
            {/* Brand & Active Project */}
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap shrink-0">
                WMODELER
              </span>
              <span className="hidden sm:inline text-slate-600" aria-hidden="true">
                /
              </span>
              <span className="text-xs font-medium text-slate-300 truncate max-w-[140px] md:max-w-[220px]">
                {project.name}
              </span>
              <span className="hidden lg:inline text-xs font-mono text-slate-400 tabular-nums whitespace-nowrap">
                {stats.objectCount} objs · {stats.triangleCount.toLocaleString()} tris
              </span>
            </div>

            {/* Menu Controls */}
            <div className="flex items-center gap-1.5 overflow-x-auto wmod-scroll">
              {/* File Menu */}
              <div className="relative">
                <button
                  onClick={() => {
                    setFileMenuOpen((v) => !v);
                    setCameraMenuOpen(false);
                  }}
                  className="min-h-[40px] px-3 rounded-lg bg-[#232732] hover:bg-[#2c3140] text-xs font-medium text-slate-100 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                  File
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {fileMenuOpen && (
                  <div className="fixed top-13 right-4 sm:right-auto z-50 w-56 max-h-[80dvh] overflow-y-auto wmod-scroll rounded-xl bg-[#1C2029] border border-white/12 shadow-2xl py-1.5 text-xs">
                    <button
                      onClick={() => {
                        setFileMenuOpen(false);
                        onSaveProject();
                      }}
                      className="w-full min-h-[42px] px-3.5 flex items-center gap-2.5 text-left text-slate-200 hover:bg-white/5"
                    >
                      <Save className="w-4 h-4 text-blue-400" /> Save Project
                    </button>
                    <button
                      onClick={() => {
                        setFileMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="w-full min-h-[42px] px-3.5 flex items-center gap-2.5 text-left text-slate-200 hover:bg-white/5"
                    >
                      <Upload className="w-4 h-4 text-emerald-400" /> Import DFF / TXD / GLB / OBJ
                    </button>
                    <div className="my-1 border-t border-white/10" />
                    <button
                      onClick={() => handleExport('dff')}
                      className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 text-left text-blue-300 hover:bg-white/5"
                    >
                      <Download className="w-4 h-4 text-blue-400" /> Export DFF (.dff)
                    </button>
                    <button
                      onClick={() => handleExport('txd')}
                      className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 text-left text-blue-300 hover:bg-white/5"
                    >
                      <Download className="w-4 h-4 text-blue-400" /> Export TXD (PNG Pack)
                    </button>
                    <button
                      onClick={() => handleExport('glb')}
                      className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 text-left text-slate-200 hover:bg-white/5"
                    >
                      <Download className="w-4 h-4 text-slate-400" /> Export GLB (Binary)
                    </button>
                    <button
                      onClick={() => handleExport('obj')}
                      className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 text-left text-slate-200 hover:bg-white/5"
                    >
                      <Download className="w-4 h-4 text-slate-400" /> Export OBJ Mesh
                    </button>
                    <button
                      onClick={() => handleExport('stl')}
                      className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 text-left text-slate-200 hover:bg-white/5"
                    >
                      <Download className="w-4 h-4 text-slate-400" /> Export STL (3D Print)
                    </button>
                    <button
                      onClick={() => handleExport('wmod')}
                      className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 text-left text-slate-200 hover:bg-white/5"
                    >
                      <Download className="w-4 h-4 text-slate-400" /> Export Project JSON
                    </button>
                    <button
                      onClick={() => handleExport('png')}
                      className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 text-left text-slate-200 hover:bg-white/5"
                    >
                      <Download className="w-4 h-4 text-slate-400" /> Save PNG Render
                    </button>
                    <div className="my-1 border-t border-white/10" />
                    <button
                      onClick={() => {
                        setFileMenuOpen(false);
                        onResetScene();
                      }}
                      className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 text-left text-amber-300 hover:bg-white/5"
                    >
                      <RotateCcw className="w-4 h-4" /> Reset Scene
                    </button>
                  </div>
                )}
              </div>

              {/* Camera View Menu */}
              <div className="relative">
                <button
                  onClick={() => {
                    setCameraMenuOpen((v) => !v);
                    setFileMenuOpen(false);
                  }}
                  className="min-h-[40px] px-3 rounded-lg bg-[#232732] hover:bg-[#2c3140] text-xs font-medium text-slate-100 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Video className="w-3.5 h-3.5 text-blue-400" />
                  View
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {cameraMenuOpen && (
                  <div className="fixed top-13 right-4 sm:right-24 z-50 w-44 rounded-xl bg-[#1C2029] border border-white/12 shadow-2xl py-1.5 text-xs">
                    {(['perspective', 'top', 'front', 'side', 'isometric'] as CameraPreset[]).map(
                      (preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            setCameraMenuOpen(false);
                            viewportRef.current?.setCameraPreset(preset);
                          }}
                          className="w-full min-h-[40px] px-3.5 text-left capitalize text-slate-200 hover:bg-white/5"
                        >
                          {preset} View
                        </button>
                      ),
                    )}
                    <div className="my-1 border-t border-white/10" />
                    <button
                      onClick={() => {
                        setCameraMenuOpen(false);
                        viewportRef.current?.focusSelected();
                      }}
                      className="w-full min-h-[40px] px-3.5 text-left text-blue-300 hover:bg-white/5"
                    >
                      Focus Selected
                    </button>
                    <div className="my-1 border-t border-white/10 md:hidden" />
                    <div className="px-3.5 py-1 text-[10px] uppercase tracking-wider text-slate-500 md:hidden">
                      Shading
                    </div>
                    {(['solid', 'wireframe', 'normals'] as ShadingMode[]).map((mode) => (
                      <button
                        key={`menu-shade-${mode}`}
                        onClick={() => {
                          setShadingMode(mode);
                          setCameraMenuOpen(false);
                        }}
                        className={`w-full min-h-[38px] px-3.5 text-left capitalize md:hidden ${
                          shadingMode === mode
                            ? 'text-blue-300 font-semibold bg-blue-600/15'
                            : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        {mode} Shading
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Shading Mode Segmented Toggle */}
              <div className="hidden md:flex items-center bg-[#121418] p-0.5 rounded-lg border border-white/10 shrink-0">
                {(['solid', 'wireframe', 'normals'] as ShadingMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setShadingMode(mode)}
                    className={`min-h-[34px] px-2.5 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                      shadingMode === mode
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {/* Grid Toggle */}
              <button
                onClick={() => onUpdateSettings({ gridVisible: !settings.gridVisible })}
                title="Toggle Studio Grid"
                className={`min-h-[40px] min-w-[40px] px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  settings.gridVisible
                    ? 'bg-[#232732] border-blue-500/40 text-blue-300'
                    : 'bg-[#121418] border-white/10 text-slate-400'
                }`}
              >
                <Grid3x3 className="w-4 h-4" />
                <span className="hidden sm:inline">Grid</span>
              </button>

              {/* Save Quick Button */}
              <button
                onClick={onSaveProject}
                title="Save Project"
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-lg bg-[#232732] hover:bg-[#2c3140] text-xs font-medium text-slate-100 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Save className="w-4 h-4 text-emerald-400" />
                <span className="hidden lg:inline">Save</span>
              </button>

              {/* Open Dashboard / Project Manager */}
              <button
                onClick={onOpenDashboard}
                className="min-h-[40px] px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                Manager
              </button>

              {/* Properties Panel Toggle */}
              <button
                onClick={() => setPanelOpen((v) => !v)}
                aria-label="Toggle Properties Panel"
                className="min-h-[40px] min-w-[40px] rounded-lg bg-[#232732] hover:bg-[#2c3140] text-slate-200 flex items-center justify-center shrink-0"
              >
                {panelOpen ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </button>
            </div>
          </header>

          {/* Status Toast Banner */}
          {statusMessage && (
            <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-[#1C2029] border border-blue-500/40 text-xs font-medium text-slate-100 shadow-lg whitespace-nowrap">
              {statusMessage}
            </div>
          )}

          {/* LEFT (OR SWAPPABLE RIGHT) VERTICAL TOOLBAR */}
          <aside
            style={{
              top: 'calc(54px + var(--safe-top))',
              left: toolbarOnRight ? undefined : 'max(8px, var(--safe-left))',
              right: toolbarOnRight ? 'max(8px, var(--safe-right))' : undefined,
              maxHeight: 'calc(100dvh - 120px - var(--safe-top) - var(--safe-bottom))',
            }}
            className={`fixed z-20 flex flex-col gap-1 p-1 rounded-xl bg-[#181B22]/95 border border-white/10 shadow-xl overflow-y-auto wmod-scroll`}
          >
            {(
              [
                { id: 'select', label: 'Select', icon: <MousePointer2 className="w-5 h-5" /> },
                { id: 'translate', label: 'Move', icon: <Move className="w-5 h-5" /> },
                { id: 'rotate', label: 'Rotate', icon: <RotateCw className="w-5 h-5" /> },
                { id: 'scale', label: 'Scale', icon: <Maximize2 className="w-5 h-5" /> },
              ] as Array<{ id: TransformMode; label: string; icon: React.ReactNode }>
            ).map((tool) => (
              <button
                key={tool.id}
                onClick={() => setTransformMode(tool.id)}
                title={tool.label}
                aria-label={tool.label}
                className={`${toolBtnSizeClass} rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  transformMode === tool.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                {tool.icon}
                <span className="text-[9px] font-medium leading-none">{tool.label}</span>
              </button>
            ))}

            <div className="my-0.5 border-t border-white/10" />

            <button
              onClick={() => setTransformSpace((s) => (s === 'world' ? 'local' : 'world'))}
              title={`Space: ${transformSpace}`}
              className={`${toolBtnSizeClass} rounded-lg text-slate-300 hover:bg-white/10 flex flex-col items-center justify-center gap-0.5`}
            >
              {transformSpace === 'world' ? (
                <Globe className="w-4 h-4 text-blue-400" />
              ) : (
                <Box className="w-4 h-4 text-amber-400" />
              )}
              <span className="text-[9px] font-medium leading-none capitalize">
                {transformSpace}
              </span>
            </button>

            <button
              onClick={() => onUpdateSettings({ snapEnabled: !settings.snapEnabled })}
              title="Grid Snap"
              className={`${toolBtnSizeClass} rounded-lg flex flex-col items-center justify-center gap-0.5 ${
                settings.snapEnabled
                  ? 'bg-blue-600/25 text-blue-300 border border-blue-500/40'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Magnet className="w-4 h-4" />
              <span className="text-[9px] font-medium leading-none">Snap</span>
            </button>

            <button
              onClick={() => setTouchGuard((g) => !g)}
              title="Accidental Touch Guard"
              className={`${toolBtnSizeClass} rounded-lg flex flex-col items-center justify-center gap-0.5 ${
                touchGuard
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {touchGuard ? (
                <ShieldAlert className="w-4 h-4" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              <span className="text-[9px] font-medium leading-none">Guard</span>
            </button>

            <button
              onClick={() =>
                onUpdateSettings({
                  toolbarSide: settings.toolbarSide === 'left' ? 'right' : 'left',
                })
              }
              title="Swap Toolbar Side"
              className={`${toolBtnSizeClass} rounded-lg text-slate-300 hover:bg-white/10 flex flex-col items-center justify-center gap-0.5`}
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span className="text-[9px] font-medium leading-none">Swap</span>
            </button>

            <button
              onClick={() => setZenMode(true)}
              title="Hide Panels for Full Viewport"
              className={`${toolBtnSizeClass} rounded-lg text-slate-300 hover:bg-white/10 flex flex-col items-center justify-center gap-0.5`}
            >
              <EyeOff className="w-4 h-4" />
              <span className="text-[9px] font-medium leading-none">Zen</span>
            </button>
          </aside>

          {/* RIGHT (OR SWAPPABLE LEFT) RESIZABLE OBJECT PROPERTIES PANEL */}
          {panelOpen && (
            <aside
              style={{
                top: 'calc(48px + var(--safe-top))',
                width: effectivePanelWidth,
                paddingRight: toolbarOnRight ? undefined : 'var(--safe-right)',
                paddingLeft: toolbarOnRight ? 'var(--safe-left)' : undefined,
                paddingBottom: 'var(--safe-bottom)',
              }}
              className={`fixed bottom-0 ${panelSideClass} z-20 bg-[#181B22]/95 border-white/10 flex flex-col shadow-2xl`}
            >
              {/* Touch/Mouse Resize Handle */}
              <div
                onPointerDown={handlePanelResizeStart}
                title="Drag to resize panel"
                className={`absolute top-0 bottom-0 ${
                  toolbarOnRight ? '-right-2.5' : '-left-2.5'
                } w-5 cursor-ew-resize flex items-center justify-center z-30 touch-none`}
              >
                <div className="w-1 h-12 rounded-full bg-white/20 hover:bg-blue-400 transition-colors" />
              </div>

              {/* Panel Tabs */}
              <div className="grid grid-cols-5 gap-1 p-1.5 border-b border-white/10 bg-[#14171D]">
                {(
                  [
                    { id: 'scene', label: 'Scene' },
                    { id: 'transform', label: 'Xform' },
                    { id: 'material', label: 'Mat' },
                    { id: 'uv', label: 'UV' },
                    { id: 'modify', label: 'Mesh' },
                  ] as Array<{ id: InspectorTab; label: string }>
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setInspectorTab(t.id)}
                    className={`min-h-[40px] rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      inspectorTab === t.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto p-3 space-y-4 wmod-scroll text-xs">
                {inspectorTab === 'scene' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="font-medium text-slate-200">Scene Hierarchy</span>
                      <span className="font-mono tabular-nums">{project.objects.length} items</span>
                    </div>
                    <div className="space-y-1">
                      {project.objects.map((obj) => {
                        const isSel = obj.id === selectedId;
                        return (
                          <div
                            key={obj.id}
                            onClick={() => onSelectObject(obj.id)}
                            className={`min-h-[44px] px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              isSel
                                ? 'bg-blue-600/20 border-blue-500/50 text-white'
                                : 'bg-[#20242D] border-white/5 text-slate-300 hover:bg-[#262B36]'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{obj.name}</div>
                              <div className="text-[11px] text-slate-400 capitalize">
                                {obj.type}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateObject(obj.id, (o) => ({ ...o, visible: !o.visible }));
                                }}
                                aria-label="Toggle visibility"
                                className="min-w-[36px] min-h-[36px] rounded-md hover:bg-white/10 flex items-center justify-center text-slate-300"
                              >
                                {obj.visible ? (
                                  <Eye className="w-4 h-4" />
                                ) : (
                                  <EyeOff className="w-4 h-4 text-slate-500" />
                                )}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateObject(obj.id, (o) => ({ ...o, locked: !o.locked }));
                                }}
                                aria-label="Toggle lock"
                                className="min-w-[36px] min-h-[36px] rounded-md hover:bg-white/10 flex items-center justify-center text-slate-300"
                              >
                                {obj.locked ? (
                                  <Lock className="w-4 h-4 text-amber-400" />
                                ) : (
                                  <Unlock className="w-4 h-4 text-slate-500" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {inspectorTab !== 'scene' && !selectedObj && (
                  <div className="rounded-xl border border-white/10 bg-[#20242D] p-5 text-center space-y-2">
                    <SlidersHorizontal className="w-6 h-6 text-slate-400 mx-auto" />
                    <p className="text-sm font-medium text-slate-200">No Object Selected</p>
                    <p className="text-xs text-slate-400">
                      Tap any 3D mesh in the viewport or pick an item from the Scene tab.
                    </p>
                  </div>
                )}

                {inspectorTab === 'transform' && selectedObj && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Object Name</label>
                      <input
                        type="text"
                        value={selectedObj.name}
                        onChange={(e) =>
                          onUpdateObject(selectedObj.id, (o) => ({ ...o, name: e.target.value }))
                        }
                        className="w-full h-10 px-3 rounded-lg bg-[#121418] border border-white/10 text-slate-100 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {selectedObj.locked && (
                      <div className="px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 flex items-center justify-between">
                        <span>Object locked against accidental touch</span>
                        <button
                          onClick={() =>
                            onUpdateObject(selectedObj.id, (o) => ({ ...o, locked: false }))
                          }
                          className="underline font-semibold ml-2"
                        >
                          Unlock
                        </button>
                      </div>
                    )}

                    {(
                      [
                        { key: 'position', label: 'Position (m)', step: 0.25 },
                        { key: 'rotation', label: 'Rotation (deg)', step: 15 },
                        { key: 'scale', label: 'Scale', step: 0.1 },
                      ] as const
                    ).map((section) => (
                      <div key={section.key} className="space-y-2">
                        <div className="font-medium text-slate-200">{section.label}</div>
                        {(['x', 'y', 'z'] as const).map((axis) => {
                          const axisColor =
                            axis === 'x'
                              ? 'text-rose-400'
                              : axis === 'y'
                                ? 'text-emerald-400'
                                : 'text-sky-400';
                          return (
                            <div key={axis} className="flex items-center gap-1.5">
                              <span
                                className={`w-5 font-mono font-bold uppercase ${axisColor}`}
                              >
                                {axis}
                              </span>
                              <button
                                disabled={selectedObj.locked}
                                onClick={() => adjustAxisValue(section.key, axis, -section.step)}
                                className="min-w-[40px] min-h-[40px] rounded-lg bg-[#232732] hover:bg-[#2e3342] disabled:opacity-40 font-mono text-sm font-semibold"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                step={section.step}
                                disabled={selectedObj.locked}
                                value={selectedObj[section.key][axis]}
                                onChange={(e) =>
                                  setAxisValue(section.key, axis, parseFloat(e.target.value))
                                }
                                className="flex-1 min-w-0 h-10 px-2 rounded-lg bg-[#121418] border border-white/10 font-mono tabular-nums text-center text-slate-100 disabled:opacity-50"
                              />
                              <button
                                disabled={selectedObj.locked}
                                onClick={() => adjustAxisValue(section.key, axis, section.step)}
                                className="min-w-[40px] min-h-[40px] rounded-lg bg-[#232732] hover:bg-[#2e3342] disabled:opacity-40 font-mono text-sm font-semibold"
                              >
                                +
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={onSnapToFloor}
                        disabled={selectedObj.locked}
                        className="min-h-[44px] px-3 rounded-lg bg-[#232732] hover:bg-[#2c3140] disabled:opacity-40 font-medium text-slate-200"
                      >
                        Drop to Floor
                      </button>
                      <button
                        onClick={() =>
                          onUpdateObject(
                            selectedObj.id,
                            (o) => ({
                              ...o,
                              position: { x: 0, y: 0.65, z: 0 },
                              rotation: { x: 0, y: 0, z: 0 },
                              scale: { x: 1, y: 1, z: 1 },
                            }),
                            true,
                          )
                        }
                        disabled={selectedObj.locked}
                        className="min-h-[44px] px-3 rounded-lg bg-[#232732] hover:bg-[#2c3140] disabled:opacity-40 font-medium text-slate-200"
                      >
                        Reset Xform
                      </button>
                    </div>
                  </div>
                )}

                {inspectorTab === 'material' && selectedObj && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-slate-200">Base Albedo</span>
                        <input
                          type="color"
                          value={selectedObj.material.color}
                          onChange={(e) =>
                            onUpdateObject(
                              selectedObj.id,
                              (o) => ({
                                ...o,
                                material: { ...o.material, color: e.target.value },
                              }),
                              true,
                            )
                          }
                          className="w-10 h-8 rounded bg-transparent border border-white/15 cursor-pointer"
                        />
                      </div>
                      <div className="grid grid-cols-6 gap-1.5">
                        {COLOR_SWATCHES.map((hex) => (
                          <button
                            key={hex}
                            onClick={() =>
                              onUpdateObject(
                                selectedObj.id,
                                (o) => ({
                                  ...o,
                                  material: { ...o.material, color: hex },
                                }),
                                true,
                              )
                            }
                            style={{ backgroundColor: hex }}
                            className={`h-8 rounded-md border ${
                              selectedObj.material.color.toLowerCase() === hex
                                ? 'border-white ring-2 ring-blue-500'
                                : 'border-white/15'
                            }`}
                            aria-label={`Set color ${hex}`}
                          />
                        ))}
                      </div>
                    </div>

                    {(
                      [
                        { key: 'metalness', label: 'Metalness', min: 0, max: 1, step: 0.02 },
                        { key: 'roughness', label: 'Roughness', min: 0.04, max: 1, step: 0.02 },
                        { key: 'clearcoat', label: 'Clearcoat', min: 0, max: 1, step: 0.05 },
                        { key: 'opacity', label: 'Opacity', min: 0.1, max: 1, step: 0.05 },
                      ] as const
                    ).map((slider) => (
                      <div key={slider.key} className="space-y-1">
                        <div className="flex justify-between text-slate-300">
                          <span>{slider.label}</span>
                          <span className="font-mono tabular-nums text-slate-400">
                            {selectedObj.material[slider.key].toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={slider.min}
                          max={slider.max}
                          step={slider.step}
                          value={selectedObj.material[slider.key]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdateObject(selectedObj.id, (o) => ({
                              ...o,
                              material: { ...o.material, [slider.key]: val },
                            }));
                          }}
                          className="w-full h-7 accent-blue-500 cursor-pointer"
                        />
                      </div>
                    ))}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() =>
                          onUpdateObject(
                            selectedObj.id,
                            (o) => ({
                              ...o,
                              material: { ...o.material, wireframe: !o.material.wireframe },
                            }),
                            true,
                          )
                        }
                        className={`min-h-[44px] rounded-lg border font-medium ${
                          selectedObj.material.wireframe
                            ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                            : 'bg-[#232732] border-white/10 text-slate-300'
                        }`}
                      >
                        Wireframe
                      </button>
                      <button
                        onClick={() =>
                          onUpdateObject(
                            selectedObj.id,
                            (o) => ({
                              ...o,
                              material: { ...o.material, flatShading: !o.material.flatShading },
                            }),
                            true,
                          )
                        }
                        className={`min-h-[44px] rounded-lg border font-medium ${
                          selectedObj.material.flatShading
                            ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                            : 'bg-[#232732] border-white/10 text-slate-300'
                        }`}
                      >
                        Flat Shaded
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-200">Texture Map</span>
                        {selectedObj.material.textureId && (
                          <button
                            onClick={() =>
                              onUpdateObject(
                                selectedObj.id,
                                (o) => ({
                                  ...o,
                                  material: { ...o.material, textureId: null },
                                }),
                                true,
                              )
                            }
                            className="text-blue-400 hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {textures.map((tex) => {
                          const active = selectedObj.material.textureId === tex.id;
                          return (
                            <button
                              key={tex.id}
                              onClick={() =>
                                onUpdateObject(
                                  selectedObj.id,
                                  (o) => ({
                                    ...o,
                                    material: {
                                      ...o.material,
                                      textureId: active ? null : tex.id,
                                      roughness: tex.roughnessHint,
                                      metalness: tex.metalnessHint,
                                    },
                                  }),
                                  true,
                                )
                              }
                              className={`p-1 rounded-lg border text-left transition-colors ${
                                active
                                  ? 'border-blue-500 bg-blue-600/20'
                                  : 'border-white/10 bg-[#20242D] hover:bg-[#282D38]'
                              }`}
                            >
                              <img
                                src={tex.dataUrl}
                                alt={tex.name}
                                className="w-full h-11 object-cover rounded"
                              />
                              <div className="mt-1 text-[10px] truncate text-slate-200">
                                {tex.name}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {inspectorTab === 'uv' && selectedObj && (() => {
                  const uv: UVMappingConfig = selectedObj.uvMapping || DEFAULT_UV_MAPPING;
                  const activeTex = selectedObj.material.textureId
                    ? textures.find((t) => t.id === selectedObj.material.textureId) || null
                    : null;
                  const updateUV = (patch: Partial<UVMappingConfig>, commit = false) => {
                    onUpdateObject(
                      selectedObj.id,
                      (o) => ({
                        ...o,
                        uvMapping: { ...(o.uvMapping || DEFAULT_UV_MAPPING), ...patch },
                      }),
                      commit,
                    );
                  };

                  const currentFitMode: ViewUVFitMode = uv.viewFitMode || 'aspect-bounds';

                  return (
                    <div className="space-y-4">
                      <UVPreviewCanvas object={selectedObj} texture={activeTex} />

                      {/* Blender-style Select UV From View */}
                      <div className="rounded-xl bg-[#20242D] border border-blue-500/35 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-100">
                            Select UV From View
                          </span>
                          <span className="text-[10px] font-mono text-blue-300">
                            Camera Projection
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1">
                          {(
                            [
                              { id: 'aspect-bounds', label: 'Fit Shape' },
                              { id: 'stretch-bounds', label: 'Fill 0–1' },
                              { id: 'screen-frame', label: 'Screen' },
                            ] as Array<{ id: ViewUVFitMode; label: string }>
                          ).map((fit) => (
                            <button
                              key={fit.id}
                              onClick={() => {
                                if (uv.projection === 'from-view') {
                                  handleSelectUVFromView(fit.id);
                                } else {
                                  updateUV({ viewFitMode: fit.id }, false);
                                }
                              }}
                              className={`min-h-[34px] px-1.5 rounded-lg text-[11px] font-medium border ${
                                currentFitMode === fit.id
                                  ? 'bg-blue-600/25 border-blue-500/60 text-blue-200'
                                  : 'bg-[#161920] border-white/10 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {fit.label}
                            </button>
                          ))}
                        </div>

                        <button
                          onClick={() => handleSelectUVFromView(currentFitMode)}
                          className="w-full min-h-[44px] px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                        >
                          <Scan className="w-4 h-4" />
                          Project UV From View
                        </button>
                      </div>

                      <div>
                        <label className="block font-medium text-slate-200 mb-1.5">
                          UV Projection Mode
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'default', label: 'Default' },
                              { id: 'from-view', label: 'From View' },
                              { id: 'box', label: 'Box' },
                              { id: 'planar-top', label: 'Top' },
                              { id: 'planar-front', label: 'Front' },
                              { id: 'cylindrical', label: 'Cylinder' },
                              { id: 'spherical', label: 'Sphere' },
                            ] as Array<{ id: UVProjectionMode; label: string }>
                          ).map((mode) => (
                            <button
                              key={mode.id}
                              onClick={() => {
                                if (mode.id === 'from-view') {
                                  handleSelectUVFromView(currentFitMode);
                                } else {
                                  updateUV({ projection: mode.id }, true);
                                }
                              }}
                              className={`min-h-[40px] px-2 rounded-lg border text-xs font-medium ${
                                uv.projection === mode.id
                                  ? 'bg-blue-600 border-blue-500 text-white'
                                  : 'bg-[#232732] border-white/10 text-slate-300 hover:bg-[#2C3140]'
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(
                        [
                          { key: 'scaleU', label: 'Tile Scale U', min: 0.2, max: 6, step: 0.1 },
                          { key: 'scaleV', label: 'Tile Scale V', min: 0.2, max: 6, step: 0.1 },
                          { key: 'offsetU', label: 'Offset U', min: -1, max: 1, step: 0.05 },
                          { key: 'offsetV', label: 'Offset V', min: -1, max: 1, step: 0.05 },
                          { key: 'rotationDeg', label: 'UV Rotation (°)', min: -180, max: 180, step: 5 },
                        ] as const
                      ).map((ctrl) => (
                        <div key={ctrl.key} className="space-y-1">
                          <div className="flex justify-between text-slate-300">
                            <span>{ctrl.label}</span>
                            <span className="font-mono tabular-nums text-slate-400">
                              {uv[ctrl.key].toFixed(ctrl.key === 'rotationDeg' ? 0 : 2)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={ctrl.min}
                            max={ctrl.max}
                            step={ctrl.step}
                            value={uv[ctrl.key]}
                            onChange={(e) =>
                              updateUV({ [ctrl.key]: parseFloat(e.target.value) }, false)
                            }
                            className="w-full h-7 accent-blue-500"
                          />
                        </div>
                      ))}

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => updateUV({ flipU: !uv.flipU }, true)}
                          className={`min-h-[44px] rounded-lg border font-medium ${
                            uv.flipU
                              ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                              : 'bg-[#232732] border-white/10 text-slate-300'
                          }`}
                        >
                          Flip U
                        </button>
                        <button
                          onClick={() => updateUV({ flipV: !uv.flipV }, true)}
                          className={`min-h-[44px] rounded-lg border font-medium ${
                            uv.flipV
                              ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                              : 'bg-[#232732] border-white/10 text-slate-300'
                          }`}
                        >
                          Flip V (RW)
                        </button>
                      </div>

                      <button
                        onClick={() =>
                          updateUV({ ...DEFAULT_UV_MAPPING, projectedFromViewUVs: undefined }, true)
                        }
                        className="w-full min-h-[44px] rounded-lg bg-[#232732] hover:bg-[#2C3140] font-medium text-slate-200"
                      >
                        Reset UV Mapping
                      </button>
                    </div>
                  );
                })()}

                {inspectorTab === 'modify' && selectedObj && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-slate-300">
                        <span>Mesh Resolution (Segments)</span>
                        <span className="font-mono tabular-nums text-slate-400">
                          {selectedObj.modifiers.segments}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={48}
                        step={2}
                        value={selectedObj.modifiers.segments}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          onUpdateObject(selectedObj.id, (o) => ({
                            ...o,
                            modifiers: { ...o.modifiers, segments: val },
                          }));
                        }}
                        className="w-full h-7 accent-blue-500"
                      />
                    </div>

                    {(
                      [
                        {
                          key: 'twist',
                          label: 'Twist Angle (°)',
                          min: -180,
                          max: 180,
                          step: 5,
                        },
                        { key: 'taper', label: 'Taper Profile', min: -0.6, max: 0.8, step: 0.05 },
                        {
                          key: 'inflate',
                          label: 'Extrude / Inflate',
                          min: -0.35,
                          max: 0.5,
                          step: 0.02,
                        },
                      ] as const
                    ).map((mod) => (
                      <div key={mod.key} className="space-y-1">
                        <div className="flex justify-between text-slate-300">
                          <span>{mod.label}</span>
                          <span className="font-mono tabular-nums text-slate-400">
                            {selectedObj.modifiers[mod.key].toFixed(mod.key === 'twist' ? 0 : 2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={mod.min}
                          max={mod.max}
                          step={mod.step}
                          value={selectedObj.modifiers[mod.key]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdateObject(selectedObj.id, (o) => ({
                              ...o,
                              modifiers: { ...o.modifiers, [mod.key]: val },
                            }));
                          }}
                          className="w-full h-7 accent-blue-500"
                        />
                      </div>
                    ))}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={onMirrorSelected}
                        className="min-h-[44px] px-3 rounded-lg bg-[#232732] hover:bg-[#2c3140] font-medium text-slate-200"
                      >
                        Mirror X
                      </button>
                      <button
                        onClick={() =>
                          onUpdateObject(
                            selectedObj.id,
                            (o) => ({
                              ...o,
                              modifiers: { twist: 0, taper: 0, inflate: 0, segments: 24 },
                            }),
                            true,
                          )
                        }
                        className="min-h-[44px] px-3 rounded-lg bg-[#232732] hover:bg-[#2c3140] font-medium text-slate-200"
                      >
                        Reset Mesh
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                      <button
                        onClick={onDuplicateSelected}
                        className="min-h-[44px] px-3 rounded-lg bg-[#232732] hover:bg-[#2c3140] font-medium text-slate-200 flex items-center justify-center gap-1.5"
                      >
                        <Copy className="w-4 h-4" /> Duplicate
                      </button>
                      <button
                        onClick={onDeleteSelected}
                        className="min-h-[44px] px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 font-medium text-rose-300 flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Footer inside Properties Panel */}
              <div className="p-2 border-t border-white/10 bg-[#14171D] flex items-center justify-between gap-2">
                <button
                  onClick={onOpenSettings}
                  className="min-h-[40px] flex-1 px-2.5 rounded-lg bg-[#20242D] hover:bg-[#2A303C] text-xs font-medium text-slate-300 whitespace-nowrap"
                >
                  Workspace Settings
                </button>
              </div>
            </aside>
          )}

          {/* FLOATING UNDO & REDO BUTTONS */}
          <div
            style={undoPosStyle()}
            className="fixed z-30 flex items-center gap-2 pointer-events-auto"
          >
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo"
              aria-label="Undo"
              className="min-w-[48px] min-h-[48px] px-3 rounded-xl bg-[#181B22]/95 border border-white/15 text-slate-100 hover:bg-[#232732] disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center gap-1.5 shadow-xl active:scale-95 transition-transform"
            >
              <Undo2 className="w-5 h-5" />
              <span className="hidden xl:inline text-xs font-medium">Undo</span>
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo"
              aria-label="Redo"
              className="min-w-[48px] min-h-[48px] px-3 rounded-xl bg-[#181B22]/95 border border-white/15 text-slate-100 hover:bg-[#232732] disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center gap-1.5 shadow-xl active:scale-95 transition-transform"
            >
              <Redo2 className="w-5 h-5" />
              <span className="hidden xl:inline text-xs font-medium">Redo</span>
            </button>
          </div>

          {/* BOTTOM EDITING TOOLBAR (Collapsible) */}
          <div
            className="fixed bottom-2 z-20 left-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{
              maxWidth: panelOpen
                ? `calc(100vw - ${effectivePanelWidth + (compactToolbar ? 72 : 84)}px)`
                : 'calc(100vw - 88px)',
              paddingBottom: 'var(--safe-bottom)',
            }}
          >
            <button
              onClick={() => setBottomOpen((v) => !v)}
              aria-label={bottomOpen ? 'Collapse Bottom Toolbar' : 'Expand Bottom Toolbar'}
              className="mb-1 h-7 px-3 rounded-lg bg-[#181B22]/95 border border-white/12 text-[11px] font-medium text-slate-300 flex items-center gap-1 shadow"
            >
              {bottomOpen ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" /> Add & Edit
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5" /> Add & Edit
                </>
              )}
            </button>

            {bottomOpen && (
              <div className="w-full flex items-center gap-1.5 p-1.5 rounded-xl bg-[#181B22]/95 border border-white/10 shadow-2xl overflow-x-auto wmod-scroll">
                {PRIMITIVE_ACTIONS.map((prim) => (
                  <button
                    key={prim.type}
                    onClick={() => onAddPrimitive(prim.type)}
                    className={`${dockBtnSizeClass} rounded-lg bg-[#232732] hover:bg-[#2D3342] text-slate-200 flex flex-col items-center justify-center gap-1 shrink-0 active:scale-95 transition-transform`}
                  >
                    {prim.icon}
                    <span className="text-[10px] font-medium whitespace-nowrap">{prim.label}</span>
                  </button>
                ))}

                <div className="w-px h-8 bg-white/10 shrink-0 mx-0.5" />

                <button
                  onClick={() => handleSelectUVFromView(undefined, true)}
                  disabled={!selectedObj}
                  title="Select UV From View (Blender-style Camera Projection)"
                  className={`${dockBtnSizeClass} rounded-lg bg-[#232732] hover:bg-[#2D3342] disabled:opacity-40 text-emerald-300 flex flex-col items-center justify-center gap-1 shrink-0`}
                >
                  <Scan className="w-4 h-4" />
                  <span className="text-[10px] font-medium whitespace-nowrap">UV View</span>
                </button>
                <button
                  onClick={() => viewportRef.current?.focusSelected()}
                  disabled={!selectedObj}
                  className={`${dockBtnSizeClass} rounded-lg bg-[#232732] hover:bg-[#2D3342] disabled:opacity-40 text-blue-300 flex flex-col items-center justify-center gap-1 shrink-0`}
                >
                  <Maximize2 className="w-4 h-4" />
                  <span className="text-[10px] font-medium whitespace-nowrap">Focus</span>
                </button>
                <button
                  onClick={onDuplicateSelected}
                  disabled={!selectedObj}
                  className={`${dockBtnSizeClass} rounded-lg bg-[#232732] hover:bg-[#2D3342] disabled:opacity-40 text-slate-200 flex flex-col items-center justify-center gap-1 shrink-0`}
                >
                  <Copy className="w-4 h-4" />
                  <span className="text-[10px] font-medium whitespace-nowrap">Clone</span>
                </button>
                <button
                  onClick={onDeleteSelected}
                  disabled={!selectedObj}
                  className={`${dockBtnSizeClass} rounded-lg bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 text-rose-300 flex flex-col items-center justify-center gap-1 shrink-0`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-[10px] font-medium whitespace-nowrap">Delete</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
