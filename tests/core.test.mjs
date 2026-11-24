import test from 'node:test';
import assert from 'node:assert/strict';
import { estimate, RULES, ZONES, SIZES, formatWon, createState, setCondition, goToStep, markPending, isPending, statusOf, STATUS } from '../core.mjs';

test('샘플 예시 금액이 문서와 정확히 일치한다', () => {
  const a = estimate({ from: 'A', to: 'B', size: 'medium', stairs: true });
  assert.equal(a.min, 23000); assert.equal(a.max, 28000);
  const b = estimate({ from: 'A', to: 'A', size: 'small', stairs: false });
  assert.equal(b.min, 10000); assert.equal(b.max, 15000);
  assert.deepEqual(b.breakdown.map((r) => r.amount), [10000, 0, 0, 0]);
  assert.deepEqual(a.breakdown.map((r) => r.key), ['base', 'zone', 'size', 'stairs']);
});

test('16가지 입력 조합 전체가 산식과 일치한다', () => {
  let count = 0;
  for (const from of ZONES) for (const to of ZONES) for (const size of SIZES) for (const stairs of [false, true]) {
    const r = estimate({ from, to, size, stairs });
    const expectedMin = RULES.base + (from === to ? 0 : RULES.crossZone) + (size === 'medium' ? RULES.medium : 0) + (stairs ? RULES.stairs : 0);
    assert.equal(r.min, expectedMin, `${from}${to}/${size}/${stairs}`);
    assert.equal(r.max, expectedMin + RULES.spread);
    assert.equal(r.breakdown.reduce((s, row) => s + row.amount, 0), r.min);
    assert.equal(r.breakdown.length, 4);
    count += 1;
  }
  assert.equal(count, 16);
});

test('범위 경계: 최소 10000, 최대 28000', () => {
  const all = [];
  for (const from of ZONES) for (const to of ZONES) for (const size of SIZES) for (const stairs of [false, true]) all.push(estimate({ from, to, size, stairs }));
  assert.equal(Math.min(...all.map((r) => r.min)), 10000);
  assert.equal(Math.max(...all.map((r) => r.max)), 28000);
  assert.ok(all.every((r) => r.max - r.min === 5000));
});

test('잘못된 입력은 예외를 던진다 (자유 입력·문자열 불리언·누락)', () => {
  assert.throws(() => estimate({ from: 'C', to: 'A', size: 'small', stairs: false }), RangeError);
  assert.throws(() => estimate({ from: 'A', to: 'Z', size: 'small', stairs: false }), RangeError);
  assert.throws(() => estimate({ from: 'A', to: 'A', size: 'large', stairs: false }), RangeError);
  assert.throws(() => estimate({ from: 'A', to: 'A', size: 'small', stairs: 'true' }), TypeError);
  assert.throws(() => estimate({ from: 'A', to: 'A', size: 'small', stairs: 1 }), TypeError);
  assert.throws(() => estimate({ from: 'a', to: 'A', size: 'small', stairs: false }), RangeError);
  assert.throws(() => estimate({}), RangeError);
  assert.throws(() => estimate(), RangeError);
});

test('금액 표기', () => {
  assert.equal(formatWon(10000), '10,000원');
  assert.equal(formatWon(28000), '28,000원');
});

test('상태: 기본값 A A small false, 1단계, 대기 아님', () => {
  const s = createState();
  assert.deepEqual(s, { from: 'A', to: 'A', size: 'small', stairs: false, step: 1, pendingSnapshot: null });
  assert.equal(isPending(s), false);
  assert.equal(statusOf(s), STATUS.draft);
});

test('상태: 단계 이동과 상태 문구', () => {
  let s = goToStep(createState(), 3);
  assert.equal(statusOf(s), STATUS.range);
  s = markPending(s);
  assert.equal(s.step, 4);
  assert.equal(isPending(s), true);
  assert.equal(statusOf(s), STATUS.pending);
  assert.equal(goToStep(s, 9).step, 4);
  assert.equal(goToStep(s, -2).step, 1);
});

test('상태: 조건이 바뀌면 검토 대기가 해제되고 금액이 다시 계산된다', () => {
  let s = markPending(goToStep(createState(), 3));
  s = setCondition(s, 'size', 'medium');
  assert.equal(isPending(s), false);
  assert.equal(estimate(s).min, 15000);
  // 같은 값으로 되돌려도 스냅샷은 이미 지워졌으므로 대기로 돌아가지 않는다
  s = setCondition(s, 'size', 'small');
  assert.equal(isPending(s), false);
  assert.equal(statusOf(goToStep(s, 2)), STATUS.draft);
});

test('상태: 동일 값 재선택은 검토 대기를 유지한다', () => {
  let s = markPending(setCondition(createState(), 'to', 'B'));
  s = setCondition(s, 'to', 'B');
  assert.equal(isPending(s), true);
  assert.throws(() => setCondition(s, 'phone', '010'), RangeError);
  assert.throws(() => setCondition(s, 'from', 'C'), RangeError);
});
