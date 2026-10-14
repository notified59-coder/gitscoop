import { Suspense, useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Which way the model faces. If your logo shows up sideways or from behind,
// change FACE_Y to one of: 0, Math.PI / 2, -Math.PI / 2, Math.PI.
const FACE_Y = -Math.PI / 2;
const TURN = -0.3; // small resting turn so it never looks dead-flat

// Unlit copy of a material: keeps the model's own colours/texture, ignores every light.
function unlit(src) {
  if (!src) return src;
  return new THREE.MeshBasicMaterial({
    color: src.color ? src.color.clone() : new THREE.Color('#e5383b'),
    map: src.map || null,
    vertexColors: !!src.vertexColors,
    transparent: !!src.transparent,
    opacity: src.opacity ?? 1,
    alphaTest: src.alphaTest || 0,
    side: src.side,
    toneMapped: false,
  });
}

function Mark({ reduced }) {
  const { scene } = useGLTF('/models/laptop.glb');
  const group = useRef();
  const { camera, size } = useThree();

  // Centre the model at the origin and swap every material for an unlit one.
  const { model, dims } = useMemo(() => {
    const m = scene.clone(true);
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map(unlit) : unlit(o.material);
    });
    const box = new THREE.Box3().setFromObject(m);
    const s = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    m.position.sub(c);
    const wrap = new THREE.Group();
    wrap.add(m);
    return { model: wrap, dims: { w: Math.hypot(s.x, s.z), h: s.y } };
  }, [scene]);

  // Scale to whatever the canvas is, so the logo is never cropped (any shape, any orientation).
  const fit = useMemo(() => {
    const visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visW = visH * (size.width / Math.max(size.height, 1));
    return Math.min((visW * 0.82) / dims.w, (visH * 0.82) / dims.h);
  }, [camera, size, dims]);

  useFrame(({ pointer, clock }) => {
    if (!group.current) return;
    const ty = reduced ? 0 : pointer.x * 0.45;
    const tx = reduced ? 0 : -pointer.y * 0.15;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, FACE_Y + TURN + ty, 0.06);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, tx, 0.06);
    group.current.position.y = reduced ? 0 : Math.sin(clock.elapsedTime * 0.9) * 0.05;
  });

  return (
    <group ref={group} scale={fit}>
      <primitive object={model} />
    </group>
  );
}

export default function Hero3D() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  return (
    <Canvas flat dpr={[1, 2]} camera={{ position: [0, 0, 7], fov: 30 }} gl={{ antialias: true, alpha: true }}>
      {/* No lights on purpose: every material is unlit, so colours are exactly as authored. */}
      <Suspense fallback={null}>
        <Mark reduced={reduced} />
      </Suspense>
    </Canvas>
  );
}
useGLTF.preload('/models/laptop.glb');