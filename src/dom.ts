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

/**
 * 화면 버튼: `type="button"` 이고 누르면 `onClick`. `overGame` 이면 게임 화면 위에 있어서, 그 밖의 곳을 누르면
 * 노트 누름이나 곡 시작이 되는 pointerdown 이 이 버튼에서는 번지지 않게 막는다.
 */
export function screenButton(
  className: string,
  text: string,
  onClick: () => void,
  { overGame = false }: { readonly overGame?: boolean } = {},
): HTMLButtonElement {
  const button = element("button", className, text);
  button.type = "button";
  if (overGame) button.addEventListener("pointerdown", (event) => event.stopPropagation());
  button.addEventListener("click", onClick);
  return button;
}
