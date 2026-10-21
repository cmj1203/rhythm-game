export type Phrase = { readonly from: number; readonly count: number };

/** Earlier, complete one/two-bar gap sequences, longest first; no phrase overlaps its own source. */
export function phraseMatches(units: readonly number[]): ReadonlyMap<number, readonly Phrase[]> {
  const seen = new Map<string, Phrase[]>();
  const matches = new Map<number, readonly Phrase[]>();
  for (let start = 0; start < units.length; start++) {
    let beats = 0;
    const found: Phrase[] = [];
    for (let end = start; end < units.length && beats < 8; end++) {
      beats += Math.round((units[end] ?? 0) * 12) / 12;
      beats = Math.round(beats * 12) / 12;
      if (beats !== 4 && beats !== 8) continue;
      const count = end - start + 1;
      const key = units.slice(start, end + 1).join(",");
      const previous = seen.get(key) ?? [];
      found.unshift(...previous.filter(({ from, count: length }) => from + length <= start).slice().reverse());
      seen.set(key, [...previous, { from: start, count }]);
    }
    if (found.length > 0) matches.set(start, found);
  }
  return matches;
}
