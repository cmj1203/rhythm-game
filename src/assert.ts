export function assertNever(value: never): never {
  throw new TypeError(`unexpected variant: ${JSON.stringify(value)}`);
}
