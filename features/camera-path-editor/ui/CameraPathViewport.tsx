'use client';

import * as React from 'react';
import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useCameraPathStore } from '@/entities/camera-path';
import { useGaussianStore, parsePly, GaussianSplatMesh } from '@/entities/gaussian';
import { Button } from '@/shared/ui/button';
import { interpolateCameraPath } from '../lib/interpolate';

export function CameraPathViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const splatMeshRef = useRef<GaussianSplatMesh | null>(null);

  const { path, selectedId, previewTime, addKeyframe, selectKeyframe } = useCameraPathStore();
  const { plyFiles } = useGaussianStore();

  // ── Three.js 초기화 ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x0a0a12, 1);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 2000);
    camera.position.set(0, 2, 10);
    cameraRef.current = camera;

    const scene = new THREE.Scene();
    scene.add(new THREE.GridHelper(20, 20, 0x222233, 0x111122));
    scene.add(new THREE.AxesHelper(1));
    sceneRef.current = scene;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const syncSize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    syncSize();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      splatMeshRef.current?.update(camera.position);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      controls.dispose();
      splatMeshRef.current?.dispose();
      splatMeshRef.current = null;
      renderer.dispose();
    };
  }, []);

  // ── PLY 포인트 클라우드 로드 ──────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || plyFiles.length === 0) return;
    const scene = sceneRef.current;

    const plyPath = plyFiles[plyFiles.length - 1];

    (async () => {
      try {
        const raw = await window.electronAPI?.readPlyFile(plyPath);
        if (!raw || !sceneRef.current) return;

        const splat = await parsePly(raw);

        // Remove existing splat mesh
        const existing = scene.getObjectByName('pointcloud');
        if (existing) scene.remove(existing);
        splatMeshRef.current?.dispose();

        // Build Gaussian splat mesh
        const gsm = new GaussianSplatMesh(splat);
        gsm.name = 'pointcloud';
        scene.add(gsm);
        splatMeshRef.current = gsm;

        // Fit camera to splat bounding box
        const tempGeo = new THREE.BufferGeometry();
        tempGeo.setAttribute('position', new THREE.BufferAttribute(splat.positions.slice(), 3));
        tempGeo.computeBoundingBox();
        const center = new THREE.Vector3();
        const size   = new THREE.Vector3();
        tempGeo.boundingBox!.getCenter(center);
        tempGeo.boundingBox!.getSize(size);
        tempGeo.dispose();

        const radius = size.length() * 0.5;
        if (cameraRef.current && controlsRef.current) {
          controlsRef.current.target.copy(center);
          cameraRef.current.position.copy(center).add(new THREE.Vector3(0, radius * 0.3, radius * 1.5));
          controlsRef.current.update();
        }
      } catch (err) {
        console.error('PLY 로드 실패:', err);
      }
    })();
  }, [plyFiles]);

  // ── 카메라 패스 시각화 ──────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // 이전 패스 오브젝트 제거
    const toRemove = scene.children.filter((c) => c.name.startsWith('cam_'));
    toRemove.forEach((c) => {
      if (c instanceof THREE.Mesh || c instanceof THREE.Line || c instanceof THREE.ArrowHelper) {
        if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
      }
      scene.remove(c);
    });

    // 키프레임 구체 + 방향 화살표
    path.keyframes.forEach((kf) => {
      const isSelected = kf.id === selectedId;

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 10, 10),
        new THREE.MeshBasicMaterial({ color: isSelected ? 0xffcc00 : 0x4488ff }),
      );
      sphere.position.set(kf.position[0], kf.position[1], kf.position[2]);
      sphere.name = `cam_kf_${kf.id}`;
      scene.add(sphere);

      // 타겟 방향 화살표
      const start = new THREE.Vector3(kf.position[0], kf.position[1], kf.position[2]);
      const end = new THREE.Vector3(kf.target[0], kf.target[1], kf.target[2]);
      const dir = end.clone().sub(start);
      const len = dir.length();
      if (len > 0.001) {
        const arrow = new THREE.ArrowHelper(
          dir.normalize(),
          start,
          Math.min(len, 0.6),
          isSelected ? 0xffee88 : 0xaaccff,
          0.12,
          0.07,
        );
        arrow.name = `cam_arrow_${kf.id}`;
        scene.add(arrow);
      }
    });

    // 패스 스플라인
    if (path.keyframes.length >= 2) {
      const pts = path.keyframes.map(
        (kf) => new THREE.Vector3(kf.position[0], kf.position[1], kf.position[2]),
      );
      const curve = new THREE.CatmullRomCurve3(pts);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(100));
      const line = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({ color: 0x3366cc, transparent: true, opacity: 0.7 }),
      );
      line.name = 'cam_path_line';
      scene.add(line);
    }

    // 미리보기 위치 (빨간 점)
    if (path.keyframes.length >= 2) {
      const pose = interpolateCameraPath(path.keyframes, previewTime);
      if (pose) {
        const preview = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff3344 }),
        );
        preview.position.set(pose.position[0], pose.position[1], pose.position[2]);
        preview.name = 'cam_preview';
        scene.add(preview);
      }
    }
  }, [path.keyframes, selectedId, previewTime]);

  // ── 뷰포트 컨트롤 ───────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const dir = cam.position.clone().sub(ctrl.target);
    cam.position.copy(ctrl.target.clone().add(dir.multiplyScalar(0.8)));
    ctrl.update();
  }, []);

  const handleZoomOut = useCallback(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const dir = cam.position.clone().sub(ctrl.target);
    cam.position.copy(ctrl.target.clone().add(dir.multiplyScalar(1.25)));
    ctrl.update();
  }, []);

  const handleFitScene = useCallback(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const splat = splatMeshRef.current;
    if (!cam || !ctrl) return;
    if (splat && splat.count > 0) {
      const box = new THREE.Box3().setFromObject(splat);
      const center = new THREE.Vector3();
      const size   = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const radius = size.length() * 0.5;
      ctrl.target.copy(center);
      cam.position.copy(center.clone().add(new THREE.Vector3(0, radius * 0.3, radius * 1.5)));
    } else {
      ctrl.target.set(0, 0, 0);
      cam.position.set(0, 2, 10);
    }
    ctrl.update();
  }, []);

  const handleResetCamera = useCallback(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    cam.position.set(0, 2, 10);
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  }, []);

  const handleAddKeyframe = useCallback(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;

    addKeyframe({
      outputTime: previewTime,
      sceneTime: previewTime,
      position: [cam.position.x, cam.position.y, cam.position.z],
      target: [ctrl.target.x, ctrl.target.y, ctrl.target.z],
      fov: cam.fov,
    });
  }, [addKeyframe, previewTime]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!canvas || !scene || !camera) return;

      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);

      const spheres = scene.children.filter((c) => c.name.startsWith('cam_kf_'));
      const hits = raycaster.intersectObjects(spheres);

      if (hits.length > 0) {
        const id = hits[0].object.name.replace('cam_kf_', '');
        selectKeyframe(id);
      } else {
        selectKeyframe(null);
      }
    },
    [selectKeyframe],
  );

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full outline-none block"
        onClick={handleCanvasClick}
        style={{ cursor: 'crosshair' }}
      />

      {/* 빈 상태 안내 */}
      {plyFiles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-white/30 text-sm text-center">
            학습 완료 후 포인트 클라우드가 표시됩니다
          </p>
        </div>
      )}

      {/* 컨트롤 힌트 */}
      <div className="absolute top-3 left-3 text-white/25 text-xs space-y-0.5 pointer-events-none">
        <div>좌클릭 드래그: 회전</div>
        <div>우클릭 드래그: 이동</div>
        <div>스크롤: 줌</div>
      </div>

      {/* 줌 컨트롤 */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
        {(
          [
            { label: '+', title: '줌 인',    onClick: handleZoomIn },
            { label: '−', title: '줌 아웃',  onClick: handleZoomOut },
            { label: '⊡', title: '씬 맞추기', onClick: handleFitScene },
            { label: '↺', title: '카메라 리셋', onClick: handleResetCamera },
          ] as const
        ).map(({ label, title, onClick }) => (
          <button
            key={title}
            title={title}
            onClick={onClick}
            className="w-7 h-7 rounded bg-black/40 backdrop-blur border border-white/15 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/30 transition-all duration-150 text-sm flex items-center justify-center select-none"
          >
            {label}
          </button>
        ))}
      </div>

      {/* 키프레임 추가 버튼 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <Button variant="glass" size="sm" onClick={handleAddKeyframe}>
          + Capture Camera
        </Button>
      </div>
    </div>
  );
}
