'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { meshGeometry, type InlayDesign } from '@/lib/inlay-geometry';
import { hexColor } from '@/lib/color-separation';
import { type SupportedModel } from '@/lib/models';
export default function CasePreview({
  design,
  baseColor,
  view,
  reset,
}: {
  model: SupportedModel;
  design?: InlayDesign;
  baseColor: number;
  view: string;
  reset: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    mesh: THREE.Mesh;
    inserts: THREE.Group;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    renderer: THREE.WebGLRenderer;
    rake: THREE.DirectionalLight;
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
    // Compress highlights so pale filament retains detail at every angle.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
    camera.position.set(-105, 60, -370);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x89939f, 1.15));
    const light = new THREE.DirectionalLight(0xffffff, 1.8);
    light.position.set(-150, 170, -200);
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xffffff, 0.85);
    fill.position.set(160, -10, 160);
    scene.add(fill);
    const rake = new THREE.DirectionalLight(0xfff4e6, 0);
    rake.position.set(220, 30, -18);
    scene.add(rake);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe1c4a5,
      roughness: 0.9,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    scene.add(mesh);
    const inserts = new THREE.Group();
    scene.add(inserts);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 235;
    controls.maxDistance = 650;
    controls.target.set(0, 0, 3);
    controls.update();
    sceneRef.current = { mesh, inserts, camera, controls, renderer, rake };
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
      inserts.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      });
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      el.removeEventListener('keydown', key);
    };
  }, []);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.mesh.visible = Boolean(design);
    s.mesh.geometry.dispose();
    s.mesh.geometry = design
      ? meshGeometry(design.body)
      : new THREE.BufferGeometry();
    s.inserts.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    });
    s.inserts.clear();
    const layers = design?.layers ?? [];
    for (const layer of layers) {
      const insert = new THREE.Mesh(
        meshGeometry(layer.mesh),
        new THREE.MeshStandardMaterial({
          color: hexColor(design!.colors[layer.colorIndex]),
          roughness: 0.9,
          metalness: 0,
        }),
      );
      s.inserts.add(insert);
    }
    if (design) {
      const sculpted = design.kind === 'sculpted';
      const mat = s.mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(hexColor(design.colors[baseColor]));
      mat.roughness = sculpted ? 0.55 : 0.9;
      s.rake.intensity = sculpted ? 1.55 : 0;
    }
    s.inserts.visible = layers.length > 0 && view !== 'relief';
    s.inserts.position.z = view === 'exploded' ? -18 : 0;
  }, [design, baseColor, view]);
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
