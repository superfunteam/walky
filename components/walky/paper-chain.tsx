'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

const COLORS = [
  '#fc7948',
  '#e4cf64',
  '#639879',
  '#9aabd0',
  '#ee9dba',
  '#ddd3b7',
];
const SEGMENTS = 80,
  WIDTH = 0.34,
  THICKNESS = 0.012;
// A thin rectangular paper ribbon, bent around an oval. Separate inside/outside
// faces and real cut edges deliberately avoid the rounded tube look of a torus.
export function paperGeometry(fold = 1, flex = 0) {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let face = 0; face < 4; face++) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      for (let edge = 0; edge < 2; edge++) {
        const depth = face < 2 ? (face === 0 ? 1 : -1) : edge ? 1 : -1;
        const widthSide = face < 2 ? (edge ? 1 : -1) : face === 2 ? 1 : -1;
        const ripple = flex * Math.sin(a * 3 + widthSide * 0.3);
        const loopX = Math.sin(a) * (0.42 + (depth * THICKNESS) / 2 + ripple);
        const loopY = Math.cos(a) * (0.6 + (depth * THICKNESS) / 2 + ripple);
        positions.push(
          THREE.MathUtils.lerp((a - Math.PI) * 0.47, loopX, fold),
          THREE.MathUtils.lerp(0, loopY, fold),
          (widthSide * WIDTH) / 2 + flex * Math.sin(a * 2),
        );
        uvs.push(i / SEGMENTS, edge);
      }
      if (i < SEGMENTS) {
        const n = face * (SEGMENTS + 1) * 2 + i * 2;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function grainTexture() {
  const size = 128,
    bytes = new Uint8Array(size * size * 4);
  let seed = 71;
  for (let i = 0; i < size * size; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = 130 + (seed % 100);
    bytes.set([n, n, n, 255], i * 4);
  }
  const texture = new THREE.DataTexture(bytes, size, size);
  texture.needsUpdate = true;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 1);
  return texture;
}
export default function PaperChain({
  count,
  pulse,
}: {
  count: number;
  pulse: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<{
    setCount: (n: number) => void;
    nudge: () => void;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const initial = useRef(count);
  initial.current = count;
  const lastPulse = useRef(pulse);
  useEffect(() => {
    controller.current?.setCount(count);
  }, [count]);
  useEffect(() => {
    if (pulse !== lastPulse.current) {
      controller.current?.nudge();
      lastPulse.current = pulse;
    }
  }, [pulse]);
  useEffect(() => {
    let disposed = false,
      cleanup = () => {};
    async function start() {
      const R = (await import('@dimforge/rapier3d-compat')).default;
      await R.init();
      if (disposed || !host.current) return;
      const element = host.current;
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setClearColor('#edf0e9', 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      element.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);
      camera.position.set(0, 2.4, 12);
      camera.lookAt(0, -0.2, 0);
      scene.add(new THREE.HemisphereLight('#ffffff', '#a5aa96', 2.3));
      const key = new THREE.DirectionalLight('#fff9e9', 3.2);
      key.position.set(-3, 6, 7);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      Object.assign(key.shadow.camera, {
        left: -10,
        right: 10,
        top: 8,
        bottom: -8,
        near: 0.1,
        far: 30,
      });
      key.shadow.normalBias = 0.025;
      key.shadow.bias = -0.0001;
      key.shadow.radius = 5;
      scene.add(key);
      const fill = new THREE.DirectionalLight('#dfeafa', 1);
      fill.position.set(5, 0, -3);
      scene.add(fill);
      const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 30),
        new THREE.ShadowMaterial({ opacity: 0.12 }),
      );
      wall.position.z = -1.05;
      wall.receiveShadow = true;
      scene.add(wall);
      const grain = grainTexture();
      const materials = COLORS.map(
        (color) =>
          new THREE.MeshStandardMaterial({
            color,
            roughness: 1,
            metalness: 0,
            side: THREE.DoubleSide,
            bumpMap: grain,
            bumpScale: 0.018,
          }),
      );
      const world = new R.World({ x: 0, y: -9.81, z: 0 });
      world.numSolverIterations = 12;
      world.timestep = 1 / 60;
      type Link = {
        body: RAPIER.RigidBody;
        mesh: THREE.Mesh;
        birth: number;
        newLink: boolean;
        deformed: boolean;
      };
      let viewCenter = 0;
      let links: Link[] = [],
        anchors: RAPIER.RigidBody[] = [],
        pins: THREE.Mesh[] = [],
        wanted = initial.current,
        clock = 0,
        raf = 0,
        previous = performance.now(),
        accumulator = 0,
        dragged: Link | null = null;
      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      const raycaster = new THREE.Raycaster(),
        pointer = new THREE.Vector2(),
        dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
        hit = new THREE.Vector3();
      function populate(n: number, animate: boolean) {
        for (const link of links) {
          scene.remove(link.mesh);
          link.mesh.geometry.dispose();
          world.removeRigidBody(link.body);
          for (const child of link.mesh.children) {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          }
        }
        links = [];
        for (const anchor of anchors) world.removeRigidBody(anchor);
        anchors = [];
        for (const pin of pins) {
          scene.remove(pin);
          pin.geometry.dispose();
          (pin.material as THREE.Material).dispose();
        }
        pins = [];
        const amount = Math.max(1, Math.min(n, 16));
        const span = amount < 4 ? 0 : Math.min(8, (amount - 1) * 0.58);
        // Choose sag from the physical chain length, then distribute links at
        // equal arc lengths. This avoids stretched joints and initial explosions.
        const target = (amount - 1) * 0.86;
        let low = 0,
          high = 10;
        const arc = (depth: number) => {
          let length = 0;
          for (let j = 0; j < 100; j++) {
            const t = (j + 0.5) / 100;
            length +=
              Math.hypot(span, Math.PI * depth * Math.cos(t * Math.PI)) / 100;
          }
          return length;
        };
        for (let j = 0; j < 24; j++) {
          const mid = (low + high) / 2;
          if (arc(mid) < target) low = mid;
          else high = mid;
        }
        const sag = amount < 4 ? 0 : (low + high) / 2;
        const arcSamples = [0];
        for (let j = 1; j <= 100; j++) {
          const t = (j - 0.5) / 100;
          arcSamples.push(
            arcSamples[j - 1] +
              Math.hypot(span, Math.PI * sag * Math.cos(t * Math.PI)) / 100,
          );
        }
        camera.position.y = 2.0 - sag * 0.3;
        viewCenter = -sag * 0.35;
        camera.lookAt(0, viewCenter, 0);

        for (let i = 0; i < amount; i++) {
          const fraction = amount === 1 ? 0.5 : i / (amount - 1),
            goal = fraction * arcSamples[100];
          let sample = arcSamples.findIndex((v) => v >= goal);
          if (sample < 1) sample = 1;
          const t =
            (sample -
              1 +
              (goal - arcSamples[sample - 1]) /
                (arcSamples[sample] - arcSamples[sample - 1] || 1)) /
            100;
          const x = (t - 0.5) * span,
            y = amount < 4 ? 1 - i * 0.86 : 1.2 - Math.sin(t * Math.PI) * sag;
          const tangent = Math.atan2(
            span,
            Math.PI * sag * Math.cos(t * Math.PI),
          );
          const q = new THREE.Quaternion()
            .setFromAxisAngle(
              new THREE.Vector3(0, 0, 1),
              amount < 4 ? 0 : tangent,
            )
            .multiply(
              new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                Math.PI * 0.2 + ((i % 2) * Math.PI) / 2,
              ),
            );
          const fixed = i === 0 || (amount >= 4 && i === amount - 1);
          const desc = R.RigidBodyDesc.dynamic()
            .setTranslation(x, y, 0)
            .setRotation(q)
            .setLinearDamping(1.5)
            .setAngularDamping(2.0);
          const body = world.createRigidBody(desc);
          // Flat cuboids follow the oval perimeter; ring holes stay physically open.
          for (let j = 0; j < 16; j++) {
            const a = ((j + 0.5) / 16) * Math.PI * 2;
            const angle = Math.atan2(-0.6 * Math.sin(a), 0.42 * Math.cos(a));
            world.createCollider(
              R.ColliderDesc.cuboid(0.104, 0.018, WIDTH / 2)
                .setTranslation(Math.sin(a) * 0.42, Math.cos(a) * 0.6, 0)
                .setRotation({
                  x: 0,
                  y: 0,
                  z: Math.sin(angle / 2),
                  w: Math.cos(angle / 2),
                })
                .setDensity(0.16)
                .setFriction(0.65)
                .setRestitution(0.015),
              body,
            );
          }
          if (i > 0) {
            const joint = world.createImpulseJoint(
              R.JointData.spherical(
                { x: 0, y: -0.43, z: 0 },
                { x: 0, y: 0.43, z: 0 },
              ),
              links[i - 1].body,
              body,
              true,
            );
            joint.setContactsEnabled(false);
          }
          const fresh = animate && i === amount - 1 && !reduced;
          const mesh = new THREE.Mesh(
            paperGeometry(fresh ? 0 : 1),
            materials[i % materials.length],
          );
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.position.set(x, y, 0);
          mesh.quaternion.copy(q);
          scene.add(mesh);
          links.push({
            body,
            mesh,
            birth: clock,
            newLink: fresh,
            deformed: false,
          });
          // A small translucent overlap seam makes each strip read as glued paper.
          const seam = new THREE.Mesh(
            new THREE.BoxGeometry(0.027, 0.12, WIDTH + 0.009),
            new THREE.MeshStandardMaterial({
              color: COLORS[i % COLORS.length],
              roughness: 1,
              transparent: true,
              opacity: 0.7,
            }),
          );
          seam.position.set(0.025, 0.591, 0);
          mesh.add(seam);
          if (fixed) {
            const local = new THREE.Vector3(0, i === 0 ? 0.43 : -0.43, 0);
            const anchorPosition = local
              .clone()
              .applyQuaternion(q)
              .add(new THREE.Vector3(x, y, 0));
            const anchor = world.createRigidBody(
              R.RigidBodyDesc.fixed().setTranslation(
                anchorPosition.x,
                anchorPosition.y,
                anchorPosition.z,
              ),
            );
            anchors.push(anchor);
            world.createImpulseJoint(
              R.JointData.spherical({ x: 0, y: 0, z: 0 }, local),
              anchor,
              body,
              true,
            );
            const pin = new THREE.Mesh(
              new THREE.SphereGeometry(0.055, 12, 8),
              new THREE.MeshStandardMaterial({
                color: '#aab29d',
                roughness: 0.8,
              }),
            );
            pin.position.copy(anchorPosition);
            scene.add(pin);
            pins.push(pin);
          }
        }
        for (let k = 0; k < 90; k++) world.step();
        if (animate)
          for (const link of links)
            if (link.body.isDynamic())
              link.body.applyImpulse({ x: 0.005, y: 0, z: 0.013 }, true);
      }
      populate(wanted, false);
      const resize = () => {
        const w = element.clientWidth,
          h = element.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.position.z = camera.aspect < 1 ? 21 : 15;
        camera.lookAt(0, viewCenter, 0);
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      resize();
      const project = (e: PointerEvent) => {
        const r = element.getBoundingClientRect();
        pointer.set(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
      };
      const down = (e: PointerEvent) => {
        project(e);
        const selected = raycaster.intersectObjects(
          links.map((l) => l.mesh),
          false,
        )[0];
        if (selected) {
          dragged = links.find((l) => l.mesh === selected.object) ?? null;
          element.setPointerCapture(e.pointerId);
          element.style.cursor = 'grabbing';
        }
      };
      const move = (e: PointerEvent) => {
        if (!dragged) return;
        project(e);
        if (raycaster.ray.intersectPlane(dragPlane, hit)) {
          const p = dragged.body.translation();
          const dx = THREE.MathUtils.clamp(hit.x - p.x, -1, 1),
            dy = THREE.MathUtils.clamp(hit.y - p.y, -1, 1);
          if (dragged.body.isDynamic())
            dragged.body.applyImpulse(
              { x: dx * 0.002, y: dy * 0.002, z: 0.0003 },
              true,
            );
          else
            for (const link of links)
              if (link.body.isDynamic())
                link.body.applyImpulse(
                  { x: dx * 0.0004, y: dy * 0.0003, z: 0.0002 },
                  true,
                );
        }
      };
      const up = () => {
        dragged = null;
        element.style.cursor = 'grab';
      };
      element.addEventListener('pointerdown', down);
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', up);
      element.addEventListener('pointercancel', up);
      controller.current = {
        setCount(n) {
          if (wanted === n) return;
          const add = n > wanted;
          wanted = n;
          populate(n, add);
        },
        nudge() {
          for (const link of links)
            if (link.body.isDynamic())
              link.body.applyImpulse({ x: 0.009, y: 0.003, z: 0.008 }, true);
        },
      };
      const frame = (now: number) => {
        if (disposed) return;
        const dt = Math.min((now - previous) / 1000, 0.05);
        previous = now;
        clock += dt;
        accumulator += dt;
        if (!document.hidden) {
          while (accumulator >= 1 / 60) {
            world.step();
            accumulator -= 1 / 60;
          }
          for (const link of links) {
            const p = link.body.translation(),
              q = link.body.rotation();
            link.mesh.position.set(p.x, p.y, p.z);
            link.mesh.quaternion.set(q.x, q.y, q.z, q.w);
            const age = clock - link.birth;
            const speed = link.body.linvel();
            const flex = reduced
              ? 0
              : Math.min(0.014, Math.hypot(speed.x, speed.y, speed.z) * 0.002) *
                Math.sin(clock * 7);
            if (link.newLink || link.deformed || Math.abs(flex) > 0.0004) {
              const progress = link.newLink ? Math.min(1, age / 1.15) : 1;
              const smooth = progress * progress * (3 - 2 * progress);
              const geometry = paperGeometry(smooth, flex);
              link.mesh.geometry.dispose();
              link.mesh.geometry = geometry;
              link.mesh.position.z += (1 - smooth) * 1.8;
              if (progress === 1) link.newLink = false;
              link.deformed = Math.abs(flex) > 0.0004;
            }
          }
          renderer.render(scene, camera);
        } else accumulator = 0;
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      cleanup = () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        element.removeEventListener('pointerdown', down);
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', up);
        element.removeEventListener('pointercancel', up);
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            if (!materials.includes(o.material as THREE.MeshStandardMaterial)) {
              const m = o.material;
              Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose();
            }
          }
        });
        materials.forEach((m) => m.dispose());
        grain.dispose();
        world.free();
        renderer.dispose();
        renderer.domElement.remove();
        controller.current = null;
      };
    }
    start().catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);
  return (
    <div
      ref={host}
      className="paper-stage"
      role="img"
      aria-label={`A paper chain with ${count} walk links. Drag to make it sway.`}
    >
      {failed && (
        <p className="canvas-fallback">
          The paper chain needs WebGL. Your {count} walks are still saved — try
          the calendar view.
        </p>
      )}
    </div>
  );
}
