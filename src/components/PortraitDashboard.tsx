import React, { useRef, useState } from 'react';
import {
  Box,
  Check,
  Copy,
  Download,
  FileBox,
  FolderKanban,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Layers,
  MonitorSmartphone,
  Plus,
  RotateCw,
  Search,
  Settings as SettingsIcon,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { PROJECT_TEMPLATES } from '../engine/sceneTemplates';
import { getRuntimeEnvironmentLabel } from '../platform/capacitorBridge';
import { PWAInstallButton } from './PWAInstallButton';
import {
  AppSettings,
  PortraitTab,
  StoredFileItem,
  TextureAsset,
  UIDensity,
  ViewportTheme,
  WModelerProject,
} from '../types/modeler';

interface PortraitDashboardProps {
  activeTab: PortraitTab;
  onTabChange: (tab: PortraitTab) => void;
  projects: WModelerProject[];
  activeProject: WModelerProject;
  selectedObjectName: string | null;
  files: StoredFileItem[];
  textures: TextureAsset[];
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onEnterWorkspace: (projectId?: string) => void;
  onCreateProject: (name: string, templateId: string) => void;
  onDuplicateProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onImportModelFile: (file: File) => void;
  onImportTXDFile: (file: File) => void;
  onExportTXDArchive: () => void;
  onDownloadTexturePNG: (texture: TextureAsset) => void;
  onOpenStoredFile: (file: StoredFileItem) => void;
  onDownloadStoredFile: (file: StoredFileItem) => void;
  onDeleteStoredFile: (id: string) => void;
  onUploadTexture: (file: File) => void;
  onApplyTextureToSelected: (texture: TextureAsset) => void;
  onDeleteCustomTexture: (id: string) => void;
  onClearCache: () => void;
  statusMessage: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimeAgo(ts: number): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export const PortraitDashboard: React.FC<PortraitDashboardProps> = ({
  activeTab,
  onTabChange,
  projects,
  activeProject,
  selectedObjectName,
  files,
  textures,
  settings,
  onUpdateSettings,
  onEnterWorkspace,
  onCreateProject,
  onDuplicateProject,
  onDeleteProject,
  onRenameProject,
  onImportModelFile,
  onImportTXDFile,
  onExportTXDArchive,
  onDownloadTexturePNG,
  onOpenStoredFile,
  onDownloadStoredFile,
  onDeleteStoredFile,
  onUploadTexture,
  onApplyTextureToSelected,
  onDeleteCustomTexture,
  onClearCache,
  statusMessage,
}) => {
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const textureInputRef = useRef<HTMLInputElement | null>(null);
  const txdInputRef = useRef<HTMLInputElement | null>(null);

  const [projectSearch, setProjectSearch] = useState('');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newTemplateId, setNewTemplateId] = useState(PROJECT_TEMPLATES[0].id);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  const [fileSearch, setFileSearch] = useState('');
  const [fileFilter, setFileFilter] = useState<
    'all' | 'wmod' | 'dff' | 'txd' | 'glb' | 'mesh' | 'png'
  >('all');
  const [texFilter, setTexFilter] = useState<string>('All');
  const [confirmClearCache, setConfirmClearCache] = useState(false);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.description.toLowerCase().includes(projectSearch.toLowerCase()),
  );

  const filteredFiles = files.filter((f) => {
    const matchesText = f.name.toLowerCase().includes(fileSearch.toLowerCase());
    if (!matchesText) return false;
    if (fileFilter === 'all') return true;
    if (fileFilter === 'mesh') return f.format === 'obj' || f.format === 'stl';
    return f.format === fileFilter;
  });

  const filteredTextures = textures.filter((t) =>
    texFilter === 'All' ? true : t.category === texFilter,
  );

  const totalStorageBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);

  const isCompactDensity =
    settings.uiDensity === 'compact' ||
    (settings.uiDensity === 'auto' && typeof window !== 'undefined' && window.innerWidth <= 360);

  return (
    <div className="min-h-[100dvh] w-full bg-[#121418] text-slate-100 flex flex-col">
      {/* Hidden File Inputs */}
      <input
        ref={modelInputRef}
        type="file"
        accept=".dff,.txd,.glb,.gltf,.obj,.stl,.json,.wmod.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportModelFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={txdInputRef}
        type="file"
        accept=".txd"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportTXDFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={textureInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadTexture(f);
          e.target.value = '';
        }}
      />

      {/* COMPACT MOBILE TOP APP BAR (52px + safe-top) */}
      <header
        className="sticky top-0 z-30 bg-[#181B22]/95 border-b border-white/10 px-4 flex items-center justify-between gap-3"
        style={{
          height: 'calc(52px + var(--safe-top))',
          paddingTop: 'var(--safe-top)',
          paddingLeft: 'max(16px, var(--safe-left))',
          paddingRight: 'max(16px, var(--safe-right))',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            WMODELER
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-medium text-slate-400 capitalize truncate">
            {activeTab}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton variant="compact" />
          <button
            onClick={() => onEnterWorkspace()}
            className="min-h-[40px] px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 transition-transform"
          >
            <Box className="w-4 h-4" />
            3D Workspace
          </button>
        </div>
      </header>

      {/* Status Notification */}
      {statusMessage && (
        <div className="mx-auto mt-3 px-4 py-2 rounded-lg bg-[#1C2029] border border-blue-500/40 text-xs font-medium text-slate-100">
          {statusMessage}
        </div>
      )}

      {/* MAIN CONTENT BODY */}
      <main
        className={`flex-1 w-full max-w-5xl mx-auto pt-4 ${isCompactDensity ? 'px-3 space-y-4' : 'px-4 space-y-6'}`}
        style={{
          paddingBottom: 'calc(92px + var(--safe-bottom))',
          paddingLeft: 'max(12px, var(--safe-left))',
          paddingRight: 'max(12px, var(--safe-right))',
        }}
      >
        {/* TAB 1: MAIN DASHBOARD */}
        {activeTab === 'dashboard' && (
          <>
            {/* Orientation Hint + Active Project Hero */}
            <section className="rounded-2xl bg-[#1A1D24] border border-white/10 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-slate-400">
                    Active Workspace · {activeProject.objects.length} objects · Updated{' '}
                    {formatTimeAgo(activeProject.updatedAt)}
                  </div>
                  <h1 className="text-xl font-bold text-white tracking-tight">
                    {activeProject.name}
                  </h1>
                  <p className="text-sm text-slate-400 max-w-xl">{activeProject.description}</p>
                </div>

                <button
                  onClick={() => onEnterWorkspace(activeProject.id)}
                  className="min-h-[48px] px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white flex items-center justify-center gap-2 whitespace-nowrap shrink-0 active:scale-[0.98] transition-transform"
                >
                  <RotateCw className="w-4 h-4" />
                  Open Landscape Editor
                </button>
              </div>

              <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-blue-400 shrink-0" />
                  Rotate device to Landscape for full-screen 3D viewport & touchscreen gizmos.
                </span>
                <span className="font-mono tabular-nums text-slate-300">
                  {projects.length} projects · {files.length} files · {formatBytes(totalStorageBytes)}
                </span>
              </div>
            </section>

            {/* Quick-Start 3D Templates */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Start New 3D Model</h2>
                <button
                  onClick={() => {
                    onTabChange('projects');
                    setNewProjectOpen(true);
                  }}
                  className="min-h-[40px] px-3 rounded-lg text-xs font-medium text-blue-400 hover:bg-white/5 whitespace-nowrap"
                >
                  All Templates
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {PROJECT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => onCreateProject(tpl.name, tpl.id)}
                    className="text-left p-4 rounded-xl bg-[#1A1D24] border border-white/10 hover:border-blue-500/50 hover:bg-[#20242E] transition-colors flex flex-col justify-between gap-3 min-h-[124px]"
                  >
                    <div className="space-y-1">
                      <div className="text-xs text-blue-400 font-medium">{tpl.category}</div>
                      <div className="text-sm font-semibold text-white">{tpl.name}</div>
                      <div className="text-xs text-slate-400 line-clamp-2">{tpl.description}</div>
                    </div>
                    <div className="text-xs font-medium text-slate-300 flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5 text-blue-400" /> Create & Edit
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Quick Summary Grid: Recent Projects + Recent Files */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="rounded-2xl bg-[#1A1D24] border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Recent Projects</h2>
                  <button
                    onClick={() => onTabChange('projects')}
                    className="min-h-[36px] px-2.5 text-xs font-medium text-blue-400 hover:underline"
                  >
                    Manage All
                  </button>
                </div>
                <div className="divide-y divide-white/5">
                  {projects.slice(0, 4).map((proj) => (
                    <div
                      key={proj.id}
                      onClick={() => onEnterWorkspace(proj.id)}
                      className="min-h-[56px] py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.03] px-2 rounded-lg"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">
                          {proj.name}
                        </div>
                        <div className="text-xs text-slate-400 tabular-nums">
                          {proj.objects.length} objects · {formatTimeAgo(proj.updatedAt)}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-blue-400 shrink-0">Open</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl bg-[#1A1D24] border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Saved 3D Files</h2>
                  <button
                    onClick={() => onTabChange('files')}
                    className="min-h-[36px] px-2.5 text-xs font-medium text-blue-400 hover:underline"
                  >
                    File Manager
                  </button>
                </div>
                <div className="divide-y divide-white/5">
                  {files.slice(0, 4).map((file) => (
                    <div
                      key={file.id}
                      className="min-h-[56px] py-2.5 px-2 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">
                          {file.name}
                        </div>
                        <div className="text-xs font-mono text-slate-400 tabular-nums">
                          {file.format.toUpperCase()} · {formatBytes(file.sizeBytes)} ·{' '}
                          {formatTimeAgo(file.updatedAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => onDownloadStoredFile(file)}
                        aria-label={`Download ${file.name}`}
                        className="min-w-[44px] min-h-[44px] rounded-lg bg-[#232732] hover:bg-[#2E3442] flex items-center justify-center text-slate-200 shrink-0"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}

        {/* TAB 2: PROJECT MANAGER */}
        {activeTab === 'projects' && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-white">Project Manager</h1>
                <p className="text-xs text-slate-400">
                  Manage modeling scenes, duplicate assemblies, or launch into landscape editing.
                </p>
              </div>
              <button
                onClick={() => setNewProjectOpen((v) => !v)}
                className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" /> New Project
              </button>
            </div>

            {newProjectOpen && (
              <div className="rounded-2xl bg-[#1A1D24] border border-blue-500/40 p-4 space-y-3">
                <div className="text-sm font-semibold text-white">Create New Project</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Project Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Gearbox Housing v2"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg bg-[#121418] border border-white/10 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Starter Template</label>
                    <select
                      value={newTemplateId}
                      onChange={(e) => setNewTemplateId(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg bg-[#121418] border border-white/10 text-sm text-white"
                    >
                      {PROJECT_TEMPLATES.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.category})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setNewProjectOpen(false)}
                    className="min-h-[44px] px-4 rounded-lg bg-[#232732] text-xs font-medium text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const tpl = PROJECT_TEMPLATES.find((t) => t.id === newTemplateId);
                      onCreateProject(
                        newProjectName.trim() || tpl?.name || 'Untitled Project',
                        newTemplateId,
                      );
                      setNewProjectName('');
                      setNewProjectOpen(false);
                    }}
                    className="min-h-[44px] px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                  >
                    Create & Open
                  </button>
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search projects..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#1A1D24] border border-white/10 text-sm text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2.5">
              {filteredProjects.map((proj) => {
                const isActive = proj.id === activeProject.id;
                const isEditing = editingProjectId === proj.id;
                return (
                  <div
                    key={proj.id}
                    className={`rounded-2xl p-4 border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isActive
                        ? 'bg-[#1E2430] border-blue-500/45'
                        : 'bg-[#1A1D24] border-white/10'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingProjectName}
                            onChange={(e) => setEditingProjectName(e.target.value)}
                            className="h-10 px-3 rounded-lg bg-[#121418] border border-blue-500 text-sm text-white flex-1"
                          />
                          <button
                            onClick={() => {
                              if (editingProjectName.trim()) {
                                onRenameProject(proj.id, editingProjectName.trim());
                              }
                              setEditingProjectId(null);
                            }}
                            className="min-h-[40px] min-w-[40px] rounded-lg bg-blue-600 text-white flex items-center justify-center"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            setEditingProjectId(proj.id);
                            setEditingProjectName(proj.name);
                          }}
                          className="text-base font-semibold text-white truncate cursor-pointer hover:text-blue-300"
                          title="Tap to rename"
                        >
                          {proj.name}
                        </div>
                      )}
                      <div className="text-xs text-slate-400">
                        {proj.objects.length} objects · Updated {formatTimeAgo(proj.updatedAt)}
                        {isActive ? ' · Active' : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onEnterWorkspace(proj.id)}
                        className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white whitespace-nowrap"
                      >
                        Open Editor
                      </button>
                      <button
                        onClick={() => onDuplicateProject(proj.id)}
                        aria-label="Duplicate project"
                        className="min-w-[44px] min-h-[44px] rounded-xl bg-[#232732] hover:bg-[#2C3140] text-slate-200 flex items-center justify-center"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteProject(proj.id)}
                        disabled={projects.length <= 1}
                        aria-label="Delete project"
                        className="min-w-[44px] min-h-[44px] rounded-xl bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-35 text-rose-300 flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 3: FILE MANAGER */}
        {activeTab === 'files' && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-white">File Manager</h1>
                <p className="text-xs text-slate-400">
                  Import DFF, TXD, GLB, OBJ, STL, or WMODELER project files and manage local exports.
                </p>
              </div>
              <button
                onClick={() => modelInputRef.current?.click()}
                className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Upload className="w-4 h-4" /> Import 3D / DFF / TXD
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter files by name..."
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#1A1D24] border border-white/10 text-sm text-white"
                />
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1A1D24] border border-white/10 overflow-x-auto wmod-scroll">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'wmod', label: 'WMOD' },
                    { id: 'dff', label: 'DFF' },
                    { id: 'txd', label: 'TXD' },
                    { id: 'glb', label: 'GLB' },
                    { id: 'mesh', label: 'OBJ/STL' },
                    { id: 'png', label: 'PNG' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFileFilter(tab.id)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap ${
                      fileFilter === tab.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredFiles.length === 0 ? (
              <div className="rounded-2xl bg-[#1A1D24] border border-white/10 p-8 text-center space-y-2">
                <FolderOpen className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-sm font-medium text-slate-200">No Matching Files</p>
                <p className="text-xs text-slate-400">
                  Export a 3D model from the Landscape Workspace or import a DFF/TXD/mesh from your device.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className="rounded-xl bg-[#1A1D24] border border-white/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-medium text-white truncate">{file.name}</div>
                      <div className="text-xs font-mono text-slate-400 tabular-nums">
                        {file.format.toUpperCase()} · {formatBytes(file.sizeBytes)} ·{' '}
                        {file.objectCount} objs · {formatTimeAgo(file.updatedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {file.format !== 'png' && (
                        <button
                          onClick={() => onOpenStoredFile(file)}
                          className="min-h-[44px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white whitespace-nowrap"
                        >
                          {file.format === 'txd' ? 'Extract PNGs' : 'Load in 3D'}
                        </button>
                      )}
                      <button
                        onClick={() => onDownloadStoredFile(file)}
                        aria-label={`Export ${file.name}`}
                        className="min-w-[44px] min-h-[44px] rounded-xl bg-[#232732] hover:bg-[#2C3140] text-slate-200 flex items-center justify-center"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteStoredFile(file.id)}
                        aria-label={`Delete ${file.name}`}
                        className="min-w-[44px] min-h-[44px] rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 4: TEXTURE MANAGER */}
        {activeTab === 'textures' && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-white">Texture Manager</h1>
                <p className="text-xs text-slate-400">
                  PNG maps, procedural PBR textures, and RenderWare TXD import/export.{' '}
                  {selectedObjectName
                    ? `Active target: ${selectedObjectName}`
                    : 'Select an object in 3D Workspace to assign directly.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={() => txdInputRef.current?.click()}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[#232732] hover:bg-[#2C3140] border border-white/10 text-xs font-semibold text-slate-100 flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-4 h-4 text-emerald-400" /> Import TXD
                </button>
                <button
                  onClick={onExportTXDArchive}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[#232732] hover:bg-[#2C3140] border border-white/10 text-xs font-semibold text-slate-100 flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 text-blue-400" /> Export TXD
                </button>
                <button
                  onClick={() => textureInputRef.current?.click()}
                  className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-4 h-4" /> Upload PNG
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1A1D24] border border-white/10 overflow-x-auto">
              {['All', 'Metal', 'Composite', 'Stone', 'Wood', 'Utility', 'Custom'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setTexFilter(cat)}
                  className={`min-h-[38px] px-3 rounded-lg text-xs font-medium whitespace-nowrap ${
                    texFilter === cat
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredTextures.map((tex) => (
                <div
                  key={tex.id}
                  className="rounded-xl bg-[#1A1D24] border border-white/10 overflow-hidden flex flex-col"
                >
                  <img
                    src={tex.dataUrl}
                    alt={tex.name}
                    className="w-full h-32 object-cover bg-[#121418]"
                  />
                  <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                    <div>
                      <div className="text-sm font-semibold text-white truncate">{tex.name}</div>
                      <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {tex.category} · {tex.resolution}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onApplyTextureToSelected(tex)}
                        className="flex-1 min-h-[40px] px-2.5 rounded-lg bg-[#232732] hover:bg-blue-600 text-xs font-medium text-slate-100 transition-colors"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => onDownloadTexturePNG(tex)}
                        title={`Save ${tex.name}.png`}
                        aria-label={`Download ${tex.name} PNG`}
                        className="min-w-[40px] min-h-[40px] rounded-lg bg-[#232732] hover:bg-[#2C3140] text-slate-200 flex items-center justify-center"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {!tex.isBuiltIn && (
                        <button
                          onClick={() => onDeleteCustomTexture(tex.id)}
                          aria-label={`Delete ${tex.name}`}
                          className="min-w-[40px] min-h-[40px] rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 5: APPLICATION SETTINGS */}
        {activeTab === 'settings' && (
          <section className="space-y-4">
            <div>
              <h1 className="text-lg font-bold text-white">Application Settings</h1>
              <p className="text-xs text-slate-400">
                Configure Android display orientation, touch ergonomics, gizmos, and Capacitor storage.
              </p>
            </div>

            {/* Display & Orientation */}
            <div className="rounded-2xl bg-[#1A1D24] border border-white/10 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <MonitorSmartphone className="w-4 h-4 text-blue-400" />
                Android Display & Orientation
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 block">Display Mode Behavior</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#121418] border border-white/10">
                  {(
                    [
                      { id: 'auto', label: 'Auto Rotate' },
                      { id: 'landscape', label: '3D Workspace' },
                      { id: 'portrait', label: 'Dashboard' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => onUpdateSettings({ displayOverride: mode.id })}
                      className={`min-h-[42px] rounded-lg text-xs font-medium ${
                        settings.displayOverride === mode.id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 block">
                  Android Screen UI Density (All Resolutions)
                </label>
                <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-[#121418] border border-white/10">
                  {(
                    [
                      { id: 'auto', label: 'Auto' },
                      { id: 'compact', label: 'Compact' },
                      { id: 'standard', label: 'Standard' },
                      { id: 'large', label: 'Tablet' },
                    ] as Array<{ id: UIDensity; label: string }>
                  ).map((density) => (
                    <button
                      key={density.id}
                      onClick={() => onUpdateSettings({ uiDensity: density.id })}
                      className={`min-h-[42px] rounded-lg text-xs font-medium ${
                        settings.uiDensity === density.id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {density.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 block">Viewport Theme</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#121418] border border-white/10">
                  {(
                    [
                      { id: 'obsidian', label: 'Obsidian' },
                      { id: 'slate', label: 'Slate CAD' },
                      { id: 'clay', label: 'Light Clay' },
                    ] as Array<{ id: ViewportTheme; label: string }>
                  ).map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => onUpdateSettings({ viewportTheme: theme.id })}
                      className={`min-h-[42px] rounded-lg text-xs font-medium ${
                        settings.viewportTheme === theme.id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Touchscreen & Gizmo Ergonomics */}
            <div className="rounded-2xl bg-[#1A1D24] border border-white/10 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Layers className="w-4 h-4 text-blue-400" />
                Toolbar Positions & Touch Controls
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 block">Vertical Toolbar Side</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#121418] border border-white/10">
                    {(['left', 'right'] as const).map((side) => (
                      <button
                        key={side}
                        onClick={() => onUpdateSettings({ toolbarSide: side })}
                        className={`min-h-[40px] rounded-lg text-xs font-medium capitalize ${
                          settings.toolbarSide === side
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400'
                        }`}
                      >
                        {side}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 block">Floating Undo/Redo Corner</label>
                  <select
                    value={settings.undoPosition}
                    onChange={(e) =>
                      onUpdateSettings({
                        undoPosition: e.target.value as AppSettings['undoPosition'],
                      })
                    }
                    className="w-full h-11 px-3 rounded-xl bg-[#121418] border border-white/10 text-xs text-white"
                  >
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="top-left">Top Left</option>
                    <option value="top-right">Top Right</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Touchscreen Gizmo Size</span>
                  <span className="font-mono tabular-nums text-slate-400">
                    {settings.gizmoSize.toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min={0.9}
                  max={1.65}
                  step={0.05}
                  value={settings.gizmoSize}
                  onChange={(e) => onUpdateSettings({ gizmoSize: parseFloat(e.target.value) })}
                  className="w-full h-8 accent-blue-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Properties Panel Width</span>
                  <span className="font-mono tabular-nums text-slate-400">
                    {settings.propertiesPanelWidth} px
                  </span>
                </div>
                <input
                  type="range"
                  min={230}
                  max={420}
                  step={8}
                  value={settings.propertiesPanelWidth}
                  onChange={(e) =>
                    onUpdateSettings({ propertiesPanelWidth: parseInt(e.target.value, 10) })
                  }
                  className="w-full h-8 accent-blue-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Accidental Touch Drag Deadzone</span>
                  <span className="font-mono tabular-nums text-slate-400">
                    {settings.touchDeadzonePx} px
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={14}
                  step={1}
                  value={settings.touchDeadzonePx}
                  onChange={(e) =>
                    onUpdateSettings({ touchDeadzonePx: parseInt(e.target.value, 10) })
                  }
                  className="w-full h-8 accent-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={() =>
                    onUpdateSettings({ touchGuardDefault: !settings.touchGuardDefault })
                  }
                  className="min-h-[48px] px-4 rounded-xl bg-[#232732] flex items-center justify-between text-xs font-medium"
                >
                  <span>Start with Touch Guard On</span>
                  <span
                    className={
                      settings.touchGuardDefault ? 'text-blue-400 font-semibold' : 'text-slate-500'
                    }
                  >
                    {settings.touchGuardDefault ? 'Enabled' : 'Disabled'}
                  </span>
                </button>
                <button
                  onClick={() => onUpdateSettings({ hapticsEnabled: !settings.hapticsEnabled })}
                  className="min-h-[48px] px-4 rounded-xl bg-[#232732] flex items-center justify-between text-xs font-medium"
                >
                  <span>Android Touch Haptics</span>
                  <span
                    className={
                      settings.hapticsEnabled ? 'text-blue-400 font-semibold' : 'text-slate-500'
                    }
                  >
                    {settings.hapticsEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </button>
              </div>
            </div>

            {/* Capacitor Native Bridge & Storage */}
            <div className="rounded-2xl bg-[#1A1D24] border border-white/10 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <HardDrive className="w-4 h-4 text-blue-400" />
                Android APK & Storage Info
              </div>
              <div className="text-xs text-slate-400 space-y-1 font-mono tabular-nums">
                <div>App ID: com.wmodeler.app</div>
                <div>Runtime: {getRuntimeEnvironmentLabel()}</div>
                <div>
                  Offline Storage: {projects.length} projects · {files.length} files (
                  {formatBytes(totalStorageBytes)})
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <PWAInstallButton variant="full" />

                {!confirmClearCache ? (
                  <button
                    onClick={() => setConfirmClearCache(true)}
                    className="min-h-[46px] px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300"
                  >
                    Reset Local Projects & Cache
                  </button>
                ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setConfirmClearCache(false);
                      onClearCache();
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-xs font-semibold text-white"
                  >
                    Confirm Reset
                  </button>
                  <button
                    onClick={() => setConfirmClearCache(false)}
                    className="min-h-[44px] px-4 rounded-xl bg-[#232732] text-xs font-medium text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* MOBILE BOTTOM TAB BAR (60px + safe-bottom) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 bg-[#181B22]/95 border-t border-white/10 grid grid-cols-5 items-center"
        style={{
          height: 'calc(60px + var(--safe-bottom))',
          paddingBottom: 'var(--safe-bottom)',
          paddingLeft: 'var(--safe-left)',
          paddingRight: 'var(--safe-right)',
        }}
      >
        {(
          [
            { id: 'dashboard', label: 'Home', icon: <Box className="w-5 h-5" /> },
            { id: 'projects', label: 'Projects', icon: <FolderKanban className="w-5 h-5" /> },
            { id: 'files', label: 'Files', icon: <FileBox className="w-5 h-5" /> },
            { id: 'textures', label: 'Textures', icon: <ImageIcon className="w-5 h-5" /> },
            { id: 'settings', label: 'Settings', icon: <SettingsIcon className="w-5 h-5" /> },
          ] as Array<{ id: PortraitTab; label: string; icon: React.ReactNode }>
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.icon}
              <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
