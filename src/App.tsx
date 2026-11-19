import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LandscapeWorkspace } from './components/LandscapeWorkspace';
import { PortraitDashboard } from './components/PortraitDashboard';
import { OfflineIndicator } from './components/PWAInstallButton';
import { STARTUP_AD_URL, StartupAdModal } from './components/StartupAdModal';
import { parseImportedFile } from './engine/modelImporter';
import { getBuiltInTextures } from './engine/proceduralTextures';
import { exportTexturesToTXD } from './engine/rwFormat';
import {
  createInitialFiles,
  createInitialProjects,
  createPrimitiveObject,
  DEFAULT_APP_SETTINGS,
  nextId,
  PROJECT_TEMPLATES,
} from './engine/sceneTemplates';
import {
  clearWModelerCache,
  downloadBlob,
  loadAppSettings,
  loadPersistedCustomTextures,
  loadPersistedFiles,
  loadPersistedProjects,
  requestLandscapeOrientation,
  saveAppSettings,
  savePersistedCustomTextures,
  savePersistedFiles,
  savePersistedProjects,
  triggerTouchHaptic,
} from './platform/capacitorBridge';
import {
  AppSettings,
  PortraitTab,
  PrimitiveType,
  SceneObjectData,
  SceneStats,
  StoredFileItem,
  TextureAsset,
  Vec3Tuple,
  WModelerProject,
} from './types/modeler';

function cloneObjects(objs: SceneObjectData[]): SceneObjectData[] {
  return JSON.parse(JSON.stringify(objs)) as SceneObjectData[];
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadAppSettings(DEFAULT_APP_SETTINGS),
  );
  const [isPhysicalLandscape, setIsPhysicalLandscape] = useState<boolean>(
    () => window.innerWidth > window.innerHeight,
  );
  const [manualView, setManualView] = useState<'workspace' | 'manager' | null>(null);
  const [portraitTab, setPortraitTab] = useState<PortraitTab>('dashboard');

  const initialSeedProjects = useMemo(() => createInitialProjects(), []);
  const [projects, setProjects] = useState<WModelerProject[]>(initialSeedProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>(initialSeedProjects[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSeedProjects[0].objects[0]?.id || null,
  );
  const [files, setFiles] = useState<StoredFileItem[]>(() =>
    createInitialFiles(initialSeedProjects),
  );
  const [customTextures, setCustomTextures] = useState<TextureAsset[]>([]);
  const [storageReady, setStorageReady] = useState<boolean>(false);

  const [historyPast, setHistoryPast] = useState<SceneObjectData[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<SceneObjectData[][]>([]);
  const dragBaselineRef = useRef<SceneObjectData[] | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimerRef = useRef<number | null>(null);

  const [showStartupAd, setShowStartupAd] = useState<boolean>(() => {
    try {
      const alreadyShown = sessionStorage.getItem('wmodeler_startup_ad_shown') === '1';
      if (alreadyShown) return false;
      // Top-level published / Android PWA launch opens the ad directly without any click
      if (typeof window !== 'undefined' && window.self === window.top) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });

  const handleDismissStartupAd = useCallback(() => {
    try {
      sessionStorage.setItem('wmodeler_startup_ad_shown', '1');
    } catch {
      // ignore storage errors
    }
    setShowStartupAd(false);
  }, []);

  // Automatically open the startup ad URL once without clicking any button when opened outside an iframe
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onPageShow = () => {
      setShowStartupAd(false);
    };
    window.addEventListener('pageshow', onPageShow);

    try {
      const alreadyShown = sessionStorage.getItem('wmodeler_startup_ad_shown') === '1';
      const isTopLevel = window.self === window.top;
      if (!alreadyShown && isTopLevel && navigator.onLine !== false) {
        sessionStorage.setItem('wmodeler_startup_ad_shown', '1');
        window.location.assign(STARTUP_AD_URL);
      }
    } catch {
      // ignore storage/navigation restrictions
    }

    return () => {
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  const builtInTextures = useMemo(() => getBuiltInTextures(), []);
  const allTextures = useMemo(
    () => [...customTextures, ...builtInTextures],
    [customTextures, builtInTextures],
  );

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => setStatusMessage(null), 2600);
  }, []);

  // Load IndexedDB state on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedProjs, storedFiles, storedTex] = await Promise.all([
        loadPersistedProjects(),
        loadPersistedFiles(),
        loadPersistedCustomTextures(),
      ]);
      if (cancelled) return;
      if (storedProjs.length > 0) {
        setProjects(storedProjs);
        setActiveProjectId(storedProjs[0].id);
        setSelectedId(storedProjs[0].objects[0]?.id || null);
      }
      if (storedFiles.length > 0) {
        setFiles(storedFiles);
      }
      if (storedTex.length > 0) {
        setCustomTextures(storedTex);
      }
      setStorageReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist changes once hydration completes
  useEffect(() => {
    if (!storageReady) return;
    savePersistedProjects(projects);
  }, [projects, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    savePersistedFiles(files);
  }, [files, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    savePersistedCustomTextures(customTextures);
  }, [customTextures, storageReady]);

  // Listen to device orientation / window resize
  useEffect(() => {
    const updateOrientation = () => {
      const nextLandscape = window.innerWidth > window.innerHeight;
      setIsPhysicalLandscape((prev) => {
        if (prev !== nextLandscape) {
          setManualView(null);
        }
        return nextLandscape;
      });
    };
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveAppSettings(next);
      return next;
    });
    if (patch.displayOverride) {
      setManualView(null);
    }
  }, []);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0],
    [projects, activeProjectId],
  );

  const selectedObject = useMemo(
    () => activeProject.objects.find((o) => o.id === selectedId) || null,
    [activeProject, selectedId],
  );

  // Mutate active project's objects with optional undo history capture
  const applyObjectsChange = useCallback(
    (
      updater: (objs: SceneObjectData[]) => SceneObjectData[],
      recordHistory = true,
    ) => {
      setProjects((prev) =>
        prev.map((proj) => {
          if (proj.id !== activeProject.id) return proj;
          if (recordHistory) {
            setHistoryPast((past) => [...past.slice(-39), cloneObjects(proj.objects)]);
            setHistoryFuture([]);
          }
          return {
            ...proj,
            updatedAt: Date.now(),
            objects: updater(proj.objects),
          };
        }),
      );
    },
    [activeProject.id],
  );

  const handleSelectObject = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) triggerTouchHaptic(settings.hapticsEnabled);
    },
    [settings.hapticsEnabled],
  );

  const handleAddPrimitive = useCallback(
    (type: PrimitiveType) => {
      const nextObj = createPrimitiveObject(type, undefined, activeProject.objects.length);
      applyObjectsChange((objs) => [...objs, nextObj], true);
      setSelectedId(nextObj.id);
      triggerTouchHaptic(settings.hapticsEnabled);
      showStatus(`Added ${nextObj.name}`);
    },
    [activeProject.objects.length, applyObjectsChange, settings.hapticsEnabled, showStatus],
  );

  const handleUpdateObject = useCallback(
    (
      id: string,
      updater: (obj: SceneObjectData) => SceneObjectData,
      commitHistory = false,
    ) => {
      applyObjectsChange(
        (objs) => objs.map((o) => (o.id === id ? updater(o) : o)),
        commitHistory,
      );
    },
    [applyObjectsChange],
  );

  const handleTransformLive = useCallback(
    (id: string, pos: Vec3Tuple, rot: Vec3Tuple, scale: Vec3Tuple) => {
      if (!dragBaselineRef.current) {
        dragBaselineRef.current = cloneObjects(activeProject.objects);
      }
      setProjects((prev) =>
        prev.map((proj) =>
          proj.id !== activeProject.id
            ? proj
            : {
                ...proj,
                objects: proj.objects.map((o) =>
                  o.id === id ? { ...o, position: pos, rotation: rot, scale } : o,
                ),
              },
        ),
      );
    },
    [activeProject.id, activeProject.objects],
  );

  const handleTransformCommit = useCallback(
    (id: string, pos: Vec3Tuple, rot: Vec3Tuple, scale: Vec3Tuple) => {
      const baseline = dragBaselineRef.current;
      dragBaselineRef.current = null;
      if (baseline) {
        setHistoryPast((past) => [...past.slice(-39), baseline]);
        setHistoryFuture([]);
      }
      setProjects((prev) =>
        prev.map((proj) =>
          proj.id !== activeProject.id
            ? proj
            : {
                ...proj,
                updatedAt: Date.now(),
                objects: proj.objects.map((o) =>
                  o.id === id ? { ...o, position: pos, rotation: rot, scale } : o,
                ),
              },
        ),
      );
      triggerTouchHaptic(settings.hapticsEnabled);
    },
    [activeProject.id, settings.hapticsEnabled],
  );

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedObject) return;
    const copy: SceneObjectData = {
      ...cloneObjects([selectedObject])[0],
      id: nextId('obj'),
      name: `${selectedObject.name} Copy`,
      position: {
        x: selectedObject.position.x + 0.5,
        y: selectedObject.position.y,
        z: selectedObject.position.z + 0.5,
      },
    };
    applyObjectsChange((objs) => [...objs, copy], true);
    setSelectedId(copy.id);
    triggerTouchHaptic(settings.hapticsEnabled);
    showStatus(`Duplicated ${selectedObject.name}`);
  }, [selectedObject, applyObjectsChange, settings.hapticsEnabled, showStatus]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedObject) return;
    const removedName = selectedObject.name;
    applyObjectsChange((objs) => objs.filter((o) => o.id !== selectedObject.id), true);
    setSelectedId(null);
    triggerTouchHaptic(settings.hapticsEnabled);
    showStatus(`Deleted ${removedName}`);
  }, [selectedObject, applyObjectsChange, settings.hapticsEnabled, showStatus]);

  const handleMirrorSelected = useCallback(() => {
    if (!selectedObject) return;
    const mirrored: SceneObjectData = {
      ...cloneObjects([selectedObject])[0],
      id: nextId('obj'),
      name: `${selectedObject.name} Mirrored`,
      position: {
        x: -selectedObject.position.x,
        y: selectedObject.position.y,
        z: selectedObject.position.z,
      },
      rotation: {
        x: selectedObject.rotation.x,
        y: -selectedObject.rotation.y,
        z: -selectedObject.rotation.z,
      },
    };
    applyObjectsChange((objs) => [...objs, mirrored], true);
    setSelectedId(mirrored.id);
    showStatus(`Mirrored ${selectedObject.name} across X`);
  }, [selectedObject, applyObjectsChange, showStatus]);

  const handleSnapToFloor = useCallback(() => {
    if (!selectedObject || selectedObject.locked) return;
    const halfH = Math.max(0.05, selectedObject.scale.y * 0.5);
    applyObjectsChange(
      (objs) =>
        objs.map((o) =>
          o.id === selectedObject.id
            ? { ...o, position: { ...o.position, y: Math.round(halfH * 1000) / 1000 } }
            : o,
        ),
      true,
    );
    showStatus('Snapped to floor plane');
  }, [selectedObject, applyObjectsChange, showStatus]);

  const handleUndo = useCallback(() => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((past) => past.slice(0, -1));
    setHistoryFuture((future) => [cloneObjects(activeProject.objects), ...future.slice(0, 39)]);
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id ? { ...p, updatedAt: Date.now(), objects: previous } : p,
      ),
    );
    triggerTouchHaptic(settings.hapticsEnabled);
  }, [historyPast, activeProject.id, activeProject.objects, settings.hapticsEnabled]);

  const handleRedo = useCallback(() => {
    if (historyFuture.length === 0) return;
    const nextState = historyFuture[0];
    setHistoryFuture((future) => future.slice(1));
    setHistoryPast((past) => [...past.slice(-39), cloneObjects(activeProject.objects)]);
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id ? { ...p, updatedAt: Date.now(), objects: nextState } : p,
      ),
    );
    triggerTouchHaptic(settings.hapticsEnabled);
  }, [historyFuture, activeProject.id, activeProject.objects, settings.hapticsEnabled]);

  const handleSaveProject = useCallback(() => {
    const json = JSON.stringify(activeProject, null, 2);
    const fileName = `${activeProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.wmod.json`;
    const fileItem: StoredFileItem = {
      id: `file-${activeProject.id}`,
      name: fileName,
      format: 'wmod',
      sizeBytes: new Blob([json]).size,
      createdAt: activeProject.createdAt,
      updatedAt: Date.now(),
      triangleCount: activeProject.objects.length * 420,
      objectCount: activeProject.objects.length,
      contentText: json,
      projectId: activeProject.id,
    };
    setFiles((prev) => {
      const without = prev.filter((f) => f.id !== fileItem.id);
      return [fileItem, ...without];
    });
    triggerTouchHaptic(settings.hapticsEnabled);
    showStatus(`Saved ${activeProject.name}`);
  }, [activeProject, settings.hapticsEnabled, showStatus]);

  const handleExportRecord = useCallback(
    async (
      format: 'glb' | 'obj' | 'stl' | 'dff' | 'txd' | 'wmod' | 'png',
      blob: Blob,
      filename: string,
      stats: SceneStats,
    ) => {
      downloadBlob(blob, filename);

      // Also catalog in WMODELER File Manager
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = typeof reader.result === 'string' ? reader.result : undefined;
        const item: StoredFileItem = {
          id: nextId('file'),
          name: filename,
          format,
          sizeBytes: blob.size,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          triangleCount: stats.triangleCount,
          objectCount: stats.objectCount,
          contentBase64: base64,
          projectId: activeProject.id,
        };
        setFiles((prev) => [item, ...prev]);
      };
      reader.readAsDataURL(blob);

      triggerTouchHaptic(settings.hapticsEnabled);
      showStatus(`Exported ${filename}`);
    },
    [activeProject.id, settings.hapticsEnabled, showStatus],
  );

  const linkMatchingTextures = useCallback(
    (objs: SceneObjectData[], texPool: TextureAsset[]): SceneObjectData[] => {
      return objs.map((obj) => {
        if (obj.material.textureId || !obj.requestedTextureName) return obj;
        const target = obj.requestedTextureName.toLowerCase();
        const found = texPool.find(
          (t) =>
            t.name.toLowerCase() === target ||
            t.name.toLowerCase().replace(/[^a-z0-9]/g, '') === target.replace(/[^a-z0-9]/g, ''),
        );
        if (!found) return obj;
        return {
          ...obj,
          material: {
            ...obj.material,
            textureId: found.id,
            roughness: found.roughnessHint,
            metalness: found.metalnessHint,
          },
        };
      });
    },
    [],
  );

  const handleImportFile = useCallback(
    async (file: File): Promise<'model' | 'txd'> => {
      try {
        const imported = await parseImportedFile(file);

        // Handle TXD Texture Dictionary import -> extract PNGs to Texture Manager & auto-bind
        if (imported.textures && imported.textures.length > 0) {
          const nextPool = [...imported.textures, ...allTextures];
          setCustomTextures((prev) => [...imported.textures!, ...prev]);
          setProjects((prev) =>
            prev.map((proj) =>
              proj.id === activeProject.id
                ? {
                    ...proj,
                    updatedAt: Date.now(),
                    objects: linkMatchingTextures(proj.objects, nextPool),
                  }
                : proj,
            ),
          );
          showStatus(`Extracted ${imported.textures.length} PNG texture(s) from ${file.name}`);
          return 'txd';
        }

        const linkedObjects = linkMatchingTextures(imported.objects, allTextures);

        if (imported.projectName) {
          const newProj: WModelerProject = {
            id: nextId('proj'),
            name: imported.projectName,
            description: `Imported from ${file.name}`,
            templateId: 'imported',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            objects: linkedObjects,
          };
          setProjects((prev) => [newProj, ...prev]);
          setActiveProjectId(newProj.id);
          setSelectedId(linkedObjects[0]?.id || null);
          setHistoryPast([]);
          setHistoryFuture([]);
        } else {
          applyObjectsChange((objs) => [...objs, ...linkedObjects], true);
          setSelectedId(linkedObjects[0]?.id || null);
        }
        showStatus(`Imported ${file.name}`);
        return 'model';
      } catch (err) {
        showStatus(err instanceof Error ? err.message : 'Failed to import file');
        return 'model';
      }
    },
    [activeProject.id, allTextures, applyObjectsChange, linkMatchingTextures, showStatus],
  );

  const handleCreateProject = useCallback(
    (name: string, templateId: string) => {
      const tpl = PROJECT_TEMPLATES.find((t) => t.id === templateId) || PROJECT_TEMPLATES[0];
      const objs = tpl.buildObjects();
      const newProj: WModelerProject = {
        id: nextId('proj'),
        name,
        description: tpl.description,
        templateId: tpl.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        objects: objs,
      };
      setProjects((prev) => [newProj, ...prev]);
      setActiveProjectId(newProj.id);
      setSelectedId(objs[0]?.id || null);
      setHistoryPast([]);
      setHistoryFuture([]);
      requestLandscapeOrientation().catch(() => {});
      setManualView('workspace');
      showStatus(`Created ${name}`);
    },
    [showStatus],
  );

  const handleEnterWorkspace = useCallback(
    (projectId?: string) => {
      if (projectId) {
        const found = projects.find((p) => p.id === projectId);
        if (found) {
          setActiveProjectId(found.id);
          setSelectedId(found.objects[0]?.id || null);
          setHistoryPast([]);
          setHistoryFuture([]);
        }
      }
      requestLandscapeOrientation().catch(() => {});
      setManualView(isPhysicalLandscape && settings.displayOverride === 'auto' ? null : 'workspace');
    },
    [projects, isPhysicalLandscape, settings.displayOverride],
  );

  const handleOpenStoredFile = useCallback(
    async (file: StoredFileItem) => {
      try {
        if (file.projectId) {
          const linked = projects.find((p) => p.id === file.projectId);
          if (linked && file.format === 'wmod') {
            handleEnterWorkspace(linked.id);
            return;
          }
        }
        if (file.contentText) {
          const blob = new Blob([file.contentText], { type: 'application/json' });
          const kind = await handleImportFile(new File([blob], file.name));
          if (kind === 'model') handleEnterWorkspace();
          return;
        }
        if (file.contentBase64) {
          const res = await fetch(file.contentBase64);
          const blob = await res.blob();
          const kind = await handleImportFile(new File([blob], file.name));
          if (kind === 'model') handleEnterWorkspace();
        }
      } catch {
        showStatus(`Could not open ${file.name}`);
      }
    },
    [projects, handleEnterWorkspace, handleImportFile, showStatus],
  );

  const handleDownloadStoredFile = useCallback(
    async (file: StoredFileItem) => {
      if (file.contentText) {
        downloadBlob(new Blob([file.contentText], { type: 'application/json' }), file.name);
        showStatus(`Downloaded ${file.name}`);
        return;
      }
      if (file.contentBase64) {
        const res = await fetch(file.contentBase64);
        const blob = await res.blob();
        downloadBlob(blob, file.name);
        showStatus(`Downloaded ${file.name}`);
      }
    },
    [showStatus],
  );

  const handleUploadTexture = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => {
          const tex: TextureAsset = {
            id: nextId('tex'),
            name: file.name.replace(/\.[^.]+$/, ''),
            category: 'Custom',
            isBuiltIn: false,
            resolution: `${img.naturalWidth}×${img.naturalHeight}`,
            dataUrl,
            roughnessHint: 0.45,
            metalnessHint: 0.05,
            createdAt: Date.now(),
          };
          setCustomTextures((prev) => [tex, ...prev]);
          showStatus(`Added texture ${tex.name}`);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [showStatus],
  );

  const handleApplyTextureToSelected = useCallback(
    (texture: TextureAsset) => {
      const target = selectedObject || activeProject.objects[0];
      if (!target) {
        showStatus('Add an object first before applying a texture');
        return;
      }
      applyObjectsChange(
        (objs) =>
          objs.map((o) =>
            o.id === target.id
              ? {
                  ...o,
                  material: {
                    ...o.material,
                    textureId: texture.id,
                    roughness: texture.roughnessHint,
                    metalness: texture.metalnessHint,
                  },
                }
              : o,
          ),
        true,
      );
      setSelectedId(target.id);
      showStatus(`Applied ${texture.name} to ${target.name}`);
    },
    [selectedObject, activeProject.objects, applyObjectsChange, showStatus],
  );

  const handleResetScene = useCallback(() => {
    const tpl =
      PROJECT_TEMPLATES.find((t) => t.id === activeProject.templateId) || PROJECT_TEMPLATES[0];
    const resetObjs = tpl.buildObjects();
    applyObjectsChange(() => resetObjs, true);
    setSelectedId(resetObjs[0]?.id || null);
    showStatus('Reset scene to template defaults');
  }, [activeProject.templateId, applyObjectsChange, showStatus]);

  const handleClearCache = useCallback(async () => {
    await clearWModelerCache();
    const freshProjs = createInitialProjects();
    setProjects(freshProjs);
    setActiveProjectId(freshProjs[0].id);
    setSelectedId(freshProjs[0].objects[0]?.id || null);
    setFiles(createInitialFiles(freshProjs));
    setCustomTextures([]);
    setSettings(DEFAULT_APP_SETTINGS);
    setHistoryPast([]);
    setHistoryFuture([]);
    showStatus('Local storage reset to factory defaults');
  }, [showStatus]);

  // Determine active display mode: Landscape Workspace vs Portrait Dashboard
  const activeDisplayMode: 'landscape' | 'portrait' = useMemo(() => {
    if (manualView === 'workspace') return 'landscape';
    if (manualView === 'manager') return 'portrait';
    if (settings.displayOverride === 'landscape') return 'landscape';
    if (settings.displayOverride === 'portrait') return 'portrait';
    return isPhysicalLandscape ? 'landscape' : 'portrait';
  }, [manualView, settings.displayOverride, isPhysicalLandscape]);

  return (
    <>
      {activeDisplayMode === 'landscape' ? (
        <LandscapeWorkspace
          project={activeProject}
          selectedId={selectedId}
          onSelectObject={handleSelectObject}
          onAddPrimitive={handleAddPrimitive}
          onUpdateObject={handleUpdateObject}
          onTransformLive={handleTransformLive}
          onTransformCommit={handleTransformCommit}
          onDuplicateSelected={handleDuplicateSelected}
          onDeleteSelected={handleDeleteSelected}
          onMirrorSelected={handleMirrorSelected}
          onSnapToFloor={handleSnapToFloor}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyPast.length > 0}
          canRedo={historyFuture.length > 0}
          settings={settings}
          onUpdateSettings={updateSettings}
          textures={allTextures}
          onSaveProject={handleSaveProject}
          onImportFile={handleImportFile}
          onExportRecord={handleExportRecord}
          onOpenDashboard={() => {
            setPortraitTab('dashboard');
            setManualView('manager');
          }}
          onOpenSettings={() => {
            setPortraitTab('settings');
            setManualView('manager');
          }}
          onResetScene={handleResetScene}
          statusMessage={statusMessage}
        />
      ) : (
        <PortraitDashboard
          activeTab={portraitTab}
          onTabChange={setPortraitTab}
          projects={projects}
          activeProject={activeProject}
          selectedObjectName={selectedObject?.name || null}
          files={files}
          textures={allTextures}
          settings={settings}
          onUpdateSettings={updateSettings}
          onEnterWorkspace={handleEnterWorkspace}
          onCreateProject={handleCreateProject}
          onDuplicateProject={(id) => {
            const src = projects.find((p) => p.id === id);
            if (!src) return;
            const copy: WModelerProject = {
              ...src,
              id: nextId('proj'),
              name: `${src.name} Copy`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              objects: cloneObjects(src.objects).map((o) => ({ ...o, id: nextId('obj') })),
            };
            setProjects((prev) => [copy, ...prev]);
            showStatus(`Duplicated ${src.name}`);
          }}
          onDeleteProject={(id) => {
            if (projects.length <= 1) return;
            const remaining = projects.filter((p) => p.id !== id);
            setProjects(remaining);
            if (activeProjectId === id) {
              setActiveProjectId(remaining[0].id);
              setSelectedId(remaining[0].objects[0]?.id || null);
            }
            showStatus('Deleted project');
          }}
          onRenameProject={(id, name) => {
            setProjects((prev) =>
              prev.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p)),
            );
            showStatus(`Renamed to ${name}`);
          }}
          onImportModelFile={async (file) => {
            const kind = await handleImportFile(file);
            if (kind === 'model') {
              handleEnterWorkspace();
            } else {
              setPortraitTab('textures');
            }
          }}
          onImportTXDFile={async (file) => {
            await handleImportFile(file);
          }}
          onExportTXDArchive={async () => {
            try {
              const packList =
                customTextures.length > 0 ? customTextures : allTextures.slice(0, 8);
              const txdBytes = await exportTexturesToTXD(packList);
              const slug =
                activeProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'wmodeler';
              const blob = new Blob([txdBytes.slice().buffer], {
                type: 'application/octet-stream',
              });
              await handleExportRecord('txd', blob, `${slug}.txd`, {
                objectCount: activeProject.objects.length,
                triangleCount: 0,
                vertexCount: 0,
              });
            } catch (err) {
              showStatus(err instanceof Error ? err.message : 'TXD export failed');
            }
          }}
          onDownloadTexturePNG={async (tex) => {
            const res = await fetch(tex.dataUrl);
            const blob = await res.blob();
            const safe = tex.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'texture';
            downloadBlob(blob, `${safe}.png`);
            showStatus(`Downloaded ${safe}.png`);
          }}
          onOpenStoredFile={handleOpenStoredFile}
          onDownloadStoredFile={handleDownloadStoredFile}
          onDeleteStoredFile={(id) => {
            setFiles((prev) => prev.filter((f) => f.id !== id));
            showStatus('Removed file from storage');
          }}
          onUploadTexture={handleUploadTexture}
          onApplyTextureToSelected={handleApplyTextureToSelected}
          onDeleteCustomTexture={(id) => {
            setCustomTextures((prev) => prev.filter((t) => t.id !== id));
            showStatus('Deleted custom texture');
          }}
          onClearCache={handleClearCache}
          statusMessage={statusMessage}
        />
      )}
      <StartupAdModal open={showStartupAd} onDismiss={handleDismissStartupAd} />
      <OfflineIndicator />
    </>
  );
}
