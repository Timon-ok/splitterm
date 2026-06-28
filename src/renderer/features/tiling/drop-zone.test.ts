import { describe, it, expect } from 'vitest';
import { pickZone, zoneToSplit } from './drop-zone';

describe('pickZone', () => {
  it('returns center for the middle of the pane', () => {
    expect(pickZone(0.5, 0.5)).toBe('center');
    expect(pickZone(0.4, 0.6)).toBe('center'); // still inside the 50%×50% box
  });

  it('returns the nearest edge in each band', () => {
    expect(pickZone(0.02, 0.5)).toBe('left');
    expect(pickZone(0.98, 0.5)).toBe('right');
    expect(pickZone(0.5, 0.02)).toBe('top');
    expect(pickZone(0.5, 0.98)).toBe('bottom');
  });

  it('picks the closer of two edges near a corner', () => {
    expect(pickZone(0.05, 0.4)).toBe('left'); // closer to left than top
    expect(pickZone(0.4, 0.05)).toBe('top'); // closer to top than left
  });

  it('clamps out-of-range input instead of misclassifying', () => {
    expect(pickZone(-1, 0.5)).toBe('left');
    expect(pickZone(2, 0.5)).toBe('right');
  });
});

describe('zoneToSplit', () => {
  it('maps edges to (direction, side)', () => {
    expect(zoneToSplit('left')).toEqual({ dir: 'row', before: true });
    expect(zoneToSplit('right')).toEqual({ dir: 'row', before: false });
    expect(zoneToSplit('top')).toEqual({ dir: 'col', before: true });
    expect(zoneToSplit('bottom')).toEqual({ dir: 'col', before: false });
  });

  it('returns null for center (handled as a swap)', () => {
    expect(zoneToSplit('center')).toBeNull();
  });
});
