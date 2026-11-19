import { AppSettings, StoredFileItem, TextureAsset, WModelerProject } from '../types/modeler';

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    Haptics?: { impact?: (opts: { style: string }) => Promise<void> };
    ScreenOrientation?: {
      lock?: (opts: { orientation: string }) => Promise<void>;
      unlock?: () => Promise<void>;
    };
  };
}

function getCapacitor(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNativeAndroid(): boolean {
  const cap = getCapacitor();
  if (!cap) return false;
  return Boolean(cap.isNativePlatform?.() && cap.getPlatform?.() === 'android');
}

export function getRuntimeEnvironmentLabel(): string {
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.()) {
    return `Capacitor Native (${cap.getPlatform?.() || 'android'})`;
  }
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) {
    return 'Android WebView / Mobile Browser';
  }
  return 'Web Studio (Capacitor Ready)';
}

export function triggerTouchHaptic(enabled: boolean): void {
  if (!enabled) return;
  const cap = getCapacitor();
  if (cap?.Plugins?.Haptics?.impact) {
    cap.Plugins.Haptics.impact({ style: 'LIGHT' }).catch(() => {});
    return;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(8);
    } catch {
      // Ignore vibration errors in restricted frames
    }
  }
}

export async function requestLandscapeOrientation(): Promise<boolean> {
  const cap = getCapacitor();
  if (cap?.Plugins?.ScreenOrientation?.lock) {
    try {
      await cap.Plugins.ScreenOrientation.lock({ orientation: 'landscape' });
      return true;
    } catch {
      return false;
    }
  }
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  if (orientation && typeof orientation.lock === 'function') {
    try {
      await orientation.lock('landscape');
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function releaseOrientationLock(): Promise<void> {
  const cap = getCapacitor();
  if (cap?.Plugins?.ScreenOrientation?.unlock) {
    try {
      await cap.Plugins.ScreenOrientation.unlock();
      return;
    } catch {
      // ignore
    }
  }
  const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
  if (orientation && typeof orientation.unlock === 'function') {
    try {
      orientation.unlock();
    } catch {
      // ignore
    }
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 250);
}

// IndexedDB persistence suitable for both Web and Capacitor Android WebView
const DB_NAME = 'wmodeler_storage_v1';
const DB_VERSION = 1;
const STORES = {
  projects: 'projects',
  files: 'files',
  textures: 'textures',
  meta: 'meta',
} as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.projects)) {
        db.createObjectStore(STORES.projects, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.files)) {
        db.createObjectStore(STORES.files, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.textures)) {
        db.createObjectStore(STORES.textures, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDB();
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as T[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function putManyToStore<T>(storeName: string, items: T[]): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback ignored if storage unavailable
  }
}

export async function loadPersistedProjects(): Promise<WModelerProject[]> {
  const list = await getAllFromStore<WModelerProject>(STORES.projects);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function savePersistedProjects(projects: WModelerProject[]): Promise<void> {
  await putManyToStore(STORES.projects, projects);
}

export async function loadPersistedFiles(): Promise<StoredFileItem[]> {
  const list = await getAllFromStore<StoredFileItem>(STORES.files);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function savePersistedFiles(files: StoredFileItem[]): Promise<void> {
  await putManyToStore(STORES.files, files);
}

export async function loadPersistedCustomTextures(): Promise<TextureAsset[]> {
  const list = await getAllFromStore<TextureAsset>(STORES.textures);
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function savePersistedCustomTextures(textures: TextureAsset[]): Promise<void> {
  await putManyToStore(STORES.textures, textures.filter((t) => !t.isBuiltIn));
}

const SETTINGS_KEY = 'wmodeler_settings_v1';

export function loadAppSettings(defaults: AppSettings): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}

export async function clearWModelerCache(): Promise<void> {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORES.projects, STORES.files, STORES.textures], 'readwrite');
      tx.objectStore(STORES.projects).clear();
      tx.objectStore(STORES.files).clear();
      tx.objectStore(STORES.textures).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}
