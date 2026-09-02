import RAPIER from '@dimforge/rapier3d-compat';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  HemisphereLight,
  PMREMGenerator,
  PerspectiveCamera,
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

    this.hemi = new HemisphereLight(0xc9b59a, 0x2a241f, 0.32);
    this.scene.add(this.hemi);

    this.lamp = new PointLight(0xfff2e0, 3.2, 10, 2);
    this.scene.add(this.lamp);

    this.pmrem = new PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.envTexture = this.pmrem.fromScene(envScene, 0.04).texture;
    envScene.dispose();
    this.scene.environment = this.envTexture;

    this.attachPeek(canvas);
  }

  setPixelRatio(ratio: number): void {
    this.renderer.setPixelRatio(ratio);
  }

  setEnvEnabled(on: boolean): void {
    this.envEnabled = on;
    this.scene.environment = on ? this.envTexture : null;
  }

  resize(width: number, height: number, dpr: number): Bounds {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);

    const halfH = Math.tan((CAMERA_FOV * Math.PI) / 360) * CAMERA_Z;
    const halfW = halfH * this.camera.aspect;
    const halfD = Math.min(halfW, halfH) * BOX_DEPTH_FRAC;
    this.bounds = { halfW, halfH, halfD };

    const front = CAMERA_Z - halfD;
    const back = CAMERA_Z + halfD;
    this.fog.near = front + halfD * 0.35;
    this.fog.far = back + halfD * 0.85;

    this.lamp.position.set(0.25, 0.85, halfD + 0.45);
    this.lamp.distance = halfD * 3.6 + 2.4;
    this.lamp.intensity = isMobile() ? 2.7 : 3.4;

    this.rebuildWalls();
    return this.bounds;
  }

  look(dt: number, betaDeg: number, gammaDeg: number): void {
    const k = Math.min(1, dt * 6);
    this.peekX += (this.peekAimX - this.peekX) * k;
    this.peekY += (this.peekAimY - this.peekY) * k;
    this.idleT += dt;
    const idleX = Math.sin(this.idleT * 0.17) * 0.14;
    const idleY = Math.cos(this.idleT * 0.13) * 0.1;
    const gx = (gammaDeg * Math.PI) / 180;
    const gy = (betaDeg * Math.PI) / 180;
    this.camera.position.x = Math.sin(gx * 0.22) * 0.75 + this.peekX * 0.62 + idleX;
    this.camera.position.y = Math.sin(gy * 0.22) * 0.75 + this.peekY * 0.48 + idleY;
    this.camera.position.z = CAMERA_Z;
    this.camera.lookAt(0, 0, -this.bounds.halfD * 0.22);
  }

  driftAccent(dt: number): void {
    this.accentHue = (this.accentHue + dt * 1.4) % 360;
    const t = this.accentHue / 360;
    this.hemi.color.setHSL(t, 0.16, 0.62);
    this.hemi.groundColor.setHSL((t + 0.08) % 1, 0.1, 0.16);
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
}
