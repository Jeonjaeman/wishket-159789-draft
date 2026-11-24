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
const all = html + css + js;

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
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
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
  for (const s of ['시연용 규칙 계산 · 실제 AI 아님 · 확정 견적 아님', '운영자 확인 대기(시연)', '실제 접수되지 않았습니다', '운영자 개념 화면 · 확정·배정 기능 미구현', '검토 대기 화면 보기', '예시 요청 시작하기', '가상 서비스', '<span class="nw">작은 부탁부터,</span><br><span class="nw">차근차근.</span>', 'A little help. A lighter day.', '정적 제안 시안']) {
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

test('장면 전환: 짧은 띠(최대 300px·모바일 220px), 캡션 1줄만 읽히고 경로 SVG는 장식, 스크롤 타임라인 + rAF 폴백, 모션 축소 존중, 무한 반복 없음', () => {
  const scene = html.match(/<div class="scene">[\s\S]*?<\/svg>\s*<\/div>\s*<\/div>/);
  assert.ok(scene, 'scene 블록 없음');
  assert.equal(scene[0].replace(/<[^>]+>/g, '').trim(), '조건을 고르고, 예상 범위를 확인하세요.', '장면 블록의 읽히는 텍스트는 캡션 1줄만');
  assert.match(scene[0], /<svg class="scene-route"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(scene[0], /<div class="scene"[^>]*aria-hidden/, '캡션이 있으므로 부모를 숨기지 않음');
  assert.match(css, /\.scene \{[^}]*height: clamp\(180px, 28vh, 300px\);/);
  assert.match(css, /\.scene \{[^}]*margin: 0 12px;/, '히어로와 띠 사이 여분 크림 여백 없음');
  assert.match(css, /@media \(max-width: 899px\) \{ \.scene \{ max-height: 220px; \} \}/);
  assert.match(css, /\.scene-caption \{[^}]*color: #fff;[^}]*word-break: keep-all;/);
  assert.match(css, /\.demo \{[^}]*padding-top: clamp\(28px, 4vw, 56px\);/);
  assert.match(css, /@property --p \{ syntax: '<number>'; inherits: true; initial-value: 1; \}/);
  assert.match(css, /@supports \(animation-timeline: view\(\)\) \{\s*\.scene \{ animation: scene-reveal linear both; animation-timeline: view\(\); animation-range: entry 10% cover 55%; \}/);
  assert.match(css, /\.scene-surface \{[\s\S]*?clip-path: inset\(/);
  assert.doesNotMatch(css.match(/\.scene[\s\S]*?\.demo \{/)[0], /infinite/);
  assert.match(js, /CSS\.supports\('animation-timeline: view\(\)'\)/);
  assert.match(js, /addEventListener\('scroll', schedule, \{ passive: true \}\)/);
  assert.match(js, /requestAnimationFrame\(update\)/);
  assert.equal((js.match(/getBoundingClientRect/g) || []).length, 1, '프레임당 레이아웃 읽기 1회');
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.demo\.is-in \{ animation: demo-rise \.85s cubic-bezier\(\.22,1,\.36,1\) both; \}/);
  assert.match(css, /@keyframes demo-rise \{ from \{ transform: translateY\(40px\); \} to \{ transform: translateY\(0\); \} \}/);
  assert.doesNotMatch(css, /opacity: 0/);
  assert.doesNotMatch(css, /\.demo(?!\.is-in)[^{]*\{[^}]*transform:/);
});

test('상단 띠: 12px 글자·18px 줄간격·24px 이상 높이, 문구 유지', () => {
  assert.match(css, /\.demo-band \{ min-height: 24px; padding: 3px 12px;[^}]*font-size: 12px; line-height: 18px;/);
  assert.doesNotMatch(css, /\.demo-band \{[^}]*overflow: hidden/);
  assert.match(html, /<div class="demo-band" role="note"><span>정적 제안 시안 · 가상 서비스 · 실제 접수 없음<\/span><\/div>/);
});
