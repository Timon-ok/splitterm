// Maps a cursor position inside a pane to a drop zone, the Windows-Snap-style affordance behind
// drag-to-tile. A central box means "swap with this pane"; the four outer regions mean "re-tile to
// that edge" (the dragged pane becomes a new column/row on that side). Pure + unit-tested; the
// renderer turns the screen point into the normalized (fx, fy) and the zone into a tree move.
import type { Dir } from '@shared/domain/layout-tree';

export type Zone = 'left' | 'right' | 'top' | 'bottom' | 'center';

// Half-extent of the central swap box around the pane center. 0.25 → the middle 50%×50% is "swap",
// the surrounding band splits into four edge zones by nearest border.
const CENTER_HALF = 0.25;

/** Pick a drop zone from a point normalized to the pane rect (fx, fy each in [0, 1]). */
export function pickZone(fx: number, fy: number): Zone {
  const x = Math.min(1, Math.max(0, fx));
  const y = Math.min(1, Math.max(0, fy));
  if (Math.abs(x - 0.5) < CENTER_HALF && Math.abs(y - 0.5) < CENTER_HALF) return 'center';
  // Outside the center: the closest edge wins.
  const dist = { left: x, right: 1 - x, top: y, bottom: 1 - y };
  let zone: Zone = 'left';
  let min = dist.left;
  if (dist.right < min) {
    min = dist.right;
    zone = 'right';
  }
  if (dist.top < min) {
    min = dist.top;
    zone = 'top';
  }
  if (dist.bottom < min) {
    min = dist.bottom;
    zone = 'bottom';
  }
  return zone;
}

/** Translate an edge zone into the split (direction, leading-side) it implies. `center` returns null. */
export function zoneToSplit(zone: Zone): { dir: Dir; before: boolean } | null {
  switch (zone) {
    case 'left':
      return { dir: 'row', before: true };
    case 'right':
      return { dir: 'row', before: false };
    case 'top':
      return { dir: 'col', before: true };
    case 'bottom':
      return { dir: 'col', before: false };
    case 'center':
      return null;
  }
}
