/**
 * 이 브라우저의 저장소(localStorage)를 읽고 쓰는 한 곳.
 * 브라우저가 저장소를 막거나(SecurityError: 사이트 데이터 차단, 일부 사생활 모드) 가득 차서(QuotaExceededError)
 * 거절하면 던지지 않고, 읽기는 아무것도 없는 것으로, 쓰기는 실패로 돌려준다. 저장하지 못해도 게임은 계속된다.
 * 그 밖의 예외(코드의 잘못)는 그대로 던진다.
 */

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** `localStorage` 자체를 읽는 것도 막힌 브라우저에서는 예외가 나므로, 쓸 때마다 물어본다. */
function browserStorage(): Store {
  return globalThis.localStorage;
}

function refused(error: unknown, what: string): void {
  if (!(error instanceof DOMException)) throw error;
  console.warn(`저장소를 ${what} 못했습니다:`, error.message);
}

/** `key` 에 저장된 글, 없거나 브라우저가 읽기를 거절하면 null. */
export function readStored(key: string, storage?: Pick<Storage, "getItem">): string | null {
  try {
    return (storage ?? browserStorage()).getItem(key);
  } catch (error) {
    refused(error, "읽지");
    return null;
  }
}

/** `key` 에 `value` 를 저장한다. 브라우저가 거절하면 false. */
export function writeStored(key: string, value: string, storage?: Pick<Storage, "setItem">): boolean {
  try {
    (storage ?? browserStorage()).setItem(key, value);
    return true;
  } catch (error) {
    refused(error, "쓰지");
    return false;
  }
}

/** `key` 를 지운다. 브라우저가 거절하면 그대로 둔다. */
export function removeStored(key: string, storage?: Pick<Storage, "removeItem">): void {
  try {
    (storage ?? browserStorage()).removeItem(key);
  } catch (error) {
    refused(error, "지우지");
  }
}

/** `key` 에 저장된 수, 없거나 비었거나 수가 아니거나 읽기가 거절되면 `fallback`. `Number("")` 은 0 이라 빈 값은 따로 거른다. */
export function readStoredNumber(key: string, fallback: number, storage?: Pick<Storage, "getItem">): number {
  const saved = readStored(key, storage);
  if (saved === null || saved.trim() === "") return fallback;
  const value = Number(saved);
  return Number.isFinite(value) ? value : fallback;
}

/** 저장된 JSON 을 읽은 결과: 없음(또는 읽기 거절), 읽은 값, 또는 JSON 으로 읽히지 않는 원래 글. */
export type StoredJson =
  | { readonly kind: "none" }
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "broken"; readonly raw: string };

/** `key` 에 저장된 JSON. 깨진 글은 덮어쓰기 전에 옮겨 둘 수 있도록 원래 글을 함께 돌려준다. */
export function readStoredJson(key: string, storage?: Pick<Storage, "getItem">): StoredJson {
  const saved = readStored(key, storage);
  if (saved === null) return { kind: "none" };
  try {
    return { kind: "value", value: JSON.parse(saved) };
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: "broken", raw: saved };
    throw error;
  }
}
