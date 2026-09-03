import RAPIER from '@dimforge/rapier3d-compat';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Color,
  Fog,
  HemisphereLight,
  PMREMGenerator,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  PointLight,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BOX_DEPTH_FRAC,
  CAMERA_FOV,
  CAMERA_Z,
  SCENE_BG,
  WALL_THICKNESS,
  isMobile,
} from '../config';
import type { Bounds } from './types';

export class Stage {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  bounds: Bounds = { halfW: 1, halfH: 1, halfD: 0.4 };
  private world: World;
  private walls: RigidBody[] = [];
  private hemi: HemisphereLight;
  private lamp: PointLight;
  private fog: Fog;
  private envTexture: ReturnType<PMREMGenerator['fromScene']>['texture'] | null = null;
  private pmrem: PMREMGenerator;
  private accentHue = 28;
  envEnabled = true;
  private peekAimX = 0;
  private peekAimY = 0;
  private peekX = 0;
  private peekY = 0;
  private idleT = 0;
  private dolly = 0;
  private dollyAim = 0;
  private specks: Points;
  private speckMat: PointsMaterial;
  private sparks: Points;
  private sparkMat: PointsMaterial;
  private sparkLife = 0;
  private sparkPos: Float32Array;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.world = world;
    this.camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 40);
    this.camera.position.set(0, 0, CAMERA_Z);

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: !isMobile(),
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setClearColor(SCENE_BG, 1);
    this.renderer.shadowMap.enabled = false;

    this.scene.background = new Color(SCENE_BG);
    this.fog = new Fog(SCENE_BG, 6, 12);
    this.scene.fog = this.fog;

    this.hemi = new HemisphereLight(0xc9b59a, 0x121218, 0.32);
    this.scene.add(this.hemi);

    this.lamp = new PointLight(0xfff2e0, 3.2, 10, 2);
    this.scene.add(this.lamp);

    this.pmrem = new PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.envTexture = this.pmrem.fromScene(envScene, 0.04).texture;
    envScene.dispose();
    this.scene.environment = this.envTexture;

    this.attachPeek(canvas);
    this.speckMat = new PointsMaterial({
      color: 0xb8b4c4,
      size: isMobile() ? 0.028 : 0.022,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: true,
    });
    this.specks = new Points(new BufferGeometry(), this.speckMat);
    this.specks.frustumCulled = false;
    this.scene.add(this.specks);

    this.sparkPos = new Float32Array(12 * 3);
    const sparkGeo = new BufferGeometry();
    sparkGeo.setAttribute('position', new BufferAttribute(this.sparkPos, 3));
    this.sparkMat = new PointsMaterial({
      color: 0xfff4e4,
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });
    this.sparks = new Points(sparkGeo, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.visible = false;
    this.scene.add(this.sparks);
  }

  setPixelRatio(ratio: number): void {
    this.renderer.setPixelRatio(ratio);
  }

  setEnvEnabled(on: boolean): void {
    this.envEnabled = on;
    this.scene.environment = on ? this.envTexture : null;
  }

  resize(width: number, height: number, dpr: number, beforeWalls?: (bounds: Bounds) => void): Bounds {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);

    const halfH = Math.tan((CAMERA_FOV * Math.PI) / 360) * CAMERA_Z;
    const halfW = halfH * this.camera.aspect;
    const halfD = Math.min(halfW, halfH) * BOX_DEPTH_FRAC;
    const boxChanged =
      Math.abs(halfW - this.bounds.halfW) > 0.012 ||
      Math.abs(halfH - this.bounds.halfH) > 0.012 ||
      Math.abs(halfD - this.bounds.halfD) > 0.012;
    this.bounds = { halfW, halfH, halfD };

    const front = CAMERA_Z - halfD;
    const back = CAMERA_Z + halfD;
    this.fog.near = front + halfD * 0.55;
    this.fog.far = back + halfD * 1.4;

    this.lamp.position.set(0.25, 0.85, halfD + 0.45);
    this.lamp.distance = halfD * 3.6 + 2.4;
    this.lamp.intensity = isMobile() ? 2.7 : 3.4;

    if (boxChanged) {
      beforeWalls?.(this.bounds);
      this.rebuildWalls();
      this.scatterSpecks();
    }
    return this.bounds;
  }

  setDollyAim(value: number): void {
    this.dollyAim = Math.min(1, Math.max(-1, value));
  }

  sparkAt(x: number, y: number, z: number, allow: boolean): void {
    if (!allow) return;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * 1.2;
      const r = 0.04 + Math.random() * 0.11;
      this.sparkPos[i * 3] = x + Math.cos(a) * r;
      this.sparkPos[i * 3 + 1] = y + Math.sin(a) * r;
      this.sparkPos[i * 3 + 2] = z + b * r;
    }
    const attr = this.sparks.geometry.getAttribute('position');
    attr.needsUpdate = true;
    this.sparkLife = 1;
    this.sparks.visible = true;
    this.sparkMat.opacity = 0.85;
  }

  setSpecksEnabled(on: boolean): void {
    this.specks.visible = on;
    if (!on) {
      this.sparks.visible = false;
      this.sparkLife = 0;
    }
  }

  look(dt: number, pourX: number, pourY: number): void {
    const k = Math.min(1, dt * 6);
    this.peekX += (this.peekAimX - this.peekX) * k;
    this.peekY += (this.peekAimY - this.peekY) * k;
    this.dolly += (this.dollyAim - this.dolly) * Math.min(1, dt * 7);
    this.idleT += dt;
    let px = pourX;
    let py = pourY;
    if (Math.hypot(px, py) < 0.14) {
      px = 0;
      py = 0;
    }
    const pour = Math.min(1, Math.hypot(px, py));
    const idle = 1 - pour * 0.85;
    const idleX = Math.sin(this.idleT * 0.17) * 0.14 * idle;
    const idleY = Math.cos(this.idleT * 0.13) * 0.1 * idle;
    const gx = Math.min(1.5, Math.max(-1.5, px)) * 0.48;
    const gy = Math.min(1.5, Math.max(-1.5, py)) * 0.42;
    this.camera.position.x = gx * 1.25 + this.peekX * 0.5 + idleX;
    this.camera.position.y = gy * 1.1 + this.peekY * 0.4 + idleY;
    this.camera.position.z = Math.min(10.2, Math.max(5.15, CAMERA_Z - this.dolly * 2.15));
    this.camera.lookAt(0, 0, -this.bounds.halfD * 0.22);
    if (this.sparkLife > 0) {
      this.sparkLife = Math.max(0, this.sparkLife - dt * 7);
      this.sparkMat.opacity = this.sparkLife * 0.85;
      if (this.sparkLife <= 0) this.sparks.visible = false;
    }
  }

  driftAccent(dt: number): void {
    this.accentHue = (this.accentHue + dt * 1.4) % 360;
    const t = this.accentHue / 360;
    this.hemi.color.setHSL(t, 0.16, 0.62);
    this.hemi.groundColor.setHSL((t + 0.08) % 1, 0.08, 0.08);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private attachPeek(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      this.peekAimX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.peekAimY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });
    const relax = () => {
      this.peekAimX = 0;
      this.peekAimY = 0;
    };
    canvas.addEventListener('pointerleave', relax);
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') relax();
    });
    canvas.addEventListener('pointercancel', relax);
  }

  private rebuildWalls(): void {
    for (const body of this.walls) this.world.removeRigidBody(body);
    this.walls.length = 0;
    const { halfW, halfH, halfD } = this.bounds;
    const t = WALL_THICKNESS;
    const side = 0.52;
    const floor = 0.78;
    const walls: Array<[number, number, number, number, number, number, number]> = [
      [halfW + t, 0, 0, t, halfH + t, halfD + t, side],
      [-(halfW + t), 0, 0, t, halfH + t, halfD + t, side],
      [0, halfH + t, 0, halfW + t, t, halfD + t, side],
      [0, -(halfH + t), 0, halfW + t, t, halfD + t, side],
      [0, 0, halfD + t, halfW + t, halfH + t, t, floor],
      [0, 0, -(halfD + t), halfW + t, halfH + t, t, floor],
    ];
    for (const [x, y, z, hx, hy, hz, rest] of walls) {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setRestitution(rest)
          .setFriction(0.12)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      this.walls.push(body);
    }
  }

  private scatterSpecks(): void {
    const n = isMobile() ? 36 : 64;
    const { halfW, halfH, halfD } = this.bounds;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * halfW * 0.92;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * halfH * 0.92;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * halfD * 0.88;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    this.specks.geometry.dispose();
    this.specks.geometry = geo;
  }
}
