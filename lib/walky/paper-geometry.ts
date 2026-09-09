import * as THREE from 'three';

const SEGMENTS = 80,
  WIDTH = 0.34,
  THICKNESS = 0.012;

// Keep the GPU buffers alive while the thin paper ribbon folds and flexes.
export function updatePaperGeometry(
  geometry: THREE.BufferGeometry,
  fold = 1,
  flex = 0,
) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  let vertex = 0;
  for (let face = 0; face < 4; face++) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      for (let edge = 0; edge < 2; edge++) {
        const depth = face < 2 ? (face === 0 ? 1 : -1) : edge ? 1 : -1;
        const widthSide = face < 2 ? (edge ? 1 : -1) : face === 2 ? 1 : -1;
        const ripple = flex * Math.sin(a * 3 + widthSide * 0.3);
        const loopX = Math.sin(a) * (0.42 + (depth * THICKNESS) / 2 + ripple);
        const loopY = Math.cos(a) * (0.6 + (depth * THICKNESS) / 2 + ripple);
        position.setXYZ(
          vertex++,
          THREE.MathUtils.lerp((a - Math.PI) * 0.47, loopX, fold),
          THREE.MathUtils.lerp(0, loopY, fold),
          (widthSide * WIDTH) / 2 + flex * Math.sin(a * 2),
        );
      }
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function paperGeometry(fold = 1, flex = 0) {
  const geometry = new THREE.BufferGeometry();
  const count = 4 * (SEGMENTS + 1) * 2;
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const uvs = new Float32Array(count * 2),
    indices: number[] = [];
  let vertex = 0;
  for (let face = 0; face < 4; face++) {
    for (let i = 0; i <= SEGMENTS; i++) {
      for (let edge = 0; edge < 2; edge++) {
        uvs[vertex++] = i / SEGMENTS;
        uvs[vertex++] = edge;
      }
      if (i < SEGMENTS) {
        const n = face * (SEGMENTS + 1) * 2 + i * 2;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  updatePaperGeometry(geometry, fold, flex);
  (geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(
    THREE.DynamicDrawUsage,
  );
  // Covers the unfolded strip and folded loop, without recalculating on every frame.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.7);
  return geometry;
}
