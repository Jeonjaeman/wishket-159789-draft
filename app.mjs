import { createState, setCondition, goToStep, markPending, isPending, statusOf, estimate, conditionsOf, formatWon } from './core.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const LABEL = { size: { small: '소형', medium: '중형' }, stairs: { true: '계단 있음', false: '계단 없음' } };
const STEP_NAME = ['', '서비스 확인', '조건 선택', '예상 범위', '검토 대기'];

let state = createState();
const form = $('#wizard');
const live = $('#wizard-live');

function describe(s) {
  return [['출발', `구역 ${s.from}`], ['도착', `구역 ${s.to}`], ['짐 크기', LABEL.size[s.size]], ['계단', LABEL.stairs[s.stairs]]];
}
const dl = (rows) => rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

function render({ focus = false, announce = '' } = {}) {
  const est = estimate(conditionsOf(state));
  const rangeText = `${formatWon(est.min)} ~ ${formatWon(est.max)}`;
  const status = statusOf(state);

  $$('.stepper li').forEach((li) => {
    const n = Number(li.dataset.step);
    if (n === state.step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    li.classList.toggle('is-done', n < state.step);
  });
  $$('.step-panel').forEach((p) => p.classList.toggle('is-active', Number(p.dataset.panel) === state.step));

  $$('[data-range]').forEach((el) => { el.textContent = rangeText; });
  $$('[data-status]').forEach((el) => { el.textContent = status; });
  $('[data-breakdown]').innerHTML = est.breakdown.map((r) => `<tr><td>${r.label}</td><td>${r.amount ? `+${formatWon(r.amount)}` : '0원'}</td></tr>`).join('')
    + `<tr class="total"><td>기준 금액 · 예상 범위</td><td>${formatWon(est.min)} · ${rangeText}</td></tr>`;
  const rows = describe(state);
  $('[data-summary]').innerHTML = dl(rows);
  $('[data-final]').innerHTML = dl([...rows, ['예상 범위', rangeText], ['상태', status]]);
  $('[data-op-conditions]').textContent = `${state.from} → ${state.to} · ${LABEL.size[state.size]} · ${LABEL.stairs[state.stairs]}`;

  $$('[data-cond]', form).forEach((el) => {
    const v = String(state[el.dataset.cond]);
    if (el.type === 'radio') el.checked = el.value === v; else el.value = v;
  });

  if (announce) live.textContent = announce;
  if (focus) $(`.step-panel[data-panel="${state.step}"] h3`)?.focus({ preventScroll: false });
}

function go(step, extra = '') {
  state = goToStep(state, step);
  render({ focus: true, announce: `${state.step}단계 ${STEP_NAME[state.step]}. ${extra}`.trim() });
}

form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('change', (e) => {
  const key = e.target.dataset?.cond;
  if (!key) return;
  const value = key === 'stairs' ? e.target.value === 'true' : e.target.value;
  const wasPending = isPending(state);
  state = setCondition(state, key, value);
  render({ announce: wasPending && !isPending(state) ? '조건이 바뀌어 검토 대기 상태가 해제되었습니다. 예상 범위가 다시 계산됩니다.' : '' });
});
form.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.go) go(Number(btn.dataset.go), btn.dataset.go === '3' ? `예상 범위 ${$('[data-range]').textContent}.` : '');
  else if ('pending' in btn.dataset) { state = markPending(state); render({ focus: true, announce: '4단계 검토 대기. 운영자 확인 대기(시연). 실제 접수되지 않았습니다.' }); }
  else if ('reset' in btn.dataset) { state = createState(); go(1, '처음 상태로 돌아갔습니다.'); }
});

/* 모바일 메뉴: aria-expanded · Esc · 포커스 복귀 · 나머지 영역 inert */
const menuBtn = $('.menu-btn');
const nav = $('#site-nav');
const outside = ['#main', '.site-footer', '.brand'].map((s) => $(s));
function setMenu(open) {
  menuBtn.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('is-open', open);
  outside.forEach((el) => el.toggleAttribute('inert', open));
  if (open) $('a', nav).focus(); else menuBtn.focus();
}
const menuOpen = () => menuBtn.getAttribute('aria-expanded') === 'true';
menuBtn.addEventListener('click', () => setMenu(!menuOpen()));
nav.addEventListener('click', (e) => { if (e.target.closest('a') && menuOpen()) setMenu(false); });
document.addEventListener('keydown', (e) => {
  if (!menuOpen()) return;
  if (e.key === 'Escape') { e.preventDefault(); setMenu(false); }
  if (e.key === 'Tab') { // 메뉴 안에서만 순환
    const items = [menuBtn, ...$$('a', nav)];
    const i = items.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); items.at(-1).focus(); }
    else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
  }
});
const mq = matchMedia('(min-width: 900px)');
mq.addEventListener('change', () => { if (mq.matches && menuOpen()) setMenu(false); });

render();

/* 장면 전환 — CSS 스크롤 타임라인이 없을 때만 rAF 한 번에 --p 하나를 갱신 (scroll 핸들러는 플래그만 세움, 레이아웃 읽기는 프레임당 1회) */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const scene = $('.scene');
if (scene && !reduceMotion.matches && !(window.CSS && CSS.supports('animation-timeline: view()'))) {
  let queued = false;
  const update = () => {
    queued = false;
    const r = scene.getBoundingClientRect();
    const vh = innerHeight;
    // CSS의 animation-range: entry 10% → cover 55% 와 같은 구간
    const start = vh - r.height * 0.10;
    const span = 0.55 * (vh + r.height) - r.height * 0.10;
    const p = Math.min(1, Math.max(0, (start - r.top) / span));
    scene.style.setProperty('--p', p.toFixed(4));
  };
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  schedule();
}

/* 시연 무대 등장(.85s, 이동만). 관찰은 한 번뿐이며 등장 전에도 내용은 보인다 */
const demo = $('#demo');
if (demo && !reduceMotion.matches && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    demo.classList.add('is-in');
    io.disconnect();
  }, { rootMargin: '0px 0px -12% 0px' });
  io.observe(demo);
}
