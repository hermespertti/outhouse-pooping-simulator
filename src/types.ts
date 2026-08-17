import * as THREE from 'three';

export type Phase = 'ready' | 'straining' | 'settling';

export interface Poop {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  born: number;
  state: 'flying' | 'sunk' | 'dead';
  strain: number;
  seed: number;
  sink?: number;
  target?: THREE.Vector3;
}

export interface WorldRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  clock: THREE.Clock;
  outhouse: THREE.Group;      // world position of the outhouse
  outhouseRotZ: number;       // its z rotation
  throneAnchor: THREE.Group;  // throne sits here (local 0,0,0 = seat base)
  bucketAnchor: THREE.Group;  // bucket sits here
  bucketPos: () => THREE.Vector3;
  seatPos: () => THREE.Vector3;    // world spawn point for poops
  launchDir: () => THREE.Vector3;  // outhouse facing (+Y local -> world)
  character: THREE.Group;
  characterSkin: THREE.MeshStandardMaterial | null;
  bucketRadius: number;
  bucketRimZ: number;         // world z of bucket rim
  setShake: (v: number) => void;
  sfxTick: (dt: number) => void; // juice module hook (sweat etc.)
}

export interface GameSnapshot {
  phase: Phase;
  score: number;
  best: number;
  combo: number;
  comboTimeLeft: number;
  strain: number;
  aim: number;      // degrees, -45..45
  loft: number;     // degrees, 25..70
  level: number;
  levelName: string;
  unlockedThrones: string[];
  unlockedBuckets: string[];
  equippedThrone: string;
  equippedBucket: string;
  bucketFill: number;   // 0..1
  poopsLaunched: number;
  poopsHit: number;
  poopsMissed: number;
  perfects: number;
  fps: number;
  frameMs: number;
  flyingPoops: number;
  groundPoops: number;
  fxParticles: number;
  lastToast: string;
  lastToastAge: number;
  sweetStrain: number;
}

export const THRONES = [
  { id: 'wood',    name: 'Old Plank',     cost: 0 },
  { id: 'gold',    name: 'Golden Throne', cost: 1000 },
  { id: 'rocket',  name: 'Rocket Throne', cost: 3000 },
  { id: 'cloud',   name: 'Cloud Throne',  cost: 8000 },
] as const;

export const BUCKETS = [
  { id: 'rustic',   name: 'Rusty Bucket',  cost: 0 },
  { id: 'gold',     name: 'Gold Bucket',   cost: 2500 },
  { id: 'crystal',  name: 'Crystal Bucket',cost: 7000 },
] as const;

export const COMBO_WINDOW = 5.0;     // seconds to keep the chain alive
export const PERFECT_MIN = 70;
export const PERFECT_MAX = 95;
export const BUCKET_CAPACITY = 10;   // fills before overflow bonus

export const DEFAULT_AIM = 0;
export const DEFAULT_LOFT = 48;
