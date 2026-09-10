import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  canRedo,
  canUndo,
  currentSnapshot,
  isDirty,
  pushHistory,
  redoHistory,
  resetHistory,
  undoHistory,
} from './pathHistory';

describe('pathHistory', () => {
  it('starts empty', () => {
    expect(currentSnapshot(EMPTY_HISTORY)).toBeNull();
    expect(canUndo(EMPTY_HISTORY)).toBe(false);
    expect(canRedo(EMPTY_HISTORY)).toBe(false);
    expect(isDirty(EMPTY_HISTORY)).toBe(false);
  });

  it('resets to a single base snapshot that is not dirty', () => {
    const h = resetHistory('a');
    expect(currentSnapshot(h)).toBe('a');
    expect(isDirty(h)).toBe(false);
    expect(canUndo(h)).toBe(false);
  });

  it('pushes, undoes and redoes', () => {
    const h1 = pushHistory(resetHistory('a'), 'b');
    expect(currentSnapshot(h1)).toBe('b');
    expect(isDirty(h1)).toBe(true);

    const h2 = undoHistory(h1);
    expect(currentSnapshot(h2)).toBe('a');
    expect(isDirty(h2)).toBe(false);
    expect(canRedo(h2)).toBe(true);

    const h3 = redoHistory(h2);
    expect(currentSnapshot(h3)).toBe('b');
  });

  it('truncates the redo branch on push', () => {
    const h = pushHistory(undoHistory(pushHistory(resetHistory('a'), 'b')), 'c');
    expect(h.entries).toEqual(['a', 'c']);
    expect(canRedo(h)).toBe(false);
  });

  it('ignores undo and redo at the ends', () => {
    const base = resetHistory('a');
    expect(undoHistory(base)).toBe(base);
    expect(redoHistory(base)).toBe(base);
  });

  it('does not mutate the previous state', () => {
    const base = resetHistory('a');
    pushHistory(base, 'b');
    expect(base.entries).toEqual(['a']);
  });
});
