import { describe, expect, it } from 'vitest';
import { buildOverwriteMessage } from './guardMessage';

describe('buildOverwriteMessage', () => {
  it('names one page', () => {
    expect(buildOverwriteMessage(['Die-cut'])).toBe(
      '你已在 Die-cut 手動編輯過節點，這個變更會重新產生路徑並覆蓋編輯。',
    );
  });

  it('names several pages', () => {
    expect(buildOverwriteMessage(['Die-cut', 'Underprint'])).toBe(
      '你已在 Die-cut、Underprint 手動編輯過節點，這個變更會重新產生路徑並覆蓋編輯。',
    );
  });
});
