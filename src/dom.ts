export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 새로 보인 화면(제목이나 화면 묶음)에 포커스를 준다. 누른 버튼이 숨으면 포커스가 사라져 스크린 리더가 새 화면을
 * 알리지 않고 Tab 이 처음부터 다시 시작하므로, 화면을 바꿀 때 부른다. `target` 은 Tab 순서에 넣지 않는다(tabindex -1).
 */
export function focusScreen(heading: HTMLElement): void {
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}
