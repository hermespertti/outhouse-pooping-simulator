import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  GameSnapshot, Poop, THRONES, BUCKETS, COMBO_WINDOW, BUCKET_CAPACITY,
  DEFAULT_AIM, DEFAULT_LOFT,
} from './types';
import { makeSfx, Sfx } from './sfx';
import { makeFx, Fx } from './fx';

const ASSET = '/assets/';
const GRAV = 9.8;

function loadGLB(loader: GLTFLoader, name: string): Promise<THREE.Group> {
  return new Promise((res, rej) => {
    loader.load(ASSET + name, (g) => res(g.scene as THREE.Group), undefined, rej);
  });
}

class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  clock = new THREE.Clock();
  loader = new GLTFLoader();
  sfx: Sfx;
  fx: Fx;

  // world anchors
  outhouse = new THREE.Group();
  throneAnchor = new THREE.Group();
  bucketAnchor = new THREE.Group();
  character = new THREE.Group();
  characterSkin: THREE.MeshStandardMaterial | null = null;
  throne!: THREE.Group;
  bucket!: THREE.Group;
  bucketSkin: THREE.MeshStandardMaterial | null = null;

  // state
  phase: 'ready' | 'straining' | 'settling' = 'ready';
  strain = 0;
  aim = DEFAULT_AIM;
  loft = DEFAULT_LOFT;
  score = 0;
  best = 0;
  combo = 0;
  comboTimer = 0;
  level = 1;
  unlockedThrones: string[] = ['wood'];
  unlockedBuckets: string[] = ['rustic'];
  equippedThrone = 'wood';
  equippedBucket = 'rustic';
  bucketFill = 0;
  poopsLaunched = 0;
  poopsHit = 0;
  poopsMissed = 0;
  perfects = 0;
  poops: Poop[] = [];
  poopTemplate: THREE.Group | null = null;
  cloudModels: THREE.Group[] = [];

  shake = 0;
  fps = 60;
  frameMs = 0;
  frameMsSamples: number[] = [];
  private camBase = new THREE.Vector3(2.6, 3.4, 4.4);
  private camTarget = new THREE.Vector3(0, 0.9, -3.6);
  composer: EffectComposer | null = null;
  private time = 0;
  private toastT = 0;
  private unlockT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
    this.sfx = makeSfx();
    this.fx = makeFx(this.scene);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    this.buildWorld().then(() => this.setupPost()).catch((e) => console.error('buildWorld', e));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
  }

  // bloom + output pass, set up once the scene exists (in boot, after buildWorld)
  setupPost() {
    const w = window.innerWidth, h = window.innerHeight;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // subtle bloom: catches the bright sun/sweat/strains, gives the frame lift.
    // Rendered at quarter res — it's a wide soft glow anyway, and full-res
    // software rendering (~100ms/frame) stalled DOM key-event delivery by a
    // frame, making the strain gauge feel laggy (round-2 fix).
    const bloom = new UnrealBloomPass(new THREE.Vector2(w / 4, h / 4), 0.3, 0.5, 0.6);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  // warm/cool gradient sky dome (shader) — the single biggest craft lever
  private makeSky() {
    const geo = new THREE.SphereGeometry(80, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2a5db8) },
        mid: { value: new THREE.Color(0x9fd4ff) },
        bottom: { value: new THREE.Color(0xf6d9a8) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vP;
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        void main(){
          float h = normalize(vP).y;
          vec3 c = mix(mid, top, smoothstep(0.0, 0.4, h));
          c = mix(bottom, c, smoothstep(-0.2, 0.02, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    return new THREE.Mesh(geo, mat);
  }

  async buildWorld() {
    const sky = this.makeSky();
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog(0xcfe6ff, 30, 70);

    // warm key sun with soft shadows
    const sun = new THREE.DirectionalLight(0xffe0a8, 3.0);
    sun.position.set(9, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    sun.shadow.bias = -0.0003;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    // cool fill from the opposite side for warm/cool contrast
    const fill = new THREE.DirectionalLight(0x9fc4ff, 1.35);
    fill.position.set(-8, 6, -4);
    this.scene.add(fill);
    // sky/ground ambient for readable shadows
    this.scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x4a7a3a, 0.95));

    // ground: grass disc with painted splotch texture
    const gc = document.createElement('canvas');
    gc.width = gc.height = 512;
    const g2 = gc.getContext('2d')!;
    g2.fillStyle = '#5aa544';
    g2.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const shade = 70 + Math.random() * 60;
      g2.fillStyle = `rgba(${30 + Math.random() * 40},${shade + 50},${30 + Math.random() * 30},${0.12 + Math.random() * 0.2})`;
      const r = 1 + Math.random() * 3;
      g2.beginPath();
      g2.arc(Math.random() * 512, Math.random() * 512, r, 0, 7);
      g2.fill();
    }
    // dirt patch under the play area
    g2.fillStyle = 'rgba(150,116,74,0.85)';
    g2.beginPath(); g2.ellipse(256, 256, 120, 150, 0.3, 0, 7); g2.fill();
    const gtx = new THREE.CanvasTexture(gc);
    gtx.wrapS = gtx.wrapT = THREE.RepeatWrapping;
    gtx.repeat.set(6, 6);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(34, 48),
      new THREE.MeshStandardMaterial({ map: gtx, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // outhouse
    const outhouse = await loadGLB(this.loader, 'outhouse.glb');
    outhouse.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.outhouse.position.set(0, 0, -6.2);
    this.outhouse.rotation.y = Math.PI; // door side (model +Y) faces camera & bucket
    this.outhouse.add(outhouse); // glb child stays at local origin
    this.scene.add(this.outhouse);
    this.throneAnchor.position.set(0, 0.1, -0.55); // seat area inside, on the floor
    this.outhouse.add(this.throneAnchor);

    // character
    const char = await loadGLB(this.loader, 'character.glb');
    char.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        const m = o.material as THREE.MeshStandardMaterial;
        const c = m.color;
        if (c && c.r > 0.9 && c.g > 0.7 && c.b > 0.55) this.characterSkin = m;
      }
    });
    char.position.set(0.95, 0, -5.6); // world coords: beside the throne (throne sits at world ~z -5.65)
    char.rotation.y = Math.PI; // model faces -Z in glTF -> PI turns it toward the camera (+Z)
    this.character.add(char);
    this.scene.add(this.character);

    // bucket
    const bucket = await loadGLB(this.loader, 'bucket.glb');
    bucket.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; this.bucketSkin = this.bucketSkin || (o.material as THREE.MeshStandardMaterial); } });
    this.bucketAnchor.position.set(0, 0, -1.6);
    this.bucket = bucket; // glb child at local origin
    this.bucketAnchor.add(bucket);
    this.scene.add(this.bucketAnchor);

    // poop template
    const poop = await loadGLB(this.loader, 'poop.glb');
    poop.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    this.poopTemplate = poop;

    // throne (start: gold — the "wood" is just the outhouse bench)
    await this.setThrone('gold');
    await this.setBucket('rustic');

    // trees ring
    const tree = await loadGLB(this.loader, 'tree.glb');
    tree.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    const ring = 12;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + (i % 2) * 0.2;
      const r = 16 + (i % 3) * 4;
      const t = tree.clone();
      t.position.set(Math.sin(a) * r, 0, Math.cos(a) * r - 3);
      const s = 1.1 + (i % 4) * 0.35;
      t.scale.set(s, s, s);
      t.rotation.y = i * 1.31;
      this.scene.add(t);
    }
    // a few near trees for depth
    for (const [x, z, s] of [[-6, -2, 1.3], [6.5, -4, 1.6], [-5.5, 3, 1.1]] as const) {
      const t = tree.clone();
      t.position.set(x, 0, z);
      t.scale.set(s, s, s);
      t.rotation.y = x * 2;
      this.scene.add(t);
    }

    // sky clouds — reuse the cloud throne model
    const cloud = await loadGLB(this.loader, 'throne_cloud.glb');
    cloud.scale.set(2.2, 0.8, 2.2);
    for (let i = 0; i < 5; i++) {
      const c = cloud.clone();
      c.position.set(-18 + i * 9, 12 + (i % 2) * 3, -22 - (i % 3) * 6);
      this.cloudModels.push(c);
      this.scene.add(c);
    }

    document.getElementById('load')!.remove();
    this.announce('THE OUTHOUSE AWAITS');
  }

  async setThrone(id: string) {
    const map: Record<string, string> = { wood: 'throne_gold.glb', gold: 'throne_gold.glb', rocket: 'throne_rocket.glb', cloud: 'throne_cloud.glb' };
    const g = await loadGLB(this.loader, map[id] || 'throne_gold.glb');
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    g.scale.setScalar(0.42);
    // parent outhouse rotation (PI) already turns the model's opening (-Z) toward the bucket
    if (this.throne) this.throneAnchor.remove(this.throne);
    this.throne = g;
    this.throneAnchor.add(g);
    this.equippedThrone = id;
    this.updateHud();
  }

  async setBucket(id: string) {
    const map: Record<string, string> = { rustic: 'bucket.glb', gold: 'bucket_gold.glb', crystal: 'bucket_crystal.glb' };
    const g = await loadGLB(this.loader, map[id] || 'bucket.glb');
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        this.bucketSkin = o.material as THREE.MeshStandardMaterial;
      }
    });
    if (this.bucket) this.bucketAnchor.remove(this.bucket);
    this.bucket = g;
    this.bucketAnchor.add(g);
    this.equippedBucket = id;
    this.updateHud();
  }

  seatPos(): THREE.Vector3 {
    const v = new THREE.Vector3(0, 0.78, -0.6); // throne seat: above the bucket rim so the arc crosses it
    this.outhouse.localToWorld(v);
    return v;
  }
  bucketPos(): THREE.Vector3 { return this.bucketAnchor.position.clone(); }
  bucketRadius() { return 0.45; }
  bucketRimZ() { return 0.62; }

  launchDir(): THREE.Vector3 {
    // outhouse faces +Y (door side) toward camera
    const el = THREE.MathUtils.degToRad(this.loft);
    const az = THREE.MathUtils.degToRad(this.aim);
    return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }

  // ---- input ----
  strainStartStamp = 0; // DOMHighResTimeStamp of the key-down event that started straining
  onKey(e: KeyboardEvent, down: boolean) {
    if (down) this.sfx.unlock();
    const k = e.key;
    if (down && (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight')) e.preventDefault();
    if (k === ' ') {
      if (down && this.phase === 'ready') this.startStrain(e.timeStamp);
      if (!down && this.phase === 'straining') this.release(e.timeStamp);
    }
    this.applyHold(k, down);
    if (down) {
      if (k >= '1' && k <= '4') this.cycleThrone(parseInt(k) - 1);
      if (k === 'q' || k === 'Q') this.cycleBucket();
    }
  }
  private holdAim = { l: false, r: false, u: false, d: false };
  applyHold(k: string, down: boolean) {
    if (k === 'ArrowLeft') this.holdAim.l = down;
    if (k === 'ArrowRight') this.holdAim.r = down;
    if (k === 'ArrowUp') this.holdAim.u = down;
    if (k === 'ArrowDown') this.holdAim.d = down;
  }
  cycleThrone(idx: number) {
    const t = THRONES[idx];
    if (!t) return;
    if (!this.unlockedThrones.includes(t.id)) {
      if (this.score >= t.cost) { this.unlockedThrones.push(t.id); this.announceUnlock(`${t.name} UNLOCKED!`); this.sfx.unlockJingle(); }
      else { this.announce(`${t.name} needs ${t.cost} pts`); this.sfx.deny(); }
      return;
    }
    this.setThrone(t.id);
    this.sfx.click();
  }
  cycleBucket() {
    const cur = BUCKETS.findIndex((b) => b.id === this.equippedBucket);
    const next = BUCKETS[(cur + 1) % BUCKETS.length];
    if (!this.unlockedBuckets.includes(next.id)) {
      if (this.score >= next.cost) { this.unlockedBuckets.push(next.id); this.announceUnlock(`${next.name} UNLOCKED!`); this.sfx.unlockJingle(); }
      else { this.announce(`${next.name} needs ${next.cost} pts`); this.sfx.deny(); }
      return;
    }
    this.setBucket(next.id);
    this.sfx.click();
  }

  // ---- core loop ----
  // Strain is a pure function of time (real-time gauge: fills in wall-clock,
  // so HUD and physics agree exactly at any frame rate). Round-2 fix: the old
  // variable-dt sim ran in slow-motion at ~10fps, and reading strain from the
  // last physics step added up-to-a-frame of latency — both let real-time
  // releases miss the visible sweet spot.
  strainAt(stamp: number): number {
    return Math.min(1, (stamp - this.strainStartStamp) / 1000 / 1.15);
  }
  startStrain(stamp: number) {
    this.phase = 'straining';
    this.strainStartStamp = stamp; // DOMHighResTimeStamp of the key-down event
    this.strain = 0;
    this.sfx.strainStart();
  }
  release(stamp: number) {
    this.phase = 'settling';
    // exact strain at the key-up event's timestamp (sub-frame precision)
    this.strain = this.strainAt(stamp);
    const v = this.launchSpeed();
    const dir = this.launchDir();
    const origin = this.seatPos();
    const mesh = this.poopTemplate!.clone(true);
    mesh.position.copy(origin);
    mesh.scale.setScalar(0.16 + this.strain * 0.1);
    this.scene.add(mesh);
    this.poops.push({
      mesh,
      vel: dir.multiplyScalar(v),
      spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
      born: this.time,
      state: 'flying',
      strain: this.strain,
      seed: Math.random(),
    });
    this.poopsLaunched++;
    this.phase = 'ready';
    this.shake = Math.max(this.shake, 0.25 + this.strain * 0.4);
    this.sfx.launch(this.strain);
    this.fx.burst(origin, 14 + this.strain * 10, 0xffe9a8, 2.2, 0.5);
    // character relief jump
    this.relief = 1;
    this.strain = 0;
  }
  relief = 0;

  // Round-2 retune: flatter speed curve. The HUD sweet band is ±0.11 strain;
  // the old 9 m/strain slope meant only ±0.07 of that band actually landed in
  // the bucket (the gauge overpromised and every slightly-early release sailed
  // short). At ~1.8 m/strain, anywhere inside ±0.16 of sweet lands in the
  // bucket, and the perfect zone (d < rad*0.4) is a tight ±0.06 — precision
  // still wins points, but the band the gauge shows is the band that works.
  launchSpeed() { return 5.31 + this.strain * 1.8; }

  launchSpeedFor(s: number) { return 5.31 + s * 1.8; }
  // Exact strain that crosses the bucket rim height directly over the bucket center,
  // given the current aim/loft. Signed forward distance at the rim crossing is
  // monotone in strain, so bisection converges cleanly.
  sweetStrain(): number {
    const b = this.bucketPos();
    const o = this.seatPos();
    const toB = b.clone().sub(o);
    const fwd = new THREE.Vector3(toB.x, 0, toB.z).normalize();
    const rimH = this.bucketRimZ();
    // Signed forward distance from the bucket at the moment the descending
    // trajectory crosses rim height. >0 = landed past the bucket, <0 = short.
    const signedAtRim = (s: number): number => {
      let p = o.clone();
      const vel = this.launchDir().clone().multiplyScalar(this.launchSpeedFor(s));
      const dt = 0.016;
      let prevY = p.y;
      for (let i = 0; i < 600; i++) {
        vel.y -= GRAV * dt;
        p.addScaledVector(vel, dt);
        if (vel.y < 0 && prevY >= rimH && p.y < rimH) {
          // only count the crossing if we're in the bucket's neighbourhood
          const lateral = Math.abs(p.clone().sub(b).cross(fwd).length());
          if (lateral > 2) return 99; // way off-axis: treat as past
          return p.clone().sub(b).dot(fwd);
        }
        prevY = p.y;
        if (p.y <= 0) return -100; // died on the ground before reaching rim height
      }
      return 100;
    };
    if (signedAtRim(0.02) > 0) return 0.02;
    if (signedAtRim(1) < 0) return 0.98;
    let lo = 0.02, hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (signedAtRim(mid) < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  update(dt: number) {
    this.time += dt;
    // hold keys for aim/loft
    const sp = 55 * dt;
    if (this.holdAim.l) this.aim = THREE.MathUtils.clamp(this.aim - sp, -45, 45);
    if (this.holdAim.r) this.aim = THREE.MathUtils.clamp(this.aim + sp, -45, 45);
    if (this.holdAim.u) this.loft = THREE.MathUtils.clamp(this.loft + sp, 25, 70);
    if (this.holdAim.d) this.loft = THREE.MathUtils.clamp(this.loft - sp, 25, 70);

    if (this.phase === 'straining') {
      // gauge value = wall-clock elapsed since the key-down event (see strainAt)
      this.strain = this.strainAt(performance.now());
      // strain wobble + redness
      const c = this.characterSkin;
      if (c) {
        c.emissive.setRGB(this.strain * 0.9, this.strain * 0.05, 0);
        c.emissiveIntensity = 1;
      }
      this.character.rotation.z = Math.sin(this.time * 22) * 0.06 * this.strain;
      this.sfx.tickStrain(this.strain, dt);
      if (Math.random() < this.strain * dt * 8) {
        this.fx.burst(this.character.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 3, 0x9fd4ff, 1.4, 0.3);
      }
    } else {
      const c = this.characterSkin;
      if (c) c.emissive.multiplyScalar(0.9);
      this.character.rotation.z *= 0.85;
    }
    // relief bounce
    if (this.relief > 0) {
      this.relief -= dt * 1.6;
      this.character.position.y = Math.abs(Math.sin(this.relief * Math.PI)) * 0.5;
      if (this.relief <= 0) this.character.position.y = 0;
    }

    // combo decay
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    this.updatePoops(dt);
    this.fx.update(dt);
    this.updateCamera(dt);
    this.updateHud();

    // cloud drift
    for (const c of this.cloudModels) {
      c.position.x += dt * 0.25;
      if (c.position.x > 24) c.position.x = -24;
    }
  }

  updatePoops(dt: number) {
    const bp = this.bucketPos();
    const rim = this.bucketRimZ();
    const rad = this.bucketRadius();
    for (const p of this.poops) {
      if (p.state === 'flying') {
        p.vel.y -= GRAV * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
        const pos = p.mesh.position;
        const d = Math.hypot(pos.x - bp.x, pos.z - bp.z);
        // entering the bucket (inside radius, at/below rim, moving down)
        if (d < rad && pos.y < rim + 0.25 && pos.y > 0 && p.vel.y < 0) {
          p.state = 'sunk';
          p.sink = 1;
          p.target = new THREE.Vector3(bp.x, 0.12, bp.z);
          this.onBucketHit(p, d);
        } else if (pos.y <= 0.08) {
          p.state = 'dead';
          p.mesh.scale.y = p.mesh.scale.y * 0.45;
          this.fx.burst(pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 16, 0x8a6b3f, 2.0, 0.6);
          this.fx.stink(pos.clone().add(new THREE.Vector3(0, 0.15, 0)));
          this.onGroundHit(p, d);
        }
      } else if (p.state === 'sunk') {
        // sink down into the bucket, squash, then fade away
        p.mesh.position.lerp(p.target!, 1 - Math.pow(0.001, dt));
        p.mesh.scale.multiplyScalar(1 - 0.9 * dt);
        p.mesh.rotation.y += dt * 6;
        if (p.mesh.scale.x < 0.06) this.scene.remove(p.mesh);
      } else if (p.state === 'dead') {
        // squashed splat on the ground — linger then shrink
        if (this.time - p.born > 4) {
          p.mesh.scale.multiplyScalar(1 - 0.8 * dt);
          if (p.mesh.scale.x < 0.05) this.scene.remove(p.mesh);
        }
      }
    }
    this.poops = this.poops.filter((p) => p.mesh.parent);
  }

  onBucketHit(p: Poop, d: number) {
    const rad = this.bucketRadius();
    let base = 0, label = '';
    if (d < rad * 0.4) { base = 150; label = 'PERFECT SPLAT!'; this.perfects++; }
    else if (d < rad * 0.75) { base = 100; label = 'SPLAT!'; }
    else { base = 60; label = 'IN THE BUCKET'; }
    this.combo++;
    this.comboTimer = COMBO_WINDOW;
    const pts = base * this.combo;
    this.score += pts;
    this.best = Math.max(this.best, this.score);
    this.poopsHit++;
    this.bucketFill += 1;
    const bp = this.bucketPos();
    this.fx.burst(new THREE.Vector3(bp.x, bp.y + this.rim(), bp.z), 20, 0x7a5230, 2.4, 0.5);
    this.fx.stink(new THREE.Vector3(bp.x, bp.y + 0.9, bp.z));
    this.sfx.splat(this.combo);
    this.shake = Math.max(this.shake, 0.15 + this.combo * 0.04);
    this.announce(`${label}  +${pts}${this.combo > 1 ? `  x${this.combo}` : ''}`, base === 150 ? '#ffe14a' : '#fff');
    // pop combo badge
    const cb = document.getElementById('combo');
    if (cb) { cb.classList.remove('pop'); void cb.offsetWidth; cb.classList.add('pop'); }
    if (this.bucketFill >= BUCKET_CAPACITY) {
      const bonus = 500 * this.combo;
      this.score += bonus;
      this.best = Math.max(this.best, this.score);
      this.bucketFill = 0;
      this.announce(`BUCKET FULL! +${bonus}`, '#7ed957');
      this.sfx.fullBucket();
      this.fx.confetti(new THREE.Vector3(bp.x, bp.y + 1, bp.z));
      this.shake = 0.6;
      this.levelUpCheck();
    }
  }
  rim() { return 0.62; }

  onGroundHit(p: Poop, d: number) {
    const bp = this.bucketPos();
    if (d < 1.6) {
      this.score += 25 * Math.max(1, Math.floor(this.combo / 2));
      this.best = Math.max(this.best, this.score);
      this.announce('SO CLOSE! +25', '#ffd0a0');
    } else {
      this.combo = 0;
      this.score += 10;
      this.best = Math.max(this.best, this.score);
    }
    this.poopsMissed++;
    this.sfx.thud();
    this.shake = Math.max(this.shake, 0.12);
    this.levelUpCheck();
  }

  levelUpCheck() {
    const next = this.level + 1;
    if (this.score >= next * 1500) {
      this.level = next;
      this.announce(`LEVEL ${next}!`);
      this.sfx.levelUp();
    }
  }

  updateCamera(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const t = this.time;
    const sway = new THREE.Vector3(
      Math.sin(t * 0.4) * 0.15,
      Math.cos(t * 0.3) * 0.1,
      0,
    );
    const sh = this.shake;
    const jx = (Math.random() - 0.5) * sh * 0.25;
    const jy = (Math.random() - 0.5) * sh * 0.25;
    this.camera.position.copy(this.camBase).add(sway).add(new THREE.Vector3(jx, jy, 0));
    this.camera.lookAt(this.camTarget);
  }

  // ---- HUD ----
  updateHud() {
    const sv = document.getElementById('scorev');
    if (sv) sv.textContent = String(this.score);
    const cb = document.getElementById('combo');
    if (cb) cb.innerHTML = this.combo > 1 ? `COMBO ${this.combo}<span class="mult">${this.comboTimer.toFixed(1)}s</span>` : '';
    const g = document.getElementById('gauge');
    if (g) {
      g.style.height = (this.strain * 100).toFixed(1) + '%';
      g.style.background = this.phase === 'straining' ? (this.strain > 1 ? '#ff5555' : '#7ed957') : '#7ed957';
    }
    const band = document.querySelector('#gaugewrap .band') as HTMLElement | null;
    if (band) {
      const s = this.sweetStrain();
      band.style.bottom = Math.max(2, (s - 0.11) * 100) + '%';
      band.style.height = '22%';
    }
    const eq = document.getElementById('equip');
    if (eq) {
      const t = THRONES.find((x) => x.id === this.equippedThrone);
      const b = BUCKETS.find((x) => x.id === this.equippedBucket);
      eq.innerHTML = `THRONE: ${t?.name}<br>BUCKET: ${b?.name}<br>AIM ${this.aim.toFixed(0)}° · LOFT ${this.loft.toFixed(0)}°`;
    }
    const hint = document.getElementById('hint');
    if (hint) hint.style.opacity = this.poopsLaunched === 0 ? '1' : '0.45';
  }

  lastToast = '';
  lastToastAt = 0;
  announce(text: string, color = '#fff') {
    this.lastToast = text;
    this.lastToastAt = this.time;
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  announceUnlock(text: string) {
    const el = document.getElementById('unlock');
    if (!el) return;
    el.textContent = '★ ' + text + ' ★';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ---- hooks for the harness ----
  snapshot(): GameSnapshot {
    return {
      phase: this.phase,
      score: this.score,
      best: this.best,
      combo: this.combo,
      comboTimeLeft: Math.max(0, this.comboTimer),
      strain: this.strain,
      aim: this.aim,
      loft: this.loft,
      level: this.level,
      levelName: `Level ${this.level}`,
      unlockedThrones: [...this.unlockedThrones],
      unlockedBuckets: [...this.unlockedBuckets],
      equippedThrone: this.equippedThrone,
      equippedBucket: this.equippedBucket,
      bucketFill: this.bucketFill,
      poopsLaunched: this.poopsLaunched,
      poopsHit: this.poopsHit,
      poopsMissed: this.poopsMissed,
      perfects: this.perfects,
      fps: this.fps,
      frameMs: this.frameMs,
      flyingPoops: this.poops.filter((p) => p.state === 'flying').length,
      groundPoops: this.poops.filter((p) => p.state === 'dead').length,
      fxParticles: this.fx.count(),
      lastToast: this.lastToast,
      lastToastAge: this.time - this.lastToastAt,
      sweetStrain: this.sweetStrain(),
    };
  }

  // debug: return signed distance at rim crossing for a set of strains (diagnostics)
  dbgTraj(): number[] {
    const out: number[] = [];
    for (const s of [0.1, 0.3, 0.5, 0.7, 1.0]) {
      const b = this.bucketPos();
      const o = this.seatPos();
      const toB = b.clone().sub(o);
      const fwd = new THREE.Vector3(toB.x, 0, toB.z).normalize();
      const rimH = this.bucketRimZ();
      let p = o.clone();
      const vel = this.launchDir().clone().multiplyScalar(this.launchSpeedFor(s));
      const dt = 0.016;
      let prevY = p.y, sig = 999;
      for (let i = 0; i < 600; i++) {
        vel.y -= GRAV * dt;
        p.addScaledVector(vel, dt);
        if (vel.y < 0 && prevY >= rimH && p.y < rimH) {
          sig = p.clone().sub(b).dot(fwd);
          break;
        }
        prevY = p.y;
        if (p.y <= 0) { sig = -999; break; }
      }
      out.push(Number(sig.toFixed(2)));
    }
    return out;
  }

  screenshot(): string {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

export function boot(canvas: HTMLCanvasElement) {
  const game = new Game(canvas);
  let last = performance.now();
  // Fixed-timestep simulation: game-time always tracks wall-clock regardless of
  // render fps (round-2 fix — at ~10fps the capped variable dt ran the whole
  // game in slow-motion, so a real-time release missed the visible gauge).
  const STEP = 1 / 120;
  let pending = 0;
  const acc = { n: 0, t: 0 };
  function loop() {
    const now = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.25); // cap catch-up after tab switches; still real-time
    const t0 = performance.now();
    pending += dt;
    while (pending >= STEP) { game.update(STEP); pending -= STEP; }
    if (game.composer) game.composer.render();
    else game.renderer.render(game.scene, game.camera);
    const ms = performance.now() - t0;
    game.frameMs = ms;
    acc.n++; acc.t += ms;
    if (acc.n >= 30) { game.fps = Math.round(1 / (dt || 1 / 60)); game.frameMs = acc.t / acc.n; acc.n = 0; acc.t = 0; }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  (window as any).__game = game;
  return game;
}

export default boot;

// entry
const canvas = document.getElementById('app') as HTMLCanvasElement;
boot(canvas);
