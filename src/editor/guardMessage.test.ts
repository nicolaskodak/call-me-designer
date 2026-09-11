import { describe, expect, it } from 'vitest';
import { buildOverwriteMessage } from './guardMessage';

describe('buildOverwriteMessage', () => {
  it('names one page', () => {
    expect(buildOverwriteMessage(['Editor'])).toBe(
      '你已在 Editor 手動編輯過節點，這個變更會重新產生路徑並覆蓋編輯。',
    );
  });

  it('names several pages', () => {
    expect(buildOverwriteMessage(['Editor', 'Underprint'])).toBe(
      '你已在 Editor、Underprint 手動編輯過節點，這個變更會重新產生路徑並覆蓋編輯。',
    );
  });
});
