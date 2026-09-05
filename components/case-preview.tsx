'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCaseGeometry, type Artwork } from '@/lib/case-geometry';
export default function CasePreview({
  art,
  view,
  reset,
}: {
  art?: Artwork;
  view: string;
  reset: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    mesh: THREE.Mesh;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    renderer: THREE.WebGLRenderer;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() =>
        setError(
          '3D preview needs WebGL. You can still upload artwork and export your STL.',
        ),
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
    camera.position.set(-105, 60, -370);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xfff8ee, 0xb4a1b6, 2.5));
    const light = new THREE.DirectionalLight(0xfff5e3, 3.5);
    light.position.set(-150, 170, -200);
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xe3deff, 2);
    fill.position.set(160, -10, 160);
    scene.add(fill);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe1c4a5,
      roughness: 0.72,
      metalness: 0.03,
    });
    const mesh = new THREE.Mesh(createCaseGeometry(), [mat, mat.clone()]);
    scene.add(mesh);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 235;
    controls.maxDistance = 650;
    controls.target.set(0, 0, 3);
    controls.update();
    sceneRef.current = { mesh, camera, controls, renderer };
    const observer = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    observer.observe(el);
    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    const lost = (e: Event) => {
      e.preventDefault();
      setError(
        'The 3D preview was interrupted. Reload to restore it; STL export is still available.',
      );
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    const key = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
        return;
      e.preventDefault();
      const offset = camera.position.clone().sub(controls.target);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
        offset.applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          e.key === 'ArrowLeft' ? 0.15 : -0.15,
        );
      else
        offset.applyAxisAngle(
          new THREE.Vector3(1, 0, 0),
          e.key === 'ArrowUp' ? 0.15 : -0.15,
        );
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    el.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.MeshStandardMaterial[]).forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      el.removeEventListener('keydown', key);
    };
  }, []);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.mesh.geometry.dispose();
    s.mesh.geometry = createCaseGeometry(art);
    const m = (s.mesh.material as THREE.MeshStandardMaterial[])[0];
    m.map?.dispose();
    m.map = null;
    m.color.setHex(0xe1c4a5);
    // Preview color follows exactly the same cropped pixels as the height field. STL uses relief only.
    if (art && view === 'artwork') {
      const tex = new THREE.DataTexture(
        new Uint8Array(art.data),
        art.width,
        art.height,
        THREE.RGBAFormat,
      );
      tex.flipY = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      m.map = tex;
      m.color.setHex(0xffffff);
    }
    m.needsUpdate = true;
  }, [art, view]);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.camera.position.set(-105, 60, -370);
    s.controls.target.set(0, 0, 3);
    s.controls.update();
  }, [reset]);
  return (
    <div
      ref={host}
      className="preview-scene"
      // The WebGL surface handles arrow keys through its native listener.
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      role="application"
      aria-label="Interactive 3D Kindle back case. Drag or use arrow keys to rotate. Scroll to zoom."
    >
      {error && <div className="scene-fallback">{error}</div>}
    </div>
  );
}
