/** GLSL light field rendered behind the 2D muscle map with Three.js.
 *  One full-screen quad, low resolution (it is a blur by nature), paused
 *  when off-screen or in a background tab, static under reduced motion. */
import {
  Color,
  ColorManagement,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from 'three';
import fragmentShader from './shaders/aura.frag.glsl?raw';
import vertexShader from './shaders/aura.vert.glsl?raw';

ColorManagement.enabled = false;

export type AuraTheme = 'dark' | 'light';

const THEMES = {
  dark: { field: '#3fa9ff', focus: '#ff6a2b', strength: 1 },
  light: { field: '#6aa2ff', focus: '#ff6a2b', strength: 0.55 },
} as const;

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class AuraBackdrop {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: ShaderMaterial;
  private geometry = new PlaneGeometry(2, 2);
  private raf = 0;
  private running = false;
  private visible = true;
  private motion: number;
  private start = performance.now();
  private focus = new Vector2(0.5, 0.55);
  private focusTarget = new Vector2(0.5, 0.55);
  private focusAmt = 0;
  private focusAmtTarget = 0;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private onVisibility = () => this.update();

  constructor(
    private host: HTMLElement,
    theme: AuraTheme,
  ) {
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
    this.renderer = new WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1); // a soft glow needs no retina pixels
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    host.append(this.renderer.domElement);

    const t = THEMES[theme];
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      // The quad covers the canvas once: write premultiplied colour as-is.
      blending: NoBlending,
      depthTest: false,
      uniforms: {
        uRes: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uMotion: { value: this.motion },
        uField: { value: new Color(t.field) },
        uFocusColor: { value: new Color(t.focus) },
        uFocus: { value: this.focus },
        uFocusAmt: { value: 0 },
        uStrength: { value: t.strength },
      },
    });
    this.scene.add(new Mesh(this.geometry, this.material));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.update();
    });
    this.io.observe(host);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
    this.update();
  }

  /** Move the glow to a point (0..1, origin top-left) or hide it (null). */
  setFocus(point: { x: number; y: number } | null): void {
    if (point) {
      this.focusTarget.set(point.x, 1 - point.y);
      if (this.focusAmt === 0) this.focus.copy(this.focusTarget);
      this.focusAmtTarget = 1;
    } else {
      this.focusAmtTarget = 0;
    }
    this.kick();
  }

  setTheme(theme: AuraTheme): void {
    const t = THEMES[theme];
    this.material.uniforms.uField.value.set(t.field);
    this.material.uniforms.uFocusColor.value.set(t.focus);
    this.material.uniforms.uStrength.value = t.strength;
    this.kick();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.material.uniforms.uRes.value.set(w, h);
    this.kick();
  }

  private update(): void {
    // With reduced motion the field is static: draw on demand only.
    const run = this.motion > 0 && this.visible && document.visibilityState === 'visible';
    if (run && !this.running) {
      this.running = true;
      this.raf = requestAnimationFrame(this.tick);
    } else if (!run) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  private kick(): void {
    if (!this.running) requestAnimationFrame(() => this.frame(performance.now(), true));
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.frame(now, false);
    this.raf = requestAnimationFrame(this.tick);
  };

  private frame(now: number, snap: boolean): void {
    const ease = snap || !this.motion ? 1 : 0.08;
    this.focus.lerp(this.focusTarget, ease);
    this.focusAmt += (this.focusAmtTarget - this.focusAmt) * ease;
    if (Math.abs(this.focusAmt - this.focusAmtTarget) < 0.001) this.focusAmt = this.focusAmtTarget;
    const u = this.material.uniforms;
    u.uTime.value = (now - this.start) / 1000;
    u.uFocusAmt.value = this.focusAmt;
    this.renderer.render(this.scene, this.camera);
  }
}
