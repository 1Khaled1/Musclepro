/** 3D anatomy viewer: a real écorché model (BodyParts3D + Z-Anatomy, CC BY-SA,
 *  see public/models/ATTRIBUTION.txt) with muscles grouped into MusclePro's
 *  14 training groups. Orbit to inspect, tap a muscle to select its group.
 *  Renders on demand, BVH-accelerated picking, full GPU cleanup on dispose. */
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { MUSCLES, type Muscle } from '../types';

Mesh.prototype.raycast = acceleratedRaycast;

export type Theme3D = 'dark' | 'light';

const PALETTE = {
  dark: { muscle: '#7d8496', other: '#666c7c', tendon: '#b7bac3', bone: '#d8cdb8', accent: '#ff5a1a', hover: '#a9b0c2' },
  light: { muscle: '#8d94a6', other: '#767c8c', tendon: '#c4c7cf', bone: '#e0d6c3', accent: '#f0500f', hover: '#b6bdcd' },
} as const;

/** Groups that sit under other layers in the real anatomy: when one of them
 *  is lit, its covering layers turn translucent so it can be seen. */
const OCCLUDERS: Partial<Record<Muscle, string[]>> = {
  abs: ['obliques', 'tendon'], // under the external oblique aponeurosis
  lower_back: ['lats', 'tendon', 'other'], // under the latissimus / thoracolumbar fascia
};

export interface Anatomy3DOptions {
  theme: Theme3D;
  onSelect?: (m: Muscle) => void;
  labelFor?: (m: Muscle) => string;
  onProgress?: (ratio: number) => void;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class Anatomy3D {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.05, 20);
  private controls: OrbitControls;
  private root = new Group();
  private meshes: Mesh[] = [];
  private groupMaterials = new Map<string, MeshStandardMaterial>();
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private tip: HTMLDivElement;
  private theme: Theme3D;
  private selected: Muscle | null = null;
  private hovered: Muscle | null = null;
  private levels: Partial<Record<Muscle, number>> = {};
  private frame = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private downAt: { x: number; y: number } | null = null;
  private envTexture: { dispose(): void } | null = null;
  private center = new Vector3(0, 0.86, 0);

  constructor(
    private host: HTMLElement,
    private opts: Anatomy3DOptions,
  ) {
    this.theme = opts.theme;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    host.append(this.renderer.domElement);

    this.tip = document.createElement('div');
    this.tip.className = 'body-tip';
    host.append(this.tip);

    // Studio lighting: soft image-based fill plus a key light from the top-left
    // (the same light direction as the glass UI) and a cool rim from behind.
    const pmrem = new PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.envTexture = env;
    this.scene.environment = env;
    pmrem.dispose();
    this.scene.add(new HemisphereLight(0xffffff, 0x223044, 0.25));
    const key = new DirectionalLight(0xffffff, 1.35);
    key.position.set(-1.2, 2.4, 2);
    const rim = new DirectionalLight(0x9fd8ff, 0.9);
    rim.position.set(1.5, 1.8, -2.4);
    this.scene.add(key, rim);

    this.camera.position.set(0, 1.0, 4.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 5.5;
    this.controls.minPolarAngle = Math.PI * 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.82;
    this.controls.target.copy(this.center);
    this.controls.addEventListener('change', () => this.invalidate());

    this.scene.add(this.root);
    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  /** Download and set up the model. Resolves when it is on screen. */
  async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url, (e) => {
      if (e.total) this.opts.onProgress?.(e.loaded / e.total);
    });
    if (this.disposed) return;

    const model = gltf.scene;
    // BodyParts3D: millimetres, Z up, front facing −Y → metres, Y up, front +Z.
    model.rotation.x = -Math.PI / 2;
    model.scale.setScalar(0.001);
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model);
    model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    this.root.add(model);

    model.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const name = (mesh.material as Material).name || 'mp:other';
      const key = name.replace(/^mp:/, '');
      (mesh.material as Material).dispose();
      mesh.material = this.materialFor(key);
      mesh.userData.group = key;
      mesh.geometry.computeBoundsTree = computeBoundsTree;
      mesh.geometry.disposeBoundsTree = disposeBoundsTree;
      mesh.geometry.computeBoundsTree();
      this.meshes.push(mesh);
    });

    const height = new Box3().setFromObject(this.root).max.y;
    this.center.set(0, height * 0.52, 0);
    this.controls.target.copy(this.center);
    this.resize();
    this.applyColors();
  }

  setView(view: 'front' | 'back'): void {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const z = view === 'front' ? dist : -dist;
    this.camera.position.set(0, this.center.y + dist * 0.08, z);
    this.controls.update();
    this.invalidate();
  }

  setSelected(m: Muscle | null): void {
    this.selected = m;
    this.applyColors();
  }

  setLevels(levels: Partial<Record<Muscle, number>>): void {
    this.levels = levels;
    this.applyColors();
  }

  setTheme(theme: Theme3D): void {
    this.theme = theme;
    this.applyColors();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.ro.disconnect();
    this.controls.dispose();
    for (const mesh of this.meshes) {
      mesh.geometry.disposeBoundsTree?.();
      mesh.geometry.dispose();
    }
    this.groupMaterials.forEach((m) => m.dispose());
    this.envTexture?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.tip.remove();
  }

  // ------------------------------------------------------------- internals
  private materialFor(key: string): MeshStandardMaterial {
    let mat = this.groupMaterials.get(key);
    if (!mat) {
      mat = new MeshStandardMaterial({ roughness: key === 'bone' ? 0.7 : 0.45, metalness: 0, envMapIntensity: 0.55 });
      this.groupMaterials.set(key, mat);
    }
    return mat;
  }

  private applyColors(): void {
    const pal = PALETTE[this.theme];
    const base = new Color(pal.muscle);
    const accent = new Color(pal.accent);
    // Which covering layers to peel back for the groups that are lit.
    const levelOf = (m: Muscle) => (m === this.selected ? 1 : Math.min(1, this.levels[m] ?? 0));
    const peeled = new Set<string>();
    for (const [m, covers] of Object.entries(OCCLUDERS) as [Muscle, string[]][]) {
      if (levelOf(m) >= 0.3) for (const c of covers) if (!(MUSCLES as readonly string[]).includes(c) || levelOf(c as Muscle) < 0.3) peeled.add(c);
    }
    for (const [key, mat] of this.groupMaterials) {
      const translucent = peeled.has(key);
      if (mat.transparent !== translucent) {
        mat.transparent = translucent;
        mat.depthWrite = !translucent;
        mat.needsUpdate = true;
      }
      mat.opacity = translucent ? 0.22 : 1;
    }
    for (const [key, mat] of this.groupMaterials) {
      if (key === 'bone') mat.color.set(pal.bone);
      else if (key === 'tendon') mat.color.set(pal.tendon);
      else if (key === 'other') mat.color.set(pal.other);
      else {
        const m = key as Muscle;
        const level = levelOf(m);
        mat.color.copy(base).lerp(accent, level);
        if (m === this.hovered && level < 1) mat.color.lerp(new Color(pal.hover), 0.6);
        mat.emissive.copy(accent).multiplyScalar(level * 0.35);
      }
    }
    this.invalidate();
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Fit the whole body: 1.75 m tall, ~0.75 m wide arms included.
    const half = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = Math.max(0.94 / half, 0.48 / (half * this.camera.aspect));
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  }

  private invalidate(): void {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      // Damping keeps moving for a few frames after the drag ends.
      if (this.controls.update()) this.invalidate();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private pick(clientX: number, clientY: number): Muscle | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.firstHitOnly = true;
    const [hit] = this.raycaster.intersectObjects(this.meshes, false);
    const group = hit?.object.userData.group as string | undefined;
    return group && (MUSCLES as readonly string[]).includes(group) ? (group as Muscle) : null;
  }

  private bindPointer(): void {
    const el = this.renderer.domElement;
    let pending: PointerEvent | null = null;
    el.addEventListener('pointerdown', (e) => (this.downAt = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      const d = this.downAt;
      this.downAt = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // it was a drag
      const m = this.pick(e.clientX, e.clientY);
      if (!m) return;
      this.selected = m;
      this.applyColors();
      this.opts.onSelect?.(m);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.downAt) return;
      const schedule = !pending;
      pending = e;
      if (!schedule) return;
      requestAnimationFrame(() => {
        if (!pending || this.disposed) return;
        const ev = pending;
        pending = null;
        const m = this.pick(ev.clientX, ev.clientY);
        if (m !== this.hovered) {
          this.hovered = m;
          el.style.cursor = m ? 'pointer' : 'grab';
          this.applyColors();
        }
        if (m && this.opts.labelFor) {
          const box = this.host.getBoundingClientRect();
          this.tip.textContent = this.opts.labelFor(m);
          this.tip.style.left = `${ev.clientX - box.left}px`;
          this.tip.style.top = `${ev.clientY - box.top}px`;
          this.tip.classList.add('is-visible');
        } else this.tip.classList.remove('is-visible');
      });
    });
    el.addEventListener('pointerleave', () => {
      this.tip.classList.remove('is-visible');
      if (this.hovered) {
        this.hovered = null;
        this.applyColors();
      }
    });
  }
}
