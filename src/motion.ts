/**
 * 기기의 '움직임 줄이기' 설정. 모든 화면이 이 하나를 읽는다. 값은 매번 `.matches` 로 읽어 설정이 바뀌면 바로 따르고,
 * 멈춰 있는 루프를 다시 걸어야 하는 곳은 `change` 이벤트를 듣는다.
 */
export const REDUCED_MOTION: MediaQueryList = window.matchMedia("(prefers-reduced-motion: reduce)");
