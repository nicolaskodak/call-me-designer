import { describe, expect, it } from 'vitest';
import { newId } from './id';

describe('newId', () => {
  it('returns distinct non-empty strings', () => {
    const ids = new Set(Array.from({ length: 100 }, newId));
    expect(ids.size).toBe(100);
    expect([...ids].every(id => id.length > 0)).toBe(true);
  });
});
