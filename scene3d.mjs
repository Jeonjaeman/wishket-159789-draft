// 히어로 3D 마을 — 점진적 향상. 외부 텍스처·모델·CDN 없이 three.js(로컬 vendor)로 절차 생성한다.
// 직교(아이소메트릭) 카메라 · PCF 소프트 그림자 · 반구광 + 키/필/림 3단 조명 · 베벨 둥근 건물 · 창·보도·나무·배달 경로·소포.
// WebGL 이 없거나 모션 축소면 app.mjs 가 이 모듈을 부르지 않으므로 원본 SVG 가 그대로 남는다. 캔버스는 장식(aria-hidden).
import * as THREE from './vendor/three.module.js';

const C = {
  ground: 0xd3dcb5, groundSide: 0x9fb088, road: 0x8b958c, walk: 0xdfe3c9, lane: 0xf3f1a6,
  green: 0x3b7357, greenLight: 0x4f8a6c, cream: 0xefe9d2, creamLight: 0xfffdf2, dark: 0x36423c, terra: 0xe28a4a,
  roof: 0x5f9a7c, trunk: 0x6b4a2b, leaf: 0x3f7a58, leafLight: 0x7fb48a, orange: 0xe8792b, butter: 0xf3f1a6,
  kraft: 0xd9ac6b, ink: 0x1f2823, white: 0xffffff,
};
const SLAB = 13; // 지면 한 변
const TOP = 0.6; // 지면 윗면 높이

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...o });

/* 모서리를 둥글린 상자: 둥근 사각형을 돌출(베벨 포함)해 만든다. 로컬 +Z(돌출 방향)를 월드 +Y로 세운다 */
function roundedBox(w, d, h, r = 0.12, bevel = 0.05) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, h - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); // 돌출 방향을 위로
  g.translate(0, bevel, 0);  // 베벨 아랫면이 y=0 에 오도록
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const place = (mesh, x, y, z, { cast = true, receive = true } = {}) => { mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = receive; return mesh; };

/* 부드러운 접촉 그림자(소포 아래): 작은 캔버스 방사형 그라데이션 1장 */
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(31,40,35,.55)'); g.addColorStop(1, 'rgba(31,40,35,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function mountTown(host) {
  const stage = host.querySelector('.hero-art-stage') || host;
  const canvas = document.createElement('canvas');
  canvas.className = 'town-3d';
  canvas.setAttribute('aria-hidden', 'true');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 80);
  const target = new THREE.Vector3(0, 0.7, 0);
  const CAM_R = 24, CAM_Y = 20, CAM_ANGLE = Math.PI / 4;
  let depth = 0; // 스크롤 시차(0~1)
  const placeCamera = () => {
    const a = CAM_ANGLE + depth * 0.14;
    camera.position.set(Math.cos(a) * CAM_R, CAM_Y - depth * 2.5, Math.sin(a) * CAM_R);
    camera.lookAt(target);
  };
  /* 직교 절두체: 마을의 투영 폭·높이가 어떤 종횡비에서도 통째로 들어오도록(잘라내지 않음) */
  const frame = (w, h) => {
    const aspect = w / h;
    // 투영 범위 실측: 가로 ±9.19 · 세로 ±6.6 (지면 모서리·가장 높은 탑 포함) → 여유를 둔 ±9.9 · ±7.1
    let hw = Math.max(9.9, 7.1 * aspect);
    let hh = hw / aspect;
    const zoom = 1 + depth * 0.05;
    hw /= zoom; hh /= zoom;
    camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
    camera.updateProjectionMatrix();
  };

  // ── 조명: 반구(하늘 크림/지면 세이지) + 따뜻한 키(그림자) + 차가운 필 + 림
  scene.add(new THREE.HemisphereLight(0xfff6d8, 0xa7b58f, 1.05));
  const key = new THREE.DirectionalLight(0xfff0d2, 2.3);
  key.position.set(7, 13, 5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10.5, right: 10.5, top: 10.5, bottom: -10.5, near: 1, far: 40 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd7e6ff, 0.55); fill.position.set(-9, 6, -5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(-4, 5, 9); scene.add(rim);

  // ── 지면: 둥근 판 + 옆면 색, 도로·보도·차선·횡단보도
  const slab = place(new THREE.Mesh(roundedBox(SLAB, SLAB, TOP, 0.5, 0.08), mat(C.ground, { roughness: 0.95 })), 0, 0, 0, { cast: false });
  scene.add(slab);
  const under = place(new THREE.Mesh(box(SLAB - 0.2, 0.35, SLAB - 0.2), mat(C.groundSide)), 0, -0.17, 0, { cast: false, receive: false });
  scene.add(under);
  const roadM = mat(C.road, { roughness: 0.98 }), walkM = mat(C.walk, { roughness: 0.95 }), laneM = mat(C.lane, { roughness: 0.6 });
  const y0 = TOP + 0.01;
  for (const along of ['x', 'z']) {
    const rot = along === 'x' ? 0 : Math.PI / 2;
    const r = place(new THREE.Mesh(box(SLAB - 1, 0.02, 1.5), roadM), 0, y0, 0, { cast: false }); r.rotation.y = rot; scene.add(r);
    for (const side of [-1, 1]) { const w = place(new THREE.Mesh(box(SLAB - 1, 0.05, 0.5), walkM), 0, y0 + 0.015, side * 1.0, { cast: false }); w.rotation.y = rot; scene.add(w); }
    for (let i = -5; i <= 5; i++) { // 차선: 교차로 근처는 비운다
      if (Math.abs(i) < 2) continue;
      const dsh = place(new THREE.Mesh(box(0.42, 0.012, 0.06), laneM), i * 1.0, y0 + 0.012, 0, { cast: false, receive: false }); dsh.rotation.y = rot; scene.add(dsh);
    }
    for (let k = -2; k <= 2; k++) { // 횡단보도(교차로 두 입구)
      const cw = place(new THREE.Mesh(box(0.26, 0.012, 0.12), laneM), 1.2, y0 + 0.012, k * 0.3, { cast: false, receive: false }); cw.rotation.y = rot; scene.add(cw);
    }
  }

  // ── 건물: 둥근 베벨 상자 + 창(인스턴스) + 옥상 디테일
  const buildings = [
    { x: -3.0, z: -3.2, w: 2.6, d: 2.6, h: 5.2, c: C.green, roof: 'vent' },
    { x: -5.1, z: -3.6, w: 1.8, d: 2.2, h: 2.0, c: C.cream, roof: 'door' },
    { x: 3.4, z: -3.0, w: 3.0, d: 2.4, h: 2.4, c: C.cream, roof: 'parapet' },
    { x: 2.3, z: -5.3, w: 2.0, d: 1.8, h: 6.0, c: C.dark, roof: 'tank' },
    { x: -3.4, z: 3.0, w: 3.2, d: 2.6, h: 2.8, c: C.terra, roof: 'chimney' },
    { x: 3.2, z: 3.2, w: 2.8, d: 2.8, h: 3.0, c: C.greenLight, roof: 'garden' },
    { x: -5.2, z: 5.2, w: 1.6, d: 1.6, h: 1.6, c: C.creamLight },
    { x: 5.4, z: 1.9, w: 1.4, d: 1.4, h: 2.1, c: C.dark },
  ];
  const windows = [];
  const dummy = new THREE.Object3D();
  for (const b of buildings) {
    scene.add(place(new THREE.Mesh(roundedBox(b.w, b.d, b.h, 0.1, 0.05), mat(b.c)), b.x, TOP, b.z));
    const rows = Math.max(1, Math.floor((b.h - 0.8) / 0.62));
    for (const face of ['x', 'z']) { // 카메라를 향하는 +x · +z 면에만 창을 낸다
      const span = face === 'x' ? b.d : b.w;
      const cols = Math.max(1, Math.floor((span - 0.5) / 0.56));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const off = -(cols - 1) * 0.56 / 2 + i * 0.56;
        const y = TOP + 0.6 + j * 0.62;
        if (face === 'x') dummy.position.set(b.x + b.w / 2 + 0.08, y, b.z + off); else dummy.position.set(b.x + off, y, b.z + b.d / 2 + 0.08);
        dummy.rotation.set(0, face === 'x' ? Math.PI / 2 : 0, 0);
        dummy.updateMatrix();
        windows.push({ m: dummy.matrix.clone(), lit: ((i * 7 + j * 3 + b.x * 11) % 5) !== 0 });
      }
    }
    // 옥상 디테일
    const top = TOP + b.h;
    if (b.roof === 'vent') scene.add(place(new THREE.Mesh(box(0.7, 0.4, 0.7), mat(C.roof)), b.x + 0.5, top + 0.2, b.z - 0.5));
    if (b.roof === 'tank') { const t = place(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.6, 16), mat(0x9aa79f)), b.x - 0.3, top + 0.3, b.z + 0.3); scene.add(t); }
    if (b.roof === 'chimney') scene.add(place(new THREE.Mesh(box(0.34, 0.6, 0.34), mat(0xc4662c)), b.x - 1.0, top + 0.3, b.z - 0.7));
    if (b.roof === 'parapet') scene.add(place(new THREE.Mesh(box(b.w - 0.5, 0.14, b.d - 0.5), mat(0xddd5b7)), b.x, top + 0.07, b.z));
    if (b.roof === 'garden') scene.add(place(new THREE.Mesh(box(b.w - 0.8, 0.1, b.d - 0.8), mat(0x8fc0a4, { roughness: 1 })), b.x, top + 0.05, b.z, { cast: false }));
    if (b.roof === 'door') scene.add(place(new THREE.Mesh(box(0.05, 0.9, 0.5), mat(C.orange)), b.x + b.w / 2 + 0.03, TOP + 0.45, b.z + 0.4, { cast: false }));
  }
  const winMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.42), new THREE.MeshStandardMaterial({ color: C.butter, emissive: 0xf3e58a, emissiveIntensity: 0.5, roughness: 0.45 }), windows.length);
  const litCol = new THREE.Color(C.butter), dimCol = new THREE.Color(0xa9a98f);
  windows.forEach((w, i) => { winMesh.setMatrixAt(i, w.m); winMesh.setColorAt(i, w.lit ? litCol : dimCol); });
  winMesh.instanceMatrix.needsUpdate = true;
  scene.add(winMesh);

  // ── 나무
  const trunkG = new THREE.CylinderGeometry(0.07, 0.1, 0.6, 8), leafG = new THREE.SphereGeometry(0.42, 14, 10);
  const trunkM = mat(C.trunk), leafM = mat(C.leaf, { roughness: 0.95 }), leafLightM = mat(C.leafLight, { roughness: 0.95 });
  for (const [x, z, s] of [[1.9, 1.9, 1], [-1.9, 1.9, 0.9], [5.6, -1.9, 1], [-5.6, -5.6, 1.1], [1.9, 5.6, 1], [-1.9, -5.8, 0.9], [5.4, 4.9, 0.85]]) {
    const g = new THREE.Group(); g.position.set(x, TOP, z); g.scale.setScalar(s);
    g.add(place(new THREE.Mesh(trunkG, trunkM), 0, 0.3, 0));
    g.add(place(new THREE.Mesh(leafG, leafM), 0, 0.85, 0));
    const leaf2 = place(new THREE.Mesh(leafG, leafM), -0.22, 1.15, 0.1); leaf2.scale.setScalar(0.8); g.add(leaf2);
    const leaf3 = place(new THREE.Mesh(leafG, leafLightM), 0.2, 1.3, -0.12); leaf3.scale.setScalar(0.7); g.add(leaf3);
    scene.add(g);
  }

  // ── 배달 경로: 출발 핀 → 도로 → 교차로 → 도착 핀. 점선은 캡슐을 곡선 위에 늘어놓고 위상을 흘린다
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.4, 0, -1.55), new THREE.Vector3(3.4, 0, -0.45), new THREE.Vector3(2.0, 0, -0.45), new THREE.Vector3(0.8, 0, -0.35),
    new THREE.Vector3(0.45, 0, 0.4), new THREE.Vector3(0.45, 0, 2.2), new THREE.Vector3(0.9, 0, 3.2), new THREE.Vector3(1.55, 0, 3.2),
  ], false, 'centripetal', 0.5);
  const DASH_N = 30;
  const dashM = new THREE.MeshStandardMaterial({ color: C.orange, emissive: 0xb2521a, emissiveIntensity: 0.35, roughness: 0.5 });
  const dashes = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.055, 0.2, 2, 6), dashM, DASH_N);
  dashes.castShadow = false; scene.add(dashes);
  const UP = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), pt = new THREE.Vector3(), tan = new THREE.Vector3();
  const layDashes = (phase) => {
    for (let i = 0; i < DASH_N; i++) {
      const t = ((i / DASH_N + phase) % 1 + 1) % 1;
      curve.getPointAt(t, pt); curve.getTangentAt(t, tan);
      dummy.position.set(pt.x, TOP + 0.06, pt.z); dummy.quaternion.copy(q.setFromUnitVectors(UP, tan)); dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
  };
  const pinM = mat(C.orange, { roughness: 0.5 }), whiteM = mat(C.white, { roughness: 0.4 });
  const makePin = (x, z) => {
    const g = new THREE.Group(); g.position.set(x, TOP, z);
    const tip = place(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 20), pinM), 0, 0.5, 0); tip.rotation.x = Math.PI; g.add(tip);
    g.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), pinM), 0, 1.0, 0));
    g.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), whiteM), 0, 1.0, 0.24, { cast: false }));
    g.rotation.y = CAM_ANGLE; scene.add(g); return g;
  };
  const p0 = curve.getPointAt(0), p1 = curve.getPointAt(1);
  const pinA = makePin(p0.x, p0.z), pinB = makePin(p1.x, p1.z);

  // ── 소포: 교차로 위에 떠 있는 크라프트 상자 + 버터색 테이프 + 접촉 그림자
  const parcel = new THREE.Group();
  parcel.add(place(new THREE.Mesh(roundedBox(1.15, 1.15, 1.15, 0.08, 0.04), mat(C.kraft, { roughness: 0.8 })), 0, -0.575, 0));
  const tapeM = mat(C.butter, { roughness: 0.5 });
  parcel.add(place(new THREE.Mesh(box(1.19, 0.03, 0.2), tapeM), 0, 0.01, 0, { cast: false }));
  parcel.add(place(new THREE.Mesh(box(0.2, 0.03, 1.19), tapeM), 0, 0.012, 0, { cast: false }));
  parcel.add(place(new THREE.Mesh(box(0.2, 1.19, 0.03), tapeM), 0, -0.575, 0.585, { cast: false }));
  parcel.add(place(new THREE.Mesh(box(0.03, 1.19, 0.2), tapeM), 0.585, -0.575, 0, { cast: false }));
  parcel.add(place(new THREE.Mesh(box(0.3, 0.02, 0.18), mat(C.green)), -0.3, 0.025, -0.3, { cast: false })); // 라벨
  parcel.rotation.y = 0.35;
  scene.add(parcel);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.set(0, TOP + 0.02, 0); scene.add(blob);

  // ── 배달원(스쿠터): 경로를 따라 순환
  const courier = new THREE.Group();
  const wheelG = new THREE.CylinderGeometry(0.16, 0.16, 0.1, 14); wheelG.rotateZ(Math.PI / 2);
  const inkM = mat(C.ink, { roughness: 0.7 });
  courier.add(place(new THREE.Mesh(wheelG, inkM), 0, 0.16, 0.32));
  courier.add(place(new THREE.Mesh(wheelG, inkM), 0, 0.16, -0.32));
  courier.add(place(new THREE.Mesh(box(0.34, 0.14, 0.78), mat(C.green)), 0, 0.26, 0));
  courier.add(place(new THREE.Mesh(box(0.24, 0.34, 0.2), inkM), 0, 0.52, 0.05));
  courier.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), mat(C.butter)), 0, 0.8, 0.05));
  courier.add(place(new THREE.Mesh(box(0.3, 0.28, 0.28), mat(C.orange)), 0, 0.5, -0.32));
  scene.add(courier);
  const ahead = new THREE.Vector3();
  const driveCourier = (t) => {
    curve.getPointAt(t, pt); curve.getPointAt(Math.min(1, t + 0.01), ahead);
    courier.position.set(pt.x, TOP, pt.z);
    ahead.y = TOP; courier.lookAt(ahead);
  };

  // ── 루프: 보일 때만 그린다(IntersectionObserver + 탭 가시성). 시간은 dt 누적
  stage.appendChild(canvas);
  // Keep the SVG until a real frame has rendered successfully.
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    host.classList.remove('has-3d');
    canvas.hidden = true;
  });
  let w = 0, h = 0;
  const resize = () => {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (r.width !== w || r.height !== h) { w = r.width; h = r.height; renderer.setSize(w, h, false); }
    frame(w, h);
  };
  new ResizeObserver(resize).observe(stage);
  resize(); placeCamera(); layDashes(0); driveCourier(0.2);

  let time = 0, last = 0, visible = true, running = false;
  const tick = (now) => {
    // A queued RAF timestamp may precede performance.now() at initialization.
    // Negative time otherwise creates a negative curve parameter on frame one.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0)); last = now; time += dt;
    parcel.position.y = TOP + 1.25 + Math.sin(time * 1.3) * 0.12;
    parcel.rotation.y = 0.35 + Math.sin(time * 0.5) * 0.08;
    blob.scale.setScalar(1 - (parcel.position.y - TOP - 1.13) * 0.9);
    pinA.position.y = TOP + Math.sin(time * 1.6) * 0.05; pinB.position.y = TOP + Math.sin(time * 1.6 + 1.2) * 0.05;
    layDashes((time * 0.08) % 1);
    driveCourier((time * 0.045 + 0.2) % 1);
    renderer.render(scene, camera);
    host.classList.add('has-3d');
  };
  const setRunning = (on) => {
    if (on === running) return;
    running = on;
    if (on) { last = performance.now(); renderer.setAnimationLoop(tick); } else renderer.setAnimationLoop(null);
  };
  const sync = () => setRunning(visible && document.visibilityState === 'visible');
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); sync(); }, { rootMargin: '80px' }).observe(host);
  document.addEventListener('visibilitychange', sync);
  sync();

  return {
    setDepth(v) {
      const d = Math.min(1, Math.max(0, v));
      if (d === depth) return;
      depth = d; placeCamera(); frame(w || 1, h || 1);
    },
  };
}
