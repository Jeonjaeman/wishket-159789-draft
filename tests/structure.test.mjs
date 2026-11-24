import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const html = read('index.html');
const css = read('style.css');
const js = read('app.mjs') + read('core.mjs');
const js3d = read('scene3d.mjs');
const readme = read('README.md');
const all = html + css + js + js3d;

test('모든 앵커가 같은 페이지의 id로 연결된다', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h !== 'style.css');
  assert.ok(hrefs.length >= 6);
  for (const h of hrefs) { assert.ok(h.startsWith('#'), `외부 링크 금지: ${h}`); assert.ok(ids.has(h.slice(1)), `id 없음: ${h}`); }
  for (const id of ['service', 'demo', 'flow', 'operator', 'site-nav']) assert.ok(ids.has(id));
});

test('네트워크·CDN·저장소 호출이 없다', () => {
  assert.doesNotMatch(all, /https?:\/\//);
  assert.doesNotMatch(all, /\b(fetch|XMLHttpRequest|WebSocket|navigator\.sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie)\b/);
  assert.doesNotMatch(html, /<(img|iframe|video|audio)\b/);
  assert.match(css, /@font-face[^}]*url\('assets\/fonts\/PretendardVariable\.woff2'\)/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.type, 'module');
  // 유일한 의존성은 로컬 vendor 로 복사한 three.js. 페이지는 node_modules 를 읽지 않는다
  assert.deepEqual(pkg.dependencies, { three: '0.180.0' });
  assert.equal(pkg.devDependencies, undefined);
  assert.doesNotMatch(all, /node_modules/);
  assert.deepEqual([...js3d.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['./vendor/three.module.js']);
  assert.match(read('vendor/three.module.js'), /from '\.\/three\.core\.js'/);
});

test('개인정보 입력 필드가 없고 선택지만 쓴다', () => {
  assert.doesNotMatch(html, /<textarea|type="(text|tel|email|file|password|search|number|url)"|capture=|autocomplete=/);
  const inputs = [...html.matchAll(/<input[^>]*type="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(inputs.length > 0 && inputs.every((t) => t === 'radio'));
  assert.equal((html.match(/<select\b/g) || []).length, 2);
  assert.doesNotMatch(html, /이름|전화|주소 입력|010-/);
});

test('버튼은 모두 type=button이고 폼 제출은 막힌다', () => {
  const buttons = html.match(/<button\b[^>]*>/g) || [];
  assert.ok(buttons.length >= 8);
  for (const b of buttons) assert.match(b, /type="button"/, b);
  assert.doesNotMatch(html, /type="submit"|action=|method=/);
  assert.match(html, /<form id="wizard"[^>]*novalidate/);
  assert.match(js, /addEventListener\('submit', \(e\) => e\.preventDefault\(\)\)/);
});

test('히어로 SVG는 접근 가능한 이름을 갖고 장식 요소는 숨긴다', () => {
  assert.match(html, /<svg class="town"[^>]*role="img"[^>]*aria-labelledby="town-title town-desc"/);
  assert.match(html, /<title id="town-title">[^<]+<\/title>/);
  assert.match(html, /<desc id="town-desc">[^<]+<\/desc>/);
  assert.match(html, /<div class="float-card" aria-hidden="true">/);
  assert.match(html, /class="brand-mark" aria-hidden="true"/);
});

test('필수 경계 문구와 라벨이 존재한다', () => {
  for (const s of ['시연용 규칙 계산 · 실제 AI 아님 · 확정 견적 아님', '운영자 확인 대기(시연)', '실제 접수되지 않았습니다', '개념 화면 · 확정·배정 미구현', '검토 대기 화면 보기', '예시 요청 시작하기', '가상 서비스', '<span class="nw">작은 부탁부터,</span><br><span class="nw">차근차근.</span>', 'A little help. A lighter day.', '정적 제안 시안']) {
    assert.ok(html.includes(s), `누락: ${s}`);
  }
  assert.doesNotMatch(html, /만족도|누적 \d|건 완료|평점|★|수상|인증 획득/);
});

test('메뉴·단계 접근성 속성', () => {
  assert.match(html, /<button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">/);
  assert.match(html, /<nav id="site-nav"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-current="step"/);
  assert.equal((html.match(/tabindex="-1"/g) || []).length, 4);
  assert.match(js, /key === 'Escape'/);
  assert.match(js, /toggleAttribute\('inert'/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('JS 없이도 마케팅 카피와 단계 내용이 숨겨지지 않는다', () => {
  assert.doesNotMatch(html, /<section[^>]*\bhidden\b/);
  assert.match(css, /\.js \.step-panel:not\(\.is-active\) \{ display: none; \}/);
  assert.match(css, /\.js \.site-nav \{ display: none; \}/);
});

test('히어로 헤드라인: 두 구절이 줄바꿈 금지 span이고 2줄 고정 크기(1440px 80~86px, 390px 40px 이상)', () => {
  assert.match(html, /<h1 id="hero-title"><span class="nw">작은 부탁부터,<\/span><br><span class="nw">차근차근\.<\/span><\/h1>/);
  assert.match(css, /h1 \.nw \{ white-space: nowrap;/);
  const desk = css.match(/^h1 \{ font-size: clamp\((\d+)px, ([\d.]+)vw, (\d+)px\)/m);
  assert.ok(desk, '데스크톱 h1 clamp 없음');
  const at1440 = Math.min(Number(desk[3]), Math.max(Number(desk[1]), Number(desk[2]) * 14.4));
  assert.ok(at1440 >= 80 && at1440 <= 86, `1440px 헤드라인 ${at1440}px`);
  const mob = css.match(/h1 \{ font-size: clamp\((\d+)px, ([\d.]+)vw, (\d+)px\); \} \/\* 768px/);
  assert.ok(mob, '모바일 h1 clamp 없음');
  assert.ok(Math.max(Number(mob[1]), Number(mob[2]) * 3.9) >= 40, '390px 헤드라인 40px 미만');
  assert.match(css, /grid-template-columns: minmax\(0, 52fr\) minmax\(0, 48fr\)/);
  assert.match(css, /\.lede \{[^}]*word-break: keep-all;/, '부제 어절 분리 금지');
  assert.match(css, /@media \(max-width: 900px\) \{ \.app-shell:has\(\.step-panel\[data-panel="4"\]\.is-active\) \.summary \{ display: none; \} \}/, '모바일 4단계만 요약 카드 숨김');
  assert.match(html, /<ellipse cx="404" cy="312" rx="330" ry="128" fill="url\(#g-shadow\)"\/>/, '지면 그림자');
});

test('섹션 순서: 히어로 → 장면 전환 → 접수 시연 → 서비스 안내 → 진행 흐름 → 운영자. 내비 링크 순서는 그대로', () => {
  const order = ['id="top"', 'class="scene"', 'id="demo"', 'id="service"', 'id="flow"', 'id="operator"'].map((k) => html.indexOf(k));
  assert.ok(order.every((i) => i > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  const nav = html.match(/<nav id="site-nav"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...nav.matchAll(/href="(#[^"]+)"/g)].map((m) => m[1]), ['#service', '#demo', '#flow', '#operator']);
  assert.match(html, /<a class="btn btn-dark" href="#demo">/);
});

test('장면 전환(B3·B5): 풀블리드 고정 무대, 읽히는 글은 클리핑 레이어 밖, 스크롤 타임라인 + rAF 폴백, 모션 축소는 완결 정지 장면, 무한 반복 없음', () => {
  const scene = html.match(/<div class="scene" id="scene">[\s\S]*?<\/ol>\s*<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(scene, 'scene 블록 없음');
  // 구조: .scene(트랙) > .scene-sticky > [.scene-surface(장식, 자식 없음)] + [.scene-stage(글·소포)]
  assert.match(scene[0], /<div class="scene-sticky">\s*<div class="scene-surface" aria-hidden="true"><\/div>\s*<div class="scene-stage">/, '지면은 빈 장식 레이어, 글은 그 형제');
  const text = scene[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.equal(text, '조건을 고르고, 예상 범위를 확인하세요. 부탁의 시작에서, 도움이 닿기까지. 01 예시 작성 02 예상 범위 03 검토 대기', '읽히는 텍스트: 캡션·문장·상태 표식 3개');
  assert.match(scene[0], /<p class="scene-title"><span class="nw">부탁의 시작에서,<\/span><br><span class="nw">도움이 닿기까지\.<\/span><\/p>/);
  assert.match(scene[0], /<div class="scene-track" aria-hidden="true">/);
  assert.match(scene[0], /<ol class="scene-status" aria-label="시연 진행 상태">/);
  assert.doesNotMatch(scene[0], /<h[1-6]/, '장면 문장은 제목 개요에 끼지 않는다');
  // 무대 크기: 트랙 155vh, 고정 무대 75vh(≥60vh), 여백 0 → 지면이 --p=1 에서 inset(0) = 뷰포트 폭 100%
  assert.match(css, /\.scene \{ --p: 1; position: relative; margin: 0; height: 155vh;/);
  assert.match(css, /\.scene-sticky \{ position: sticky; top: 64px; height: 75vh; min-height: 480px; overflow: hidden; \}/);
  assert.match(css, /\.scene-surface \{[\s\S]*?clip-path: inset\(calc\(10% \* \(1 - var\(--p\)\)\) calc\(7% \* \(1 - var\(--p\)\)\) round calc\(40px \* \(1 - var\(--p\)\)\)\);/);
  // 글 영역(inset 14%/10%)은 --p=0 의 지면(inset 10%/7%) 안쪽 → 어느 프레임에서도 지면 밖으로 나가지 않는다
  assert.match(css, /\.scene-stage \{ position: absolute; inset: 14% 10%;/);
  assert.match(css, /\.scene-title \{[^}]*font-size: clamp\(30px, 8\.2vw, 88px\);[^}]*word-break: keep-all;/);
  assert.match(css, /\.scene-caption \{[^}]*font-size: clamp\(13px, 1\.1vw, 16px\);/);
  assert.match(css, /\.scene-mark \{[^}]*font-size: 13px;/);
  assert.match(css, /@media \(max-width: 899px\) \{ \.scene-stage \{ inset: 12% 9%; \} \.scene-mark \{ min-height: 32px; font-size: 12px;/);
  // 소포·경로·표식이 --p 로 변한다 (스크롤 연동, 하이재킹 없음)
  assert.match(css, /\.scene-parcel \{[\s\S]*?left: calc\(var\(--p\) \* 100%\); top: calc\(\(100 - 240 \* var\(--p\) \* \(1 - var\(--p\)\)\) \/ 1\.2 \* 1%\);/);
  assert.match(css, /\.scene-path \{[^}]*stroke-dashoffset: calc\(1 - var\(--p\)\);[^}]*vector-effect: non-scaling-stroke;/);
  assert.match(css, /\.scene-mark\[data-mark="3"\] \{ --on: clamp\(0, \(var\(--p\) - \.66\) \* 6, 1\); \}/);
  assert.match(css, /@property --p \{ syntax: '<number>'; inherits: true; initial-value: 1; \}/);
  assert.match(css, /@supports \(animation-timeline: view\(\)\) \{[^}]*\.scene \{ animation: scene-reveal linear both; animation-timeline: view\(\); animation-range: cover 30% cover 66%; \}/);
  assert.doesNotMatch(css.match(/\.scene \{[\s\S]*?\.demo \{/)[0], /infinite/);
  assert.doesNotMatch(css, /scroll-snap|overscroll-behavior: none/);
  assert.match(js, /CSS\.supports\('animation-timeline: view\(\)'\)/);
  assert.match(js, /\(cover - 0\.30\) \/ 0\.36/, 'JS 폴백 구간 = CSS animation-range');
  assert.match(js, /addEventListener\('scroll', schedule, \{ passive: true \}\)/);
  assert.match(js, /requestAnimationFrame\(update\)/);
  assert.equal((js.match(/getBoundingClientRect/g) || []).length, 1, '프레임당 레이아웃 읽기 1회');
  assert.match(js, /hp = Math\.min\(1, Math\.max\(0, scrollY \/ \(vh \* 0\.9\)\)\)/, '히어로 시차는 scrollY 만 사용');
  assert.match(js, /prefers-reduced-motion: reduce/);
  // 모션 축소: 트랙 없이 무대만, --p 기본값 1 = 완결 장면
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.scene \{ height: auto; \}\s*\.scene-sticky \{ position: relative; top: 0; \}/);
  // 시연 무대 등장은 그대로(.85s ease-out, 이동만), 지면 폭을 이어받아 여백 0
  assert.match(css, /\.demo\.is-in \{ animation: demo-rise \.85s cubic-bezier\(\.22,1,\.36,1\) both; \}/);
  assert.match(css, /@keyframes demo-rise \{ from \{ transform: translateY\(40px\); \} to \{ transform: translateY\(0\); \} \}/);
  assert.match(css, /\.demo \{ max-width: none; margin: 0;[^}]*scroll-margin-top: 88px;/);
  assert.doesNotMatch(css, /opacity: 0/);
  assert.doesNotMatch(css, /\.demo(?!\.is-in)[^{]*\{[^}]*transform:/);
});

test('B1 금액 범위: 한 덩어리(nowrap) + clamp(24px, 6.2vw, 48px), 숫자와 원은 분리되지 않으며 합계 행은 범위 하나만', () => {
  assert.match(css, /\.range \{ font-size: clamp\(24px, 6\.2vw, 48px\);[^}]*white-space: nowrap;/);
  assert.match(css, /\.amt \{ white-space: nowrap; \}/);
  assert.match(js, /const rangeHTML = `<span class="amt">\$\{formatWon\(est\.min\)\}<\/span> ~ <span class="amt">\$\{formatWon\(est\.max\)\}<\/span>`;/);
  assert.match(js, /\$\$\('\[data-range\]'\)\.forEach\(\(el\) => \{ el\.innerHTML = rangeHTML; \}\);/);
  assert.match(js, /<tr class="total"><td>예상 범위<\/td><td class="amt">\$\{rangeCompact\}<\/td><\/tr>/);
  assert.match(js, /const rangeCompact = `\$\{est\.min\.toLocaleString\('ko-KR'\)\}~\$\{formatWon\(est\.max\)\}`;/);
  assert.doesNotMatch(js, /기준 금액 · 예상 범위/);
});

test('B2 제목류 keep-all: h1·h2·h3·장면 문장은 어절 단위로만 줄바꿈', () => {
  assert.match(css, /^h1, h2, h3 \{[^}]*word-break: keep-all; overflow-wrap: normal; \}/m);
  assert.match(css, /^\.nw \{ white-space: nowrap; display: inline-block; \}/m);
  for (const h of html.match(/<h[23][^>]*>[\s\S]*?<\/h[23]>/g)) {
    const t = h.replace(/<[^>]+>/g, '');
    assert.ok(t.split(/\s+/).every((w) => w.length <= 7), `긴 어절(320px 에서 넘칠 수 있음): ${t}`);
  }
});

test('B4 히어로 아트: viewBox 가 지면 그림자·건물 전체를 포함하고 meet 로 맞춘다(slice·확대 변환 없음), 스크롤 시차는 --hp 로', () => {
  assert.match(html, /<svg class="town" viewBox="60 36 690 420" preserveAspectRatio="xMidYMid meet"/);
  assert.doesNotMatch(css, /\.town \{[^}]*transform: scale/);
  assert.match(css, /\.town \{[^}]*overflow: visible; \}/);
  assert.match(css, /\.hero-art-stage \{[^}]*transform: translate3d\(0, calc\(var\(--hp\) \* -56px\), 0\) scale\(calc\(1 \+ var\(--hp\) \* \.06\)\);/);
  assert.match(css, /\.hero-art \{ min-height: 0; aspect-ratio: 690 \/ 470;/, '모바일 비율 = viewBox 비율 + 여백');
  assert.match(html, /<div class="hero-art">\s*<div class="hero-art-stage">\s*<svg class="town"/);
});

test('3D 히어로(점진적 향상): WebGL·모션 축소 확인 후 동적 import, 캔버스는 장식, 픽셀비 ≤1.5, 화면 밖·숨김 탭에서 정지, 외부 자원 없음', () => {
  assert.match(js3d, /new THREE\.WebGLRenderer/);
  assert.match(js3d, /catch \{ return null; \}/);
  assert.match(js, /if \(heroArt && !reduceMotion\.matches\) \{\s*import\('\.\/scene3d\.mjs'\)/);
  assert.match(js, /\.catch\(\(\) => \{ \/\* SVG 폴백 유지 \*\/ \}\)/);
  assert.match(js3d, /canvas\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(js3d, /renderer\.setPixelRatio\(Math\.min\(devicePixelRatio \|\| 1, 1\.5\)\)/);
  assert.match(js3d, /new THREE\.OrthographicCamera\(/);
  assert.match(js3d, /renderer\.shadowMap\.type = THREE\.PCFSoftShadowMap/);
  assert.match(js3d, /new THREE\.HemisphereLight\(/);
  assert.ok((js3d.match(/new THREE\.DirectionalLight\(/g) || []).length >= 3, '키·필·림 3단 조명');
  assert.match(js3d, /bevelEnabled: true/);
  assert.match(js3d, /new IntersectionObserver\(/);
  assert.match(js3d, /document\.addEventListener\('visibilitychange', sync\)/);
  assert.match(js3d, /renderer\.setAnimationLoop\(null\)/);
  assert.match(js3d, /host\.classList\.add\('has-3d'\)/);
  assert.match(css, /\.hero-art\.has-3d \.town \{ width: 1px; height: 1px;[^}]*clip: rect\(0 0 0 0\); \}/, 'SVG 는 보조 기술에 남는다');
  assert.match(css, /\.town-3d \{[^}]*pointer-events: none; \}/);
  assert.doesNotMatch(js3d, /TextureLoader|GLTFLoader|FileLoader|ImageLoader|\.load\(/);
  assert.doesNotMatch(js3d, /console\./);
});

test('안내 문구 정리: 띠 1 + 금액 캡션 1(결과 단계) + 푸터, 검토 대기·운영자 문구는 짧게 유지', () => {
  assert.equal((html.match(/시연용 규칙 계산 · 실제 AI 아님 · 확정 견적 아님/g) || []).length, 1);
  assert.doesNotMatch(html, /class="brand-tag"/);
  assert.doesNotMatch(html, /가상 구역|가상 산식|전송·저장·배정은 일어나지 않습니다|넓은 범위의 심부름을 약속하지 않고/);
  assert.match(html, /<h3 id="p4-title" tabindex="-1">실제 접수되지 않았습니다<\/h3>/);
  assert.match(html, /<p class="op-tag">개념 화면 · 확정·배정 미구현<\/p>/);
  assert.match(html, /<footer class="site-footer">[\s\S]*실제 서비스가 아닙니다[\s\S]*사업 요금이 아닙니다/);
  assert.match(css, /\.section \{[^}]*scroll-margin-top: 88px; \}/, '#demo 등 앵커 = 헤더 64 + 24');
  assert.match(readme, /HTTP 서버|정적 서버/);
  assert.doesNotMatch(readme, /바로 열거나/);
});

test('상단 띠: 12px 글자·18px 줄간격·24px 이상 높이, 문구 유지', () => {
  assert.match(css, /\.demo-band \{ min-height: 24px; padding: 3px 12px;[^}]*font-size: 12px; line-height: 18px;/);
  assert.doesNotMatch(css, /\.demo-band \{[^}]*overflow: hidden/);
  assert.match(html, /<div class="demo-band" role="note"><span>정적 제안 시안 · 가상 서비스 · 실제 접수 없음<\/span><\/div>/);
});

test('first RAF cannot create negative curve time and facade details remain outside bevels', () => {
  assert.match(js3d, /Math.max\(0, Math.min\(0.05/);
  assert.match(js3d, /h - 2 \* bevel/);
  assert.match(js3d, /b.w \/ 2 \+ 0.08/);
  assert.ok(js3d.indexOf("renderer.render(scene, camera);") < js3d.lastIndexOf("host.classList.add('has-3d')"));
});

test('fallback keeps SVG base placement outside animation and route reserves object half-width', () => {
  assert.match(html, /<g transform="translate\(606,120\)"><g class="clock">/);
  assert.doesNotMatch(html, /class="clock" transform=/);
  assert.match(css, /margin: clamp\(8px, 2vh, 20px\) clamp\(24px, 4vw, 56px\) 0/);
});
