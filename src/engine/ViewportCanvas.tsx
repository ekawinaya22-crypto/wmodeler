import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { buildObjectGeometry } from './geometryBuilder';
import { disposeCachedTextures, resolveThreeTexture } from './proceduralTextures';
import {
  AppSettings,
  CameraPreset,
  SceneObjectData,
  SceneStats,
  ShadingMode,
  TextureAsset,
  TransformMode,
  TransformSpace,
  Vec3Tuple,
  ViewUVFitMode,
  ViewportTheme,
} from '../types/modeler';

export interface ViewportHandle {
  setCameraPreset: (preset: CameraPreset) => void;
  focusSelected: () => void;
  projectUVFromView: (objectId: string, fitMode?: ViewUVFitMode) => number[] | null;
  exportGLB: () => Promise<Blob>;
  exportOBJ: () => string;
  exportSTL: () => ArrayBuffer;
  capturePNG: () => string;
}

interface ViewportCanvasProps {
  objects: SceneObjectData[];
  selectedId: string | null;
  onSelectObject: (id: string | null) => void;
  onTransformLive: (id: string, pos: Vec3Tuple, rot: Vec3Tuple, scale: Vec3Tuple) => void;
  onTransformCommit: (id: string, pos: Vec3Tuple, rot: Vec3Tuple, scale: Vec3Tuple) => void;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  shadingMode: ShadingMode;
  touchGuard: boolean;
  settings: AppSettings;
  textures: TextureAsset[];
  onStatsChange: (stats: SceneStats) => void;
}

// Reusable math objects outside render loops (zero GC)
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();
const _box3 = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _pointerNdc = new THREE.Vector2();
const _projVert = new THREE.Vector3();

const THEME_PALETTES: Record<
  ViewportTheme,
  { bg: number; gridMajor: number; gridMinor: number; fogDensity: number }
> = {
  obsidian: { bg: 0x121418, gridMajor: 0x3b4252, gridMinor: 0x222630, fogDensity: 0.018 },
  slate: { bg: 0x17202e, gridMajor: 0x475569, gridMinor: 0x243042, fogDensity: 0.016 },
  clay: { bg: 0xdce1e8, gridMajor: 0x94a3b8, gridMinor: 0xcbd5e1, fogDensity: 0.012 },
};

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function roundNum(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function readMeshTransform(mesh: THREE.Mesh): {
  pos: Vec3Tuple;
  rot: Vec3Tuple;
  scale: Vec3Tuple;
} {
  return {
    pos: {
      x: roundNum(mesh.position.x),
      y: roundNum(mesh.position.y),
      z: roundNum(mesh.position.z),
    },
    rot: {
      x: roundNum(THREE.MathUtils.radToDeg(mesh.rotation.x)),
      y: roundNum(THREE.MathUtils.radToDeg(mesh.rotation.y)),
      z: roundNum(THREE.MathUtils.radToDeg(mesh.rotation.z)),
    },
    scale: {
      x: roundNum(Math.max(0.02, mesh.scale.x)),
      y: roundNum(Math.max(0.02, mesh.scale.y)),
      z: roundNum(Math.max(0.02, mesh.scale.z)),
    },
  };
}

export const ViewportCanvas = forwardRef<ViewportHandle, ViewportCanvasProps>(
  function ViewportCanvas(props, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [contextLost, setContextLost] = useState(false);

    // Keep latest callbacks/props in refs so WebGL lifecycle never tears down
    const propsRef = useRef(props);
    propsRef.current = props;

    const engineRef = useRef<{
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      renderer: THREE.WebGLRenderer;
      orbit: OrbitControls;
      transform: TransformControls;
      modelGroup: THREE.Group;
      meshMap: Map<string, THREE.Mesh>;
      sigMap: Map<string, string>;
      selectionBox: THREE.BoxHelper | null;
      gridHelper: THREE.GridHelper | null;
      shadowPlane: THREE.Mesh;
      requestRender: () => void;
      startCameraTransition: (pos: THREE.Vector3, target: THREE.Vector3) => void;
      isSoftwareGl: boolean;
    } | null>(null);

    // Initialize Three.js scene once
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareWebGL();
      const width = Math.max(container.clientWidth, 300);
      const height = Math.max(container.clientHeight, 200);

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.touchAction = 'none';

      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const theme = THEME_PALETTES[propsRef.current.settings.viewportTheme] || THEME_PALETTES.obsidian;
      scene.background = new THREE.Color(theme.bg);
      scene.fog = new THREE.FogExp2(theme.bg, theme.fogDensity);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      pmrem.dispose();

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.08, 250);
      camera.position.set(4.8, 3.6, 5.4);

      // 3-Point Studio Lighting Rig
      const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.72);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
      keyLight.position.set(6.5, 9.5, 5.5);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 30;
      keyLight.shadow.camera.left = -8;
      keyLight.shadow.camera.right = 8;
      keyLight.shadow.camera.top = 8;
      keyLight.shadow.camera.bottom = -8;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.85);
      rimLight.position.set(-6, 4.5, -5.5);
      scene.add(rimLight);

      // Subtle floor shadow catcher
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.ShadowMaterial({ opacity: 0.34 }),
      );
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = -0.002;
      shadowPlane.receiveShadow = true;
      scene.add(shadowPlane);

      const gridSize = propsRef.current.settings.gridSize || 16;
      const gridHelper = new THREE.GridHelper(
        gridSize,
        gridSize,
        theme.gridMajor,
        theme.gridMinor,
      );
      gridHelper.position.y = 0.001;
      gridHelper.visible = propsRef.current.settings.gridVisible;
      scene.add(gridHelper);

      const modelGroup = new THREE.Group();
      modelGroup.name = 'WMODELER_SCENE';
      scene.add(modelGroup);

      // OrbitControls tuned for Android touchscreens
      const orbit = new OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = !isSoftwareGl;
      orbit.dampingFactor = 0.08;
      orbit.rotateSpeed = 0.85;
      orbit.zoomSpeed = 1.05;
      orbit.panSpeed = 0.85;
      orbit.minDistance = 1.1;
      orbit.maxDistance = 65;
      orbit.maxPolarAngle = Math.PI * 0.88;
      orbit.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
      orbit.target.set(0, 0.75, 0);
      orbit.update();

      // TransformControls for touchscreen gizmo editing
      const transform = new TransformControls(camera, renderer.domElement);
      transform.setSize(propsRef.current.settings.gizmoSize || 1.25);
      const transformHelper = transform.getHelper();
      scene.add(transformHelper);

      // On-demand render scheduler + smooth camera damping
      let frameId = 0;
      let renderBusy = false;
      let renderDirty = false;
      let cameraTransitionActive = false;
      let lastTime = performance.now();

      function afterDraw(cb: () => void) {
        try {
          const gl = renderer.getContext() as WebGL2RenderingContext;
          if (typeof gl.fenceSync === 'function') {
            const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            gl.flush();
            const poll = () => {
              const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
              if (state === gl.UNSIGNALED) {
                frameId = window.setTimeout(poll, 5);
              } else {
                if (sync) gl.deleteSync(sync);
                frameId = window.setTimeout(cb, 80);
              }
            };
            frameId = window.setTimeout(poll, 5);
            return;
          }
        } catch {
          // fallback if fenceSync unavailable
        }
        frameId = window.setTimeout(cb, 80);
      }

      function requestRender() {
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = requestAnimationFrame((now) => {
          renderDirty = false;
          const dt = Math.min((now - lastTime) / 1000, 0.05);
          lastTime = now;

          if (cameraTransitionActive) {
            const lambda = 10;
            camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoalPos.x, lambda, dt);
            camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoalPos.y, lambda, dt);
            camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoalPos.z, lambda, dt);
            orbit.target.x = THREE.MathUtils.damp(orbit.target.x, _camGoalTarget.x, lambda, dt);
            orbit.target.y = THREE.MathUtils.damp(orbit.target.y, _camGoalTarget.y, lambda, dt);
            orbit.target.z = THREE.MathUtils.damp(orbit.target.z, _camGoalTarget.z, lambda, dt);

            const settled =
              camera.position.distanceTo(_camGoalPos) < 0.015 &&
              orbit.target.distanceTo(_camGoalTarget) < 0.015;
            if (settled) {
              camera.position.copy(_camGoalPos);
              orbit.target.copy(_camGoalTarget);
              cameraTransitionActive = false;
            } else {
              renderDirty = true;
            }
          }

          const orbitMoving = orbit.update();
          if (orbitMoving && orbit.enableDamping) {
            renderDirty = true;
          }

          if (engineRef.current?.selectionBox) {
            engineRef.current.selectionBox.update();
          }

          renderer.render(scene, camera);

          const done = () => {
            renderBusy = false;
            if (renderDirty) requestRender();
          };
          if (isSoftwareGl) afterDraw(done);
          else done();
        });
      }

      function startCameraTransition(pos: THREE.Vector3, target: THREE.Vector3) {
        _camGoalPos.copy(pos);
        _camGoalTarget.copy(target);
        if (isSoftwareGl) {
          camera.position.copy(pos);
          orbit.target.copy(target);
          cameraTransitionActive = false;
          requestRender();
        } else {
          cameraTransitionActive = true;
          lastTime = performance.now();
          requestRender();
        }
      }

      orbit.addEventListener('start', () => {
        cameraTransitionActive = false;
      });
      orbit.addEventListener('change', () => {
        requestRender();
      });

      // TransformControls events
      let isGizmoDragging = false;
      transform.addEventListener('dragging-changed', (event) => {
        const dragging = Boolean((event as { value: unknown }).value);
        isGizmoDragging = dragging;
        orbit.enabled = !dragging;
        if (!dragging && transform.object && transform.object instanceof THREE.Mesh) {
          const objId = transform.object.userData.objectId as string | undefined;
          if (objId) {
            const tr = readMeshTransform(transform.object);
            propsRef.current.onTransformCommit(objId, tr.pos, tr.rot, tr.scale);
          }
        }
        requestRender();
      });

      transform.addEventListener('objectChange', () => {
        if (transform.object && transform.object instanceof THREE.Mesh) {
          const objId = transform.object.userData.objectId as string | undefined;
          if (objId) {
            const tr = readMeshTransform(transform.object);
            propsRef.current.onTransformLive(objId, tr.pos, tr.rot, tr.scale);
          }
        }
        requestRender();
      });

      transform.addEventListener('change', () => {
        requestRender();
      });

      // Touch-safe pointer selection with drag deadzone & multi-touch guard
      const raycaster = new THREE.Raycaster();
      const activePointers = new Set<number>();
      let pointerDownX = 0;
      let pointerDownY = 0;
      let pointerMovedDist = 0;
      let multiTouchGesture = false;
      let trackingPointerId: number | null = null;

      const onPointerDown = (e: PointerEvent) => {
        activePointers.add(e.pointerId);
        if (activePointers.size > 1) {
          multiTouchGesture = true;
          trackingPointerId = null;
          return;
        }
        multiTouchGesture = false;
        trackingPointerId = e.pointerId;
        pointerDownX = e.clientX;
        pointerDownY = e.clientY;
        pointerMovedDist = 0;
      };

      const onPointerMove = (e: PointerEvent) => {
        if (trackingPointerId !== e.pointerId) return;
        const dx = e.clientX - pointerDownX;
        const dy = e.clientY - pointerDownY;
        pointerMovedDist = Math.max(pointerMovedDist, Math.hypot(dx, dy));
      };

      const onPointerUp = (e: PointerEvent) => {
        activePointers.delete(e.pointerId);
        if (activePointers.size === 0 && multiTouchGesture) {
          multiTouchGesture = false;
          trackingPointerId = null;
          return;
        }
        if (trackingPointerId !== e.pointerId) return;
        trackingPointerId = null;

        const deadzone = propsRef.current.settings.touchDeadzonePx || 6;
        if (pointerMovedDist > deadzone || isGizmoDragging || transform.axis !== null) {
          return;
        }

        const rect = renderer.domElement.getBoundingClientRect();
        _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(_pointerNdc, camera);
        const meshes = Array.from(engineRef.current?.meshMap.values() || []).filter(
          (m) => m.visible,
        );
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const hitId = hits[0].object.userData.objectId as string | undefined;
          if (hitId) {
            const targetData = propsRef.current.objects.find((o) => o.id === hitId);
            if (targetData?.locked && propsRef.current.touchGuard) {
              return;
            }
            propsRef.current.onSelectObject(hitId);
          }
        } else if (!propsRef.current.touchGuard) {
          propsRef.current.onSelectObject(null);
        }
      };

      const onPointerCancel = (e: PointerEvent) => {
        activePointers.delete(e.pointerId);
        if (activePointers.size === 0) {
          multiTouchGesture = false;
          trackingPointerId = null;
        }
      };

      const domEl = renderer.domElement;
      domEl.addEventListener('pointerdown', onPointerDown);
      domEl.addEventListener('pointermove', onPointerMove);
      domEl.addEventListener('pointerup', onPointerUp);
      domEl.addEventListener('pointercancel', onPointerCancel);

      const onContextLost = (ev: Event) => {
        ev.preventDefault();
        setContextLost(true);
      };
      const onContextRestored = () => {
        setContextLost(false);
        requestRender();
      };
      domEl.addEventListener('webglcontextlost', onContextLost);
      domEl.addEventListener('webglcontextrestored', onContextRestored);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.max(entry.contentRect.width, 100);
          const h = Math.max(entry.contentRect.height, 100);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          requestRender();
        }
      });
      resizeObserver.observe(container);

      engineRef.current = {
        scene,
        camera,
        renderer,
        orbit,
        transform,
        modelGroup,
        meshMap: new Map(),
        sigMap: new Map(),
        selectionBox: null,
        gridHelper,
        shadowPlane,
        requestRender,
        startCameraTransition,
        isSoftwareGl,
      };

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }
      requestRender();

      return () => {
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        domEl.removeEventListener('pointerdown', onPointerDown);
        domEl.removeEventListener('pointermove', onPointerMove);
        domEl.removeEventListener('pointerup', onPointerUp);
        domEl.removeEventListener('pointercancel', onPointerCancel);
        domEl.removeEventListener('webglcontextlost', onContextLost);
        domEl.removeEventListener('webglcontextrestored', onContextRestored);

        transform.detach();
        transform.dispose();
        orbit.dispose();

        engineRef.current?.meshMap.forEach((mesh) => {
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        });
        engineRef.current?.selectionBox?.dispose();
        shadowPlane.geometry.dispose();
        (shadowPlane.material as THREE.Material).dispose();
        envTex.dispose();
        disposeCachedTextures();
        renderer.dispose();
        engineRef.current = null;
      };
    }, []);

    // Sync scene objects with Three.js meshes efficiently
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      const maxAniso = eng.renderer.capabilities.getMaxAnisotropy();
      const incomingIds = new Set(props.objects.map((o) => o.id));

      // Remove deleted meshes
      for (const [id, mesh] of eng.meshMap.entries()) {
        if (!incomingIds.has(id)) {
          if (eng.transform.object === mesh) {
            eng.transform.detach();
          }
          eng.modelGroup.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else mesh.material.dispose();
          eng.meshMap.delete(id);
          eng.sigMap.delete(id);
        }
      }

      let totalTris = 0;
      let totalVerts = 0;

      for (const obj of props.objects) {
        let mesh = eng.meshMap.get(obj.id);
        const geoSig = JSON.stringify({
          t: obj.type,
          m: obj.modifiers,
          uv: obj.uvMapping || null,
          c: obj.customMesh ? obj.customMesh.positions.length : 0,
        });

        if (!mesh) {
          const geo = buildObjectGeometry(obj);
          const mat = new THREE.MeshPhysicalMaterial();
          mesh = new THREE.Mesh(geo, mat);
          mesh.name = obj.name;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.objectId = obj.id;
          eng.modelGroup.add(mesh);
          eng.meshMap.set(obj.id, mesh);
          eng.sigMap.set(obj.id, geoSig);
        } else if (eng.sigMap.get(obj.id) !== geoSig) {
          mesh.geometry.dispose();
          mesh.geometry = buildObjectGeometry(obj);
          eng.sigMap.set(obj.id, geoSig);
        }

        mesh.name = obj.name;
        mesh.visible = obj.visible;

        // Avoid overwriting active gizmo drag position if it matches
        if (!(eng.transform.dragging && eng.transform.object === mesh)) {
          mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
          mesh.rotation.set(
            THREE.MathUtils.degToRad(obj.rotation.x),
            THREE.MathUtils.degToRad(obj.rotation.y),
            THREE.MathUtils.degToRad(obj.rotation.z),
          );
          mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
        }

        // Apply material & shading mode
        if (props.shadingMode === 'normals') {
          if (!(mesh.material instanceof THREE.MeshNormalMaterial)) {
            if (mesh.material instanceof THREE.Material) mesh.material.dispose();
            mesh.material = new THREE.MeshNormalMaterial({
              flatShading: obj.material.flatShading,
            });
          } else {
            mesh.material.flatShading = obj.material.flatShading;
            mesh.material.needsUpdate = true;
          }
        } else {
          if (!(mesh.material instanceof THREE.MeshPhysicalMaterial)) {
            if (mesh.material instanceof THREE.Material) mesh.material.dispose();
            mesh.material = new THREE.MeshPhysicalMaterial();
          }
          const mat = mesh.material as THREE.MeshPhysicalMaterial;
          mat.color.set(obj.material.color);
          mat.metalness = obj.material.metalness;
          mat.roughness = obj.material.roughness;
          mat.clearcoat = obj.material.clearcoat;
          mat.emissive.set(obj.material.emissive);
          mat.emissiveIntensity = obj.material.emissiveIntensity;
          mat.transparent = obj.material.opacity < 0.99;
          mat.opacity = obj.material.opacity;
          mat.wireframe = props.shadingMode === 'wireframe' || obj.material.wireframe;
          if (mat.flatShading !== obj.material.flatShading) {
            mat.flatShading = obj.material.flatShading;
            mat.needsUpdate = true;
          }
          const resolvedTex = resolveThreeTexture(
            obj.material.textureId,
            props.textures,
            maxAniso,
            () => eng.requestRender(),
          );
          if (mat.map !== resolvedTex) {
            mat.map = resolvedTex;
            mat.needsUpdate = true;
          }
        }

        const posCount = mesh.geometry.attributes.position?.count || 0;
        const idxCount = mesh.geometry.index?.count || 0;
        totalVerts += posCount;
        totalTris += idxCount > 0 ? Math.floor(idxCount / 3) : Math.floor(posCount / 3);
      }

      props.onStatsChange({
        objectCount: props.objects.length,
        triangleCount: totalTris,
        vertexCount: totalVerts,
      });

      eng.requestRender();
    }, [props.objects, props.shadingMode, props.textures]);

    // Sync selection outline & TransformControls attachment
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      if (eng.selectionBox) {
        eng.scene.remove(eng.selectionBox);
        eng.selectionBox.dispose();
        eng.selectionBox = null;
      }

      const selectedData = props.objects.find((o) => o.id === props.selectedId);
      const selectedMesh = props.selectedId ? eng.meshMap.get(props.selectedId) : undefined;

      if (selectedMesh && selectedData && selectedMesh.visible) {
        const boxHelper = new THREE.BoxHelper(selectedMesh, 0x3b82f6);
        eng.scene.add(boxHelper);
        eng.selectionBox = boxHelper;

        if (props.transformMode !== 'select' && !selectedData.locked) {
          eng.transform.attach(selectedMesh);
          eng.transform.setMode(props.transformMode);
        } else {
          eng.transform.detach();
        }
      } else {
        eng.transform.detach();
      }

      eng.requestRender();
    }, [props.selectedId, props.transformMode, props.objects]);

    // Sync TransformControls space, snap, gizmo size, grid & theme
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      eng.transform.setSpace(props.transformSpace);
      eng.transform.setSize(props.settings.gizmoSize);

      if (props.settings.snapEnabled) {
        const inc = props.settings.snapIncrement;
        eng.transform.setTranslationSnap(inc);
        eng.transform.setRotationSnap(THREE.MathUtils.degToRad(15));
        eng.transform.setScaleSnap(0.1);
      } else {
        eng.transform.setTranslationSnap(null);
        eng.transform.setRotationSnap(null);
        eng.transform.setScaleSnap(null);
      }

      const theme = THEME_PALETTES[props.settings.viewportTheme] || THEME_PALETTES.obsidian;
      eng.scene.background = new THREE.Color(theme.bg);
      eng.scene.fog = new THREE.FogExp2(theme.bg, theme.fogDensity);

      if (eng.gridHelper) {
        eng.scene.remove(eng.gridHelper);
        eng.gridHelper.dispose();
      }
      const nextGrid = new THREE.GridHelper(
        props.settings.gridSize,
        props.settings.gridSize,
        theme.gridMajor,
        theme.gridMinor,
      );
      nextGrid.position.y = 0.001;
      nextGrid.visible = props.settings.gridVisible;
      eng.scene.add(nextGrid);
      eng.gridHelper = nextGrid;

      eng.requestRender();
    }, [
      props.transformSpace,
      props.settings.gizmoSize,
      props.settings.snapEnabled,
      props.settings.snapIncrement,
      props.settings.viewportTheme,
      props.settings.gridSize,
      props.settings.gridVisible,
    ]);

    useImperativeHandle(ref, () => ({
      setCameraPreset(preset: CameraPreset) {
        const eng = engineRef.current;
        if (!eng) return;
        const target = new THREE.Vector3(0, 0.75, 0);
        const pos = new THREE.Vector3(4.8, 3.6, 5.4);
        switch (preset) {
          case 'top':
            pos.set(0, 9.5, 0.01);
            break;
          case 'front':
            pos.set(0, 1.4, 8.5);
            break;
          case 'side':
            pos.set(8.5, 1.4, 0);
            break;
          case 'isometric':
            pos.set(5.5, 5.5, 5.5);
            break;
          case 'perspective':
          default:
            pos.set(4.8, 3.6, 5.4);
            break;
        }
        eng.startCameraTransition(pos, target);
      },

      focusSelected() {
        const eng = engineRef.current;
        if (!eng) return;
        const selectedMesh = propsRef.current.selectedId
          ? eng.meshMap.get(propsRef.current.selectedId)
          : undefined;
        if (selectedMesh) {
          _box3.setFromObject(selectedMesh);
        } else {
          _box3.setFromObject(eng.modelGroup);
        }
        if (_box3.isEmpty()) {
          eng.startCameraTransition(new THREE.Vector3(4.8, 3.6, 5.4), new THREE.Vector3(0, 0.75, 0));
          return;
        }
        _box3.getCenter(_center);
        _box3.getSize(_size);
        const maxDim = Math.max(_size.x, _size.y, _size.z, 1.2);
        const dist = maxDim * 2.4;
        const dir = eng.camera.position.clone().sub(eng.orbit.target).normalize();
        if (dir.lengthSq() < 0.01) dir.set(0.6, 0.5, 0.7).normalize();
        const goalPos = _center.clone().add(dir.multiplyScalar(dist));
        eng.startCameraTransition(goalPos, _center.clone());
      },

      projectUVFromView(objectId: string, fitMode: ViewUVFitMode = 'aspect-bounds'): number[] | null {
        const eng = engineRef.current;
        if (!eng) return null;
        const mesh = eng.meshMap.get(objectId);
        if (!mesh) return null;

        const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count === 0) return null;

        eng.camera.updateMatrixWorld(true);
        mesh.updateMatrixWorld(true);

        const count = posAttr.count;
        const rawX = new Float32Array(count);
        const rawY = new Float32Array(count);
        const aspect = Math.max(0.1, eng.camera.aspect || 1);

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        for (let i = 0; i < count; i++) {
          _projVert.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
          _projVert.project(eng.camera);

          if (fitMode === 'screen-frame') {
            rawX[i] = _projVert.x * 0.5 + 0.5;
            rawY[i] = _projVert.y * 0.5 + 0.5;
          } else {
            // Multiply X by camera.aspect so the projected UV shape matches the true visual aspect on screen
            const px = _projVert.x * aspect * 0.5;
            const py = _projVert.y * 0.5;
            rawX[i] = px;
            rawY[i] = py;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
        }

        const out = new Array<number>(count * 2);

        if (fitMode === 'screen-frame') {
          for (let i = 0; i < count; i++) {
            out[i * 2] = Math.round(rawX[i] * 10000) / 10000;
            out[i * 2 + 1] = Math.round(rawY[i] * 10000) / 10000;
          }
          return out;
        }

        const spanX = Math.max(0.0001, maxX - minX);
        const spanY = Math.max(0.0001, maxY - minY);

        if (fitMode === 'stretch-bounds') {
          for (let i = 0; i < count; i++) {
            out[i * 2] = Math.round(((rawX[i] - minX) / spanX) * 10000) / 10000;
            out[i * 2 + 1] = Math.round(((rawY[i] - minY) / spanY) * 10000) / 10000;
          }
          return out;
        }

        // 'aspect-bounds' (Blender Project From View keeping exact visual silhouette proportions)
        const maxSpan = Math.max(spanX, spanY, 0.0001);
        const midX = (minX + maxX) * 0.5;
        const midY = (minY + maxY) * 0.5;
        for (let i = 0; i < count; i++) {
          const u = 0.5 + (rawX[i] - midX) / maxSpan;
          const v = 0.5 + (rawY[i] - midY) / maxSpan;
          out[i * 2] = Math.round(u * 10000) / 10000;
          out[i * 2 + 1] = Math.round(v * 10000) / 10000;
        }
        return out;
      },

      exportGLB(): Promise<Blob> {
        return new Promise((resolve, reject) => {
          const eng = engineRef.current;
          if (!eng) return reject(new Error('Viewport not initialized'));
          const exporter = new GLTFExporter();
          exporter.parse(
            eng.modelGroup,
            (result) => {
              if (result instanceof ArrayBuffer) {
                resolve(new Blob([result], { type: 'model/gltf-binary' }));
              } else {
                const json = JSON.stringify(result, null, 2);
                resolve(new Blob([json], { type: 'model/gltf+json' }));
              }
            },
            (err) => reject(err),
            { binary: true },
          );
        });
      },

      exportOBJ(): string {
        const eng = engineRef.current;
        if (!eng) return '';
        const exporter = new OBJExporter();
        return exporter.parse(eng.modelGroup);
      },

      exportSTL(): ArrayBuffer {
        const eng = engineRef.current;
        if (!eng) return new ArrayBuffer(0);
        const exporter = new STLExporter();
        const res = exporter.parse(eng.modelGroup, { binary: true });
        if (res instanceof DataView) {
          return res.buffer.slice(res.byteOffset, res.byteOffset + res.byteLength) as ArrayBuffer;
        }
        return new TextEncoder().encode(String(res)).buffer;
      },

      capturePNG(): string {
        const eng = engineRef.current;
        if (!eng) return '';
        const prevGrid = eng.gridHelper?.visible ?? true;
        const prevBox = eng.selectionBox?.visible ?? true;
        const helper = eng.transform.getHelper();
        const prevHelper = helper.visible;

        if (eng.selectionBox) eng.selectionBox.visible = false;
        helper.visible = false;
        if (eng.gridHelper) eng.gridHelper.visible = false;

        eng.renderer.render(eng.scene, eng.camera);
        const dataUrl = eng.renderer.domElement.toDataURL('image/png');

        if (eng.selectionBox) eng.selectionBox.visible = prevBox;
        helper.visible = prevHelper;
        if (eng.gridHelper) eng.gridHelper.visible = prevGrid;
        eng.requestRender();
        return dataUrl;
      },
    }));

    return (
      <div className="relative w-full h-full overflow-hidden select-none">
        <div ref={mountRef} className="w-full h-full" />
        {contextLost && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#121418]/95 p-6 text-center">
            <div className="max-w-sm rounded-xl border border-white/10 bg-[#1A1D24] p-6">
              <p className="text-base font-semibold text-white">3D Viewport Suspended</p>
              <p className="mt-2 text-sm text-slate-400">
                Graphics context was paused by the device. Restoring WebGL session automatically.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  },
);
