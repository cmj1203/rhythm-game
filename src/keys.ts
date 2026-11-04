/** 혼자 눌러도 아무 글자도 만들지 않는 키. 준비 화면에서 이것만 눌렀을 때 곡이 시작되지 않게 한다. */
const LONE_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "Fn",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Tab",
]);

type KeyPress = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">;

/**
 * 준비 화면에서 이 키가 곡을 시작하는지. Cmd·Ctrl·Alt 조합은 브라우저 단축키로 두고, 수식키·잠금키 단독과
 * Tab('곡 선택' 버튼으로 가는 길)은 누름으로 치지 않는다.
 */
export function startsSong(event: KeyPress): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return !LONE_KEYS.has(event.key);
}
