// 가상 산식 모듈 — 시연용 규칙 계산. 실제 요금·AI·견적이 아님.
export const ZONES = ['A', 'B'];
export const SIZES = ['small', 'medium'];
export const RULES = Object.freeze({ base: 10000, crossZone: 5000, medium: 5000, stairs: 3000, spread: 5000 });
export const STATUS = Object.freeze({ draft: '예시 작성', range: '예상 범위 확인', pending: '운영자 검토 대기' });

export function estimate({ from, to, size, stairs } = {}) {
  if (!ZONES.includes(from)) throw new RangeError(`from must be one of ${ZONES.join('/')}`);
  if (!ZONES.includes(to)) throw new RangeError(`to must be one of ${ZONES.join('/')}`);
  if (!SIZES.includes(size)) throw new RangeError(`size must be one of ${SIZES.join('/')}`);
  if (typeof stairs !== 'boolean') throw new TypeError('stairs must be a boolean');
  const breakdown = [
    { key: 'base', label: '기본 요금', amount: RULES.base },
    { key: 'zone', label: from === to ? `같은 구역 (${from}→${to})` : `다른 구역 가산 (${from}→${to})`, amount: from === to ? 0 : RULES.crossZone },
    { key: 'size', label: size === 'medium' ? '중형 짐 가산' : '소형 짐', amount: size === 'medium' ? RULES.medium : 0 },
    { key: 'stairs', label: stairs ? '계단 있음 가산' : '계단 없음', amount: stairs ? RULES.stairs : 0 },
  ];
  const min = breakdown.reduce((sum, row) => sum + row.amount, 0);
  return { breakdown, min, max: min + RULES.spread };
}

export const formatWon = (n) => `${n.toLocaleString('ko-KR')}원`;

// 메모리 상태 — 새로고침 시 초기화, 저장소 없음.
export const createState = () => ({ from: 'A', to: 'A', size: 'small', stairs: false, step: 1, pendingSnapshot: null });
export const conditionsOf = (s) => ({ from: s.from, to: s.to, size: s.size, stairs: s.stairs });
const sameConditions = (a, b) => !!a && !!b && a.from === b.from && a.to === b.to && a.size === b.size && a.stairs === b.stairs;

export function setCondition(state, key, value) {
  if (!['from', 'to', 'size', 'stairs'].includes(key)) throw new RangeError(`unknown condition ${key}`);
  const next = { ...state, [key]: value };
  estimate(conditionsOf(next)); // 열거값 검증
  if (next.pendingSnapshot && !sameConditions(next.pendingSnapshot, conditionsOf(next))) next.pendingSnapshot = null;
  return next;
}
export const goToStep = (state, step) => ({ ...state, step: Math.min(4, Math.max(1, step)) });
export const markPending = (state) => ({ ...state, step: 4, pendingSnapshot: conditionsOf(state) });
export const isPending = (state) => sameConditions(state.pendingSnapshot, conditionsOf(state));
export const statusOf = (state) => (isPending(state) ? STATUS.pending : state.step >= 3 ? STATUS.range : STATUS.draft);
