import * as THREE from 'three';

// Particle + effect juice module.
export interface Fx {
  update(dt: number): void;
  burst(pos: THREE.Vector3, count: number, color: number, size: number, speed: number): void;
  stink(pos: THREE.Vector3): void;
  confetti(pos: THREE.Vector3): void;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  grav: number;
  grow: number;
  fade: boolean;
}

export function makeFx(scene: THREE.Scene): Fx {
  const pool: Particle[] = [];
  const geo = new THREE.SphereGeometry(0.06, 8, 6);
  const matCache = new Map<number, THREE.MeshBasicMaterial>();
  function mat(c: number) {
    let m = matCache.get(c);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95 });
      matCache.set(c, m);
    }
    return m;
  }

  function spawn(pos: THREE.Vector3, color: number, size: number, vel: THREE.Vector3, life: number, grav: number, grow: number) {
    const mesh = new THREE.Mesh(geo, mat(color));
    mesh.position.copy(pos);
    mesh.scale.setScalar(size);
    scene.add(mesh);
    pool.push({ mesh, vel: vel.clone(), life, maxLife: life, grav, grow, fade: true });
  }

  return {
    burst(pos, count, color, size, speed) {
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 1.2 + 0.2,
          (Math.random() - 0.5) * 2,
        ).normalize().multiplyScalar(speed * (0.5 + Math.random()));
        spawn(pos, color, size * (0.6 + Math.random() * 0.8), v, 0.5 + Math.random() * 0.5, 6, -0.02);
      }
    },
    stink(pos) {
      for (let i = 0; i < 7; i++) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4);
        spawn(pos, 0x9c8a5a, 0.14 + Math.random() * 0.1, v, 1.4 + Math.random() * 1.2, -0.15, 0.25);
      }
    },
    confetti(pos) {
      const colors = [0xffe14a, 0x7ed957, 0xff7ab0, 0x66d9ff, 0xff9a4a];
      for (let i = 0; i < 60; i++) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6);
        spawn(pos, colors[i % colors.length], 0.1, v, 1.6 + Math.random() * 0.8, 7, -0.01);
      }
    },
    update(dt) {
      for (let i = pool.length - 1; i >= 0; i--) {
        const p = pool[i];
        p.life -= dt;
        if (p.life <= 0) {
          scene.remove(p.mesh);
          pool.splice(i, 1);
          continue;
        }
        p.vel.y -= p.grav * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.scale.multiplyScalar(1 + p.grow * dt * (p.grow > 0 ? 2 : 1));
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life / p.maxLife) * 0.95;
      }
    },
  };
}
