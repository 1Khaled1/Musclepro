/** Interactive 3D body: drag to rotate, hover/tap muscles, highlight states.
 *  Renders only while visible, pauses in background tabs, honours
 *  prefers-reduced-motion, and frees all GPU resources on dispose(). */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ColorManagement,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  NormalBlending,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  type Intersection,
  type Object3D,
} from 'three';
import { MUSCLES, type BodyType, type Muscle } from '../types';
import { buildFigure, type Figure } from './mannequin';
import floorFrag from './shaders/floor.frag.glsl?raw';
import floorVert from './shaders/floor.vert.glsl?raw';
import motesFrag from './shaders/motes.frag.glsl?raw';
import motesVert from './shaders/motes.vert.glsl?raw';
import muscleFrag from './shaders/muscle.frag.glsl?raw';
import shellFrag from './shaders/shell.frag.glsl?raw';
import surfaceVert from './shaders/surface.vert.glsl?raw';

// Colours are authored in display space; skip linear conversion entirely.
ColorManagement.enabled = false;

export type SceneTheme = 'dark' | 'light';

export interface BodySceneOptions {
  theme: SceneTheme;
  body?: BodyType;
  interactive?: boolean;
  autoRotate?: boolean;
  onSelect?: (m: Muscle | null) => void;
  onHover?: (m: Muscle | null) => void;
  labelFor?: (m: Muscle) => string;
}

const PALETTE = {
  dark: {
    shell: '#131c30', shellRim: '#4fc9ff', muscle: '#2c3b58', muscleRim: '#5fd0ff', active: '#ff6a2b',
    floor: '#5ad7ff', floorOpacity: 1, motes: '#9fe6ff', motesOpacity: 0.9,
  },
  light: {
    shell: '#c9d3e4', shellRim: '#ffffff', muscle: '#8d9bb5', muscleRim: '#f4f8ff', active: '#ec5414',
    floor: '#2f6fae', floorOpacity: 0.55, motes: '#5c7fb0', motesOpacity: 0.5,
  },
} as const;

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class BodyScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(28, 1, 0.1, 40);
  private root = new Group();
  private figure: Figure | null = null;
  private shellMat: ShaderMaterial;
  private muscleMats = new Map<Muscle, ShaderMaterial>();
  private floorMat: ShaderMaterial;
  private motesMat: ShaderMaterial;
  private extras: { geometry: BufferGeometry }[] = [];
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private tip: HTMLDivElement;

  private raf = 0;
  private running = false;
  private visible = true;
  private start = performance.now();
  private motion: number;

  private rot = 0;
  private targetRot = 0;
  private velocity = 0;
  private dragging = false;
  private dragMoved = false;
  private lastX = 0;
  private downX = 0;
  private downY = 0;

  private hovered: Muscle | null = null;
  private selected: Muscle | null = null;
  private levels: Partial<Record<Muscle, number>> = {};
  private hoverValues = new Map<Muscle, number>();
  private levelValues = new Map<Muscle, number>();

  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private disposers: (() => void)[] = [];

  constructor(
    private container: HTMLElement,
    private opts: BodySceneOptions,
  ) {
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.append(this.renderer.domElement);

    this.tip = document.createElement('div');
    this.tip.className = 'body-tip';
    container.append(this.tip);

    const pal = PALETTE[opts.theme];
    this.shellMat = new ShaderMaterial({
      vertexShader: surfaceVert,
      fragmentShader: shellFrag,
      uniforms: {
        uBase: { value: new Color(pal.shell) },
        uRim: { value: new Color(pal.shellRim) },
        uTime: { value: 0 },
        uMotion: { value: this.motion },
      },
    });
    for (const m of MUSCLES) {
      this.muscleMats.set(
        m,
        new ShaderMaterial({
          vertexShader: surfaceVert,
          fragmentShader: muscleFrag,
          uniforms: {
            uBase: { value: new Color(pal.muscle) },
            uRim: { value: new Color(pal.muscleRim) },
            uActive: { value: new Color(pal.active) },
            uTime: { value: 0 },
            uHover: { value: 0 },
            uLevel: { value: 0 },
            uMotion: { value: this.motion },
          },
        }),
      );
      this.hoverValues.set(m, 0);
      this.levelValues.set(m, 0);
    }

    // Platform under the feet.
    this.floorMat = new ShaderMaterial({
      vertexShader: floorVert,
      fragmentShader: floorFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new Color(pal.floor) },
        uTime: { value: 0 },
        uMotion: { value: this.motion },
        uOpacity: { value: pal.floorOpacity },
      },
    });
    const floorGeo = new PlaneGeometry(1.9, 1.9);
    const floor = new Mesh(floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    this.scene.add(floor);
    this.extras.push(floor);

    // Rising motes.
    const count = 90;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.35 + Math.random() * 0.55;
      positions.set([Math.cos(a) * r, Math.random() * 2.1, Math.sin(a) * r], i * 3);
      seeds[i] = Math.random();
    }
    const motesGeo = new BufferGeometry();
    motesGeo.setAttribute('position', new BufferAttribute(positions, 3));
    motesGeo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    this.motesMat = new ShaderMaterial({
      vertexShader: motesVert,
      fragmentShader: motesFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uColor: { value: new Color(pal.motes) },
        uTime: { value: 0 },
        uMotion: { value: this.motion },
        uOpacity: { value: pal.motesOpacity },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
      },
    });
    const motes = new Points(motesGeo, this.motesMat);
    this.scene.add(motes);
    this.extras.push(motes);

    this.scene.add(this.root);
    this.applyBlending(opts.theme);
    this.setBody(opts.body ?? 'male');

    if (opts.interactive !== false) this.bindPointer();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.updateRunning();
    });
    this.io.observe(container);
    const onVis = () => this.updateRunning();
    document.addEventListener('visibilitychange', onVis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVis));

    this.resize();
    this.updateRunning();
  }

  // ------------------------------------------------------------------ API
  setBody(type: BodyType): void {
    if (this.figure) {
      this.root.remove(this.figure.group);
      this.figure.geometries.forEach((g) => g.dispose());
    }
    this.figure = buildFigure(type, this.shellMat, (m) => this.muscleMats.get(m)!);
    this.root.add(this.figure.group);
    this.renderOnce();
  }

  setView(view: 'front' | 'back'): void {
    const angle = view === 'front' ? 0 : Math.PI;
    const turns = Math.round((this.targetRot - angle) / (Math.PI * 2));
    this.targetRot = turns * Math.PI * 2 + angle;
    this.velocity = 0;
    this.renderOnce();
  }

  get view(): 'front' | 'back' {
    const a = ((this.targetRot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return a > Math.PI / 2 && a < (Math.PI * 3) / 2 ? 'back' : 'front';
  }

  setSelected(m: Muscle | null): void {
    this.selected = m;
    this.renderOnce();
  }

  /** Per-muscle intensity 0..1 (secondary highlight, weekly heat map…). */
  setLevels(levels: Partial<Record<Muscle, number>>): void {
    this.levels = levels;
    this.renderOnce();
  }

  setTheme(theme: SceneTheme): void {
    const pal = PALETTE[theme];
    this.shellMat.uniforms.uBase.value.set(pal.shell);
    this.shellMat.uniforms.uRim.value.set(pal.shellRim);
    for (const mat of this.muscleMats.values()) {
      mat.uniforms.uBase.value.set(pal.muscle);
      mat.uniforms.uRim.value.set(pal.muscleRim);
      mat.uniforms.uActive.value.set(pal.active);
    }
    this.floorMat.uniforms.uColor.value.set(pal.floor);
    this.floorMat.uniforms.uOpacity.value = pal.floorOpacity;
    this.motesMat.uniforms.uColor.value.set(pal.motes);
    this.motesMat.uniforms.uOpacity.value = pal.motesOpacity;
    this.applyBlending(theme);
    this.renderOnce();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    this.disposers.forEach((fn) => fn());
    this.figure?.geometries.forEach((g) => g.dispose());
    this.extras.forEach((o) => o.geometry.dispose());
    this.shellMat.dispose();
    this.floorMat.dispose();
    this.motesMat.dispose();
    this.muscleMats.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.tip.remove();
  }

  // ------------------------------------------------------------ internals
  private applyBlending(theme: SceneTheme): void {
    this.floorMat.blending = theme === 'dark' ? AdditiveBlending : NormalBlending;
    this.floorMat.needsUpdate = true;
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Fit the whole figure (≈1.8 m tall, ≈1.1 m wide with the platform).
    const half = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = Math.max(0.95 / half, 0.58 / (half * aspect));
    this.camera.position.set(0, 1.1, dist);
    this.camera.lookAt(0, 0.9, 0);
    this.camera.updateProjectionMatrix();
    this.renderOnce();
  }

  private updateRunning(): void {
    const shouldRun = this.visible && document.visibilityState === 'visible';
    if (shouldRun && !this.running) {
      this.running = true;
      this.raf = requestAnimationFrame(this.tick);
    } else if (!shouldRun) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  private renderOnce(): void {
    if (!this.running) requestAnimationFrame(() => this.frame(performance.now()));
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.frame(now);
    this.raf = requestAnimationFrame(this.tick);
  };

  private frame(now: number): void {
    const time = (now - this.start) / 1000;

    if (!this.dragging) {
      this.targetRot += this.velocity;
      this.velocity *= 0.92;
      if (Math.abs(this.velocity) < 0.0001) this.velocity = 0;
      if (this.opts.autoRotate && this.motion && !this.hovered) this.targetRot += 0.0045;
    }
    const ease = this.motion ? 0.14 : 1;
    this.rot += (this.targetRot - this.rot) * ease;
    this.root.rotation.y = this.rot;

    for (const m of MUSCLES) {
      const mat = this.muscleMats.get(m)!;
      const targetHover = this.hovered === m ? 1 : 0;
      const targetLevel = this.selected === m ? 1 : Math.min(1, this.levels[m] ?? 0);
      const h = this.hoverValues.get(m)! + (targetHover - this.hoverValues.get(m)!) * (this.motion ? 0.2 : 1);
      const l = this.levelValues.get(m)! + (targetLevel - this.levelValues.get(m)!) * (this.motion ? 0.12 : 1);
      this.hoverValues.set(m, h);
      this.levelValues.set(m, l);
      mat.uniforms.uHover.value = h;
      mat.uniforms.uLevel.value = l;
      mat.uniforms.uTime.value = time;
    }
    this.shellMat.uniforms.uTime.value = time;
    this.floorMat.uniforms.uTime.value = time;
    this.motesMat.uniforms.uTime.value = time;

    this.renderer.render(this.scene, this.camera);
  }

  private pick(clientX: number, clientY: number): { muscle: Muscle | null; hit: Intersection<Object3D> | null } {
    if (!this.figure) return { muscle: null, hit: null };
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets: Object3D[] = [...this.figure.shell];
    this.figure.muscles.forEach((list) => targets.push(...list));
    const [hit] = this.raycaster.intersectObjects(targets, false);
    // The shell occludes muscles on the far side of the body.
    const muscle = (hit?.object.userData.muscle as Muscle | undefined) ?? null;
    return { muscle, hit: hit ?? null };
  }

  private setHover(m: Muscle | null, x = 0, y = 0): void {
    if (m !== this.hovered) {
      this.hovered = m;
      this.opts.onHover?.(m);
      this.container.classList.toggle('is-hovering', !!m);
    }
    if (m && this.opts.labelFor) {
      const rect = this.container.getBoundingClientRect();
      this.tip.textContent = this.opts.labelFor(m);
      this.tip.style.left = `${x - rect.left}px`;
      this.tip.style.top = `${y - rect.top}px`;
      this.tip.classList.add('is-visible');
    } else {
      this.tip.classList.remove('is-visible');
    }
    this.renderOnce();
  }

  private bindPointer(): void {
    const el = this.renderer.domElement;
    let pendingHover: PointerEvent | null = null;

    const down = (e: PointerEvent) => {
      this.dragging = true;
      this.dragMoved = false;
      this.lastX = this.downX = e.clientX;
      this.downY = e.clientY;
      this.velocity = 0;
    };
    const move = (e: PointerEvent) => {
      if (this.dragging) {
        const dx = e.clientX - this.lastX;
        if (Math.abs(e.clientX - this.downX) + Math.abs(e.clientY - this.downY) > 6) {
          if (!this.dragMoved) {
            this.dragMoved = true;
            el.setPointerCapture?.(e.pointerId);
            this.container.classList.add('is-dragging');
            this.setHover(null);
          }
        }
        if (this.dragMoved) {
          this.targetRot += dx * 0.011;
          this.velocity = dx * 0.0011;
          this.lastX = e.clientX;
          this.renderOnce();
          return;
        }
      }
      if (e.pointerType === 'mouse') {
        const schedule = !pendingHover;
        pendingHover = e;
        if (schedule)
          requestAnimationFrame(() => {
            if (!pendingHover) return;
            const ev = pendingHover;
            pendingHover = null;
            this.setHover(this.pick(ev.clientX, ev.clientY).muscle, ev.clientX, ev.clientY);
          });
      }
    };
    const up = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.container.classList.remove('is-dragging');
      if (!this.dragMoved) {
        const { muscle } = this.pick(e.clientX, e.clientY);
        if (!muscle) return; // a click on empty space keeps the selection
        this.selected = muscle;
        this.opts.onSelect?.(muscle);
        if (e.pointerType !== 'mouse') {
          this.setHover(muscle, e.clientX, e.clientY);
          window.setTimeout(() => this.setHover(null), 1200);
        }
        this.renderOnce();
      }
    };
    const leave = () => {
      if (!this.dragging) this.setHover(null);
    };
    const cancel = () => {
      this.dragging = false;
      this.container.classList.remove('is-dragging');
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointercancel', cancel);
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointercancel', cancel);
    });
  }
}
