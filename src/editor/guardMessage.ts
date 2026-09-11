export const buildOverwriteMessage = (affected: readonly string[]): string =>
  `你已在 ${affected.join('、')} 手動編輯過節點，這個變更會重新產生路徑並覆蓋編輯。`;
