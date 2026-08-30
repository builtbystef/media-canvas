export type Bounds = { left: number; top: number; right: number; bottom: number };

export function selectionTarget(
  mountedChain: readonly string[],
  enteredPath: readonly string[],
  deepest = false,
): string | null {
  if (mountedChain.length === 0) return null;
  if (deepest) return mountedChain[0] ?? null;
  if (enteredPath.length === 0) return mountedChain.at(-1) ?? null;
  const entered = enteredPath.at(-1)!;
  const index = mountedChain.indexOf(entered);
  return index > 0 ? mountedChain[index - 1]! : null;
}

export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((candidate) => candidate !== id)
    : [...selected, id];
}

export function marqueeSelection(
  marquee: Bounds,
  candidates: readonly { id: string; bounds: Bounds }[],
): string[] {
  return candidates
    .filter(
      ({ bounds }) =>
        !(
          bounds.right < marquee.left ||
          bounds.left > marquee.right ||
          bounds.bottom < marquee.top ||
          bounds.top > marquee.bottom
        ),
    )
    .map(({ id }) => id);
}

export function unionBounds(bounds: readonly Bounds[]): Bounds | null {
  if (bounds.length === 0) return null;
  return bounds.slice(1).reduce<Bounds>(
    (union, next) => ({
      left: Math.min(union.left, next.left),
      top: Math.min(union.top, next.top),
      right: Math.max(union.right, next.right),
      bottom: Math.max(union.bottom, next.bottom),
    }),
    { ...bounds[0]! },
  );
}
