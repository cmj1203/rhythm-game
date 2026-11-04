/** 0 에서 1 로 가는 완급 곡선들. `t` 는 0~1. */

/** 3차: 빨리 나가 천천히 멈춘다. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 3차: 천천히 나가 가운데서 빠르고 천천히 멈춘다. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/** 2차: easeInOutCubic 보다 덜 급하다. */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
