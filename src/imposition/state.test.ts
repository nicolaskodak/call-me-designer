import { describe, expect, it } from 'vitest';
import {
  addLayers,
  autoLayout,
  deleteInstance,
  enabledSizes,
  kindsWithContent,
  layerBoxMm,
  layerHasCut,
  layerHasUnderprint,
  LAYOUT_STALE_MESSAGE,
  moveInstance,
  NO_ENABLED_SIZE_MESSAGE,
  selectInstance,
  selectSheet,
  setAllowRotate,
  setLayerTotalCount,
  setMinGapMm,
  sheetsOutOfSync,
  sheetsWithContent,
  sheetUsage,
  toggleSheetSize,
  upsertSourceLayer,
} from './state';
import { DEFAULT_IMPOSITION_STATE, type ImpositionLayer, type ImpositionState } from './types';
import { DEFAULT_SHEET_SIZES } from './sheetSizes';

const idGen = () => {
  let n = 0;
  return () => `i${++n}`;
};

// dpi 25.4：1 px = 1 mm
const layer = (overrides: Partial<ImpositionLayer> = {}): ImpositionLayer => ({
  id: 'L1',
  sourceId: null,
  name: 'cat',
  imageBlob: new Blob(),
  imageUrl: 'blob:cat',
  widthPx: 100,
  heightPx: 50,
  dpi: 25.4,
  cut: { kind: 'paths', paths: [{ d: 'M0 0Z' }] },
  underprint: null,
  layoutBoxPx: { x: 0, y: 0, width: 100, height: 50 },
  totalCount: 1,
  ...overrides,
});

const withLayer = (l: ImpositionLayer = layer(), idFactory: () => string = idGen()): ImpositionState => addLayers(DEFAULT_IMPOSITION_STATE, [l], idFactory);

// px → mm 換算有浮點誤差，比對前先四捨五入到 6 位小數
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

describe('layerBoxMm', () => {
  it('converts the layout box to mm and swaps on rotation', () => {
    const box = (b: { w: number; h: number }) => ({ w: r6(b.w), h: r6(b.h) });
    expect(box(layerBoxMm(layer(), 0))).toEqual({ w: 100, h: 50 });
    expect(box(layerBoxMm(layer(), 90))).toEqual({ w: 50, h: 100 });
    expect(box(layerBoxMm(layer({ dpi: 254 }), 0))).toEqual({ w: 10, h: 5 });
  });
});

describe('addLayers', () => {
  it('creates one instance per total count at the origin', () => {
    const s = addLayers(DEFAULT_IMPOSITION_STATE, [layer({ totalCount: 2 })], idGen());
    expect(s.instances).toEqual([
      { id: 'i1', layerId: 'L1', sheetId: DEFAULT_IMPOSITION_STATE.activeSheetId, xMm: 0, yMm: 0, rotationDeg: 0 },
      { id: 'i2', layerId: 'L1', sheetId: DEFAULT_IMPOSITION_STATE.activeSheetId, xMm: 0, yMm: 0, rotationDeg: 0 },
    ]);
    expect(DEFAULT_IMPOSITION_STATE.instances).toEqual([]);
  });
});

describe('setLayerTotalCount', () => {
  it('grows, shrinks and deletes', () => {
    const next = idGen();
    const grown = setLayerTotalCount(withLayer(layer(), next), 'L1', 3, next);
    expect(grown.instances).toHaveLength(3);
    expect(grown.layers[0].totalCount).toBe(3);

    const shrunk = setLayerTotalCount(grown, 'L1', 1, next);
    expect(shrunk.instances.map(i => i.id)).toEqual([grown.instances[0].id]);

    const selected = selectInstance(shrunk, shrunk.instances[0].id);
    const removed = setLayerTotalCount(selected, 'L1', 0, next);
    expect(removed.layers).toEqual([]);
    expect(removed.instances).toEqual([]);
    expect(removed.selectedInstanceId).toBeNull();
  });

  it('treats invalid numbers as zero', () => {
    expect(setLayerTotalCount(withLayer(), 'L1', Number.NaN, idGen()).layers).toEqual([]);
  });
});

describe('deleteInstance', () => {
  it('decrements the total and removes the layer with its last instance', () => {
    const next = idGen();
    const s = setLayerTotalCount(withLayer(layer(), next), 'L1', 2, next);
    const once = deleteInstance(s, s.instances[0].id);
    expect(once.layers[0].totalCount).toBe(1);
    expect(once.instances).toHaveLength(1);
    const twice = deleteInstance(once, once.instances[0].id);
    expect(twice.layers).toEqual([]);
  });

  it('ignores unknown ids', () => {
    const s = withLayer();
    expect(deleteInstance(s, 'nope').instances).toEqual(s.instances);
  });
});

describe('upsertSourceLayer', () => {
  it('adds a new source layer with one instance', () => {
    const s = upsertSourceLayer(DEFAULT_IMPOSITION_STATE, layer({ sourceId: 'src', totalCount: 5 }), idGen());
    expect(s.layers[0].totalCount).toBe(1);
    expect(s.instances).toHaveLength(1);
  });

  it('replaces the same source in place, keeping id, total and positions', () => {
    const next = idGen();
    const first = setLayerTotalCount(upsertSourceLayer(DEFAULT_IMPOSITION_STATE, layer({ sourceId: 'src' }), next), 'L1', 3, next);
    const moved = moveInstance(first, first.instances[0].id, 10, 20);

    const replaced = upsertSourceLayer(moved, layer({ id: 'L2', sourceId: 'src', widthPx: 999 }), next);
    expect(replaced.layers).toHaveLength(1);
    expect(replaced.layers[0]).toMatchObject({ id: 'L1', totalCount: 3, widthPx: 999 });
    expect(replaced.instances[0]).toMatchObject({ xMm: 10, yMm: 20 });
  });
});

const SIZES = DEFAULT_SHEET_SIZES;

describe('autoLayout', () => {
  it('把項目排進版面並記錄相對座標', () => {
    const next = idGen();
    const s = setLayerTotalCount(withLayer(layer(), next), 'L1', 2, next);
    const laid = autoLayout(s, SIZES, next);
    expect(laid.sheets).toHaveLength(1);
    expect(laid.instances.every(i => i.sheetId === laid.sheets[0].id)).toBe(true);
    expect(laid.instances.map(i => [r6(i.xMm), r6(i.yMm)])).toEqual([[0, 0], [103, 0]]);
    expect(laid.lastLayoutMessage).toContain('排圖完成');
  });

  it('排不下時自動開新版面', () => {
    const next = idGen();
    // 每個 260x190mm，A4 一張只放得下一個
    const big = layer({ layoutBoxPx: { x: 0, y: 0, width: 260, height: 190 } });
    const s = setLayerTotalCount(withLayer(big, next), 'L1', 3, next);
    const laid = autoLayout(s, [{ name: 'A4', widthMm: 297, heightMm: 210 }], next);
    expect(laid.sheets).toHaveLength(3);
    expect(new Set(laid.instances.map(i => i.sheetId)).size).toBe(3);
  });

  it('比所有尺寸都大的項目標記為放不下且不屬於任何版面', () => {
    const next = idGen();
    const huge = layer({ layoutBoxPx: { x: 0, y: 0, width: 2000, height: 2000 } });
    const laid = autoLayout(withLayer(huge, next), SIZES, next);
    expect(laid.lastLayoutMessage).toContain('放不下 1 個');
    expect(laid.instances[0].sheetId).toBeNull();
  });

  it('沒有勾選任何尺寸時不排圖，只提示', () => {
    const s = withLayer();
    const laid = autoLayout(s, [], idGen());
    expect(laid.instances).toEqual(s.instances);
    expect(laid.lastLayoutMessage).toBe(NO_ENABLED_SIZE_MESSAGE);
  });

  it('不允許旋轉時清掉既有的旋轉', () => {
    const s = withLayer();
    const rotated = { ...s, instances: s.instances.map(i => ({ ...i, rotationDeg: 90 as const })) };
    expect(autoLayout(rotated, SIZES, idGen()).instances[0].rotationDeg).toBe(0);
  });

  it('排圖後把第一張設為當前版面', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    expect(laid.activeSheetId).toBe(laid.sheets[0].id);
  });

  it('重排後一個都放不下時，保留一張舊版面，不留下一堆空版面', () => {
    const next = idGen();
    const big = layer({ layoutBoxPx: { x: 0, y: 0, width: 260, height: 190 } });
    const s = setLayerTotalCount(withLayer(big, next), 'L1', 3, next);
    const laid = autoLayout(s, [{ name: 'A4', widthMm: 297, heightMm: 210 }], next);
    expect(laid.sheets.length).toBeGreaterThan(1);

    // 間距調到誇張大，讓所有項目都放不下任何版面
    const relaid = autoLayout({ ...laid, minGapMm: 1000 }, [{ name: 'A4', widthMm: 297, heightMm: 210 }], next);
    expect(relaid.sheets).toHaveLength(1);
    expect(relaid.sheets[0]).toBe(laid.sheets[0]);
    expect(relaid.instances.every(i => i.sheetId === null)).toBe(true);
    expect(relaid.activeSheetId).toBe(relaid.sheets[0].id);
  });

  it('切到非第一張版面後才重排到全部放不下，activeSheetId 仍必須指向現存的版面', () => {
    const next = idGen();
    const big = layer({ layoutBoxPx: { x: 0, y: 0, width: 260, height: 190 } });
    const s = setLayerTotalCount(withLayer(big, next), 'L1', 3, next);
    const laid = autoLayout(s, [{ name: 'A4', widthMm: 297, heightMm: 210 }], next);
    expect(laid.sheets.length).toBeGreaterThan(1);

    // 切到第二張版面，模擬使用者排圖完先瀏覽了其他分頁
    const switched = selectSheet(laid, laid.sheets[1].id);
    expect(switched.activeSheetId).toBe(laid.sheets[1].id);

    // 間距調到誇張大，讓所有項目都放不下任何版面；只有第一張版面會被保留
    const relaid = autoLayout({ ...switched, minGapMm: 1000 }, [{ name: 'A4', widthMm: 297, heightMm: 210 }], next);
    expect(relaid.sheets).toHaveLength(1);
    expect(relaid.activeSheetId).toBe(relaid.sheets[0].id);
    expect(relaid.sheets.some(sheet => sheet.id === relaid.activeSheetId)).toBe(true);
  });
});

describe('selectSheet', () => {
  it('切換當前版面並取消選取', () => {
    const next = idGen();
    const big = layer({ layoutBoxPx: { x: 0, y: 0, width: 260, height: 190 } });
    const s = setLayerTotalCount(withLayer(big, next), 'L1', 2, next);
    const laid = autoLayout(s, [{ name: 'A4', widthMm: 297, heightMm: 210 }], next);
    const selected = selectInstance(laid, laid.instances[0].id);
    const switched = selectSheet(selected, laid.sheets[1].id);
    expect(switched.activeSheetId).toBe(laid.sheets[1].id);
    expect(switched.selectedInstanceId).toBeNull();
  });

  it('未知的版面 id 不造成任何改變', () => {
    const s = withLayer();
    expect(selectSheet(s, 'nope')).toBe(s);
  });
});

describe('sheetUsage', () => {
  it('回傳 0 到 1 之間的使用率', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    const usage = sheetUsage(laid, laid.sheets[0].id);
    expect(usage).toBeGreaterThan(0);
    expect(usage).toBeLessThanOrEqual(1);
  });

  it('未知的版面 id 回傳 0', () => {
    expect(sheetUsage(withLayer(), 'nope')).toBe(0);
  });
});

describe('sheetsWithContent', () => {
  it('版面上有 instance 引用著存在的圖層時，算有內容', () => {
    const s = withLayer();
    expect(sheetsWithContent(s).map(sheet => sheet.id)).toEqual([s.activeSheetId]);
  });

  it('instance 引用的圖層已經不存在時，該版面不算有內容', () => {
    const s = withLayer();
    // 模擬 reducer 的不變式被打破：instance 還掛在版面上，但引用的圖層已經被移除
    // （目前的 reducer 保證不會發生，這裡直接構造 state 繞過該保證，逼出
    // layerIds.has(...) 這個收緊條件本身有沒有真的在檢查）
    const layerDeleted: ImpositionState = { ...s, layers: [] };
    expect(sheetsWithContent(layerDeleted)).toEqual([]);
  });
});

describe('kindsWithContent', () => {
  it('沒有任何白墨時不含 underprint', () => {
    const s = withLayer(layer({ underprint: null }));
    expect(kindsWithContent(s)).toEqual(['artwork', 'cut']);
  });

  it('刀模 paths 為空陣列時不含 cut', () => {
    const s = withLayer(layer({ cut: { kind: 'paths', paths: [] }, underprint: [{ d: 'M0 0Z' }] }));
    expect(kindsWithContent(s)).toEqual(['artwork', 'underprint']);
  });

  it('白墨與刀模都有內容時三層都在，且順序固定為 artwork/underprint/cut', () => {
    const s = withLayer(layer({ underprint: [{ d: 'M0 0Z' }] }));
    expect(kindsWithContent(s)).toEqual(['artwork', 'underprint', 'cut']);
  });

  it('刀模是上傳 SVG（kind: "svg"）時也算有內容', () => {
    const s = withLayer(layer({ cut: { kind: 'svg', svg: { viewBox: '0 0 10 10', inner: '' } } }));
    expect(kindsWithContent(s)).toEqual(['artwork', 'cut']);
  });

  it('圖層未排入任何版面時不計入，三層都不算有內容', () => {
    const s = withLayer(layer({ underprint: [{ d: 'M0 0Z' }] }));
    const notPlaced: ImpositionState = { ...s, instances: s.instances.map(i => ({ ...i, sheetId: null })) };
    expect(kindsWithContent(notPlaced)).toEqual([]);
  });

  it('沒有任何圖層時回傳空陣列', () => {
    expect(kindsWithContent(DEFAULT_IMPOSITION_STATE)).toEqual([]);
  });
});

describe('刪除項目後回收空版面', () => {
  it('版面上最後一個項目被刪除時，該版面一併移除', () => {
    const next = idGen();
    const big = layer({ layoutBoxPx: { x: 0, y: 0, width: 260, height: 190 } });
    const s = setLayerTotalCount(withLayer(big, next), 'L1', 2, next);
    const laid = autoLayout(s, [{ name: 'A4', widthMm: 297, heightMm: 210 }], next);
    expect(laid.sheets).toHaveLength(2);

    const afterDelete = deleteInstance(laid, laid.instances[0].id);
    expect(afterDelete.sheets).toHaveLength(1);
    expect(afterDelete.sheets.some(sheet => sheet.id === afterDelete.activeSheetId)).toBe(true);
  });

  it('刪光所有項目時保留一張版面，畫布不會空白', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    const empty = setLayerTotalCount(laid, 'L1', 0, next);
    expect(empty.sheets).toHaveLength(1);
    expect(empty.activeSheetId).toBe(empty.sheets[0].id);
  });
});

describe('setAllowRotate', () => {
  it('clears rotations and layout results when disabled', () => {
    const s = withLayer();
    const rotated = { ...s, allowRotate90: true, instances: s.instances.map(i => ({ ...i, rotationDeg: 90 as const })) };
    const next = setAllowRotate(rotated, false);
    expect(next.instances[0].rotationDeg).toBe(0);
    expect(setAllowRotate(rotated, true).instances[0].rotationDeg).toBe(90);
  });

  // 狀態層不變式：setAllowRotate 只碰 rotationDeg 與 lastLayoutMessage，不會、也不該改動
  // sheetId——sheetId 才是「這個項目屬於哪個版面」的唯一事實來源。
  it('切換旋轉不會改動任何項目的 sheetId', () => {
    const next = idGen();
    const huge = layer({ layoutBoxPx: { x: 0, y: 0, width: 2000, height: 2000 } });
    const laid = autoLayout(withLayer(huge, next), SIZES, next);
    expect(laid.instances[0].sheetId).toBeNull();

    const toggled = setAllowRotate(laid, true);
    expect(toggled.instances[0].sheetId).toBeNull();
  });
});

describe('需要重新排圖的提示', () => {
  it('切換旋轉之後提示要重新排圖，位置維持不動', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer({ totalCount: 2 }), next), SIZES, next);
    const toggled = setAllowRotate(laid, true);
    expect(toggled.lastLayoutMessage).toBe(LAYOUT_STALE_MESSAGE);
    expect(toggled.instances).toEqual(laid.instances);
  });

  it('加入圖層之後提示要重新排圖', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    const added = addLayers(laid, [layer({ id: 'L2' })], next);
    expect(added.lastLayoutMessage).toBe(LAYOUT_STALE_MESSAGE);
  });

  it('改變份數之後提示要重新排圖', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    expect(setLayerTotalCount(laid, 'L1', 3, next).lastLayoutMessage).toBe(LAYOUT_STALE_MESSAGE);
  });

  it('重新排圖之後換回完成訊息', () => {
    const next = idGen();
    const stale = setAllowRotate(autoLayout(withLayer(layer(), next), SIZES, next), true);
    expect(autoLayout(stale, SIZES, next).lastLayoutMessage).toContain('排圖完成');
  });
});

describe('尺寸勾選', () => {
  const ALL = [
    { name: 'A4', widthMm: 297, heightMm: 210 },
    { name: 'A3', widthMm: 420, heightMm: 297 },
  ];

  it('預設全部啟用', () => {
    expect(enabledSizes(DEFAULT_IMPOSITION_STATE, ALL)).toEqual(ALL);
  });

  it('切換會停用再啟用', () => {
    const off = toggleSheetSize(DEFAULT_IMPOSITION_STATE, 'A3');
    expect(enabledSizes(off, ALL).map(s => s.name)).toEqual(['A4']);
    expect(enabledSizes(toggleSheetSize(off, 'A3'), ALL)).toEqual(ALL);
  });

  it('切換會提示需要重新排圖', () => {
    expect(toggleSheetSize(DEFAULT_IMPOSITION_STATE, 'A3').lastLayoutMessage).toBe(LAYOUT_STALE_MESSAGE);
  });

  it('停用清單裡不存在的名稱不影響結果', () => {
    const state = { ...DEFAULT_IMPOSITION_STATE, disabledSizeNames: ['已刪除的尺寸'] };
    expect(enabledSizes(state, ALL)).toEqual(ALL);
  });
});

describe('layoutStale：匯出把關的依據', () => {
  it('預設允許 90° 旋轉', () => {
    // 現行清單裡最小的幾張版面全是直式，關掉旋轉時一張 400×100 的圖會從 310×420
    // 跳到 565×405。這個預設是刻意選的，改動它要連帶重新評估浪費多少板材。
    expect(DEFAULT_IMPOSITION_STATE.allowRotate90).toBe(true);
  });

  it('初始狀態沒有項目，不算過期', () => {
    expect(DEFAULT_IMPOSITION_STATE.layoutStale).toBe(false);
  });

  it('剛上傳的圖層算過期——此時的擺位還在初始那張與清單無關的版面上', () => {
    expect(withLayer().layoutStale).toBe(true);
  });

  it('排圖後不再過期', () => {
    const next = idGen();
    expect(autoLayout(withLayer(layer(), next), SIZES, next).layoutStale).toBe(false);
  });

  it('排圖後手動拖曳不會讓排版過期，微調完仍匯得出去', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    expect(moveInstance(laid, laid.instances[0].id, 12, 34).layoutStale).toBe(false);
  });

  it('改份數、切換尺寸勾選、切換旋轉都會讓排版過期', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    expect(setLayerTotalCount(laid, 'L1', 3, next).layoutStale).toBe(true);
    expect(toggleSheetSize(laid, SIZES[0].name).layoutStale).toBe(true);
    expect(setAllowRotate(laid, !laid.allowRotate90).layoutStale).toBe(true);
  });

  it('沒有任何啟用尺寸時排圖不算數，過期狀態要維持', () => {
    const next = idGen();
    expect(autoLayout(withLayer(layer(), next), [], next).layoutStale).toBe(true);
  });

  it('改最小間距也算過期——它跟旋轉、尺寸勾選一樣是排圖的輸入', () => {
    const next = idGen();
    const laid = autoLayout(withLayer(layer(), next), SIZES, next);
    const widened = setMinGapMm(laid, 8);
    expect(widened.minGapMm).toBe(8);
    expect(widened.layoutStale).toBe(true);
  });
});

describe('layerHasCut／layerHasUnderprint：匯出與畫面共用的判準', () => {
  it('空的 paths 陣列不算有刀模——圖層列不該因此顯示「刀模」', () => {
    expect(layerHasCut(layer({ cut: { kind: 'paths', paths: [] } }))).toBe(false);
    expect(layerHasCut(layer({ cut: { kind: 'paths', paths: [{ d: 'M0 0Z' }] } }))).toBe(true);
  });

  it('空的白墨陣列不算有白墨——舊的 layers.some(l => l.underprint) 會誤判成有', () => {
    expect(layerHasUnderprint(layer({ underprint: [] }))).toBe(false);
    expect(layerHasUnderprint(layer({ underprint: null }))).toBe(false);
    expect(layerHasUnderprint(layer({ underprint: [{ d: 'M0 0Z' }] }))).toBe(true);
  });
});

describe('sheetsOutOfSync：設定頁改過尺寸的偵測', () => {
  const laidOut = () => {
    const next = idGen();
    return autoLayout(withLayer(layer(), next), SIZES, next);
  };

  it('尺寸沒變時是空的', () => {
    expect(sheetsOutOfSync(laidOut(), SIZES)).toEqual([]);
  });

  it('長寬被改過就抓得到', () => {
    const laid = laidOut();
    const edited = SIZES.map(z => (z.name === laid.sheets[0].sizeName ? { ...z, widthMm: z.widthMm + 10 } : z));
    expect(sheetsOutOfSync(laid, edited).map(s => s.sizeName)).toEqual([laid.sheets[0].sizeName]);
  });

  it('尺寸整個被刪掉就抓得到', () => {
    const laid = laidOut();
    const removed = SIZES.filter(z => z.name !== laid.sheets[0].sizeName);
    expect(sheetsOutOfSync(laid, removed).map(s => s.sizeName)).toEqual([laid.sheets[0].sizeName]);
  });

  it('還沒有內容的版面不算——初始那張寫死的版面不該一直跳警告', () => {
    expect(sheetsOutOfSync(DEFAULT_IMPOSITION_STATE, [])).toEqual([]);
  });
});

describe('moveInstance 的邊界夾限', () => {
  const onOneSheet = () => {
    const next = idGen();
    return autoLayout(withLayer(layer(), next), [{ name: 'S', widthMm: 300, heightMm: 400 }], next);
  };

  it('版面內的移動不受影響', () => {
    const laid = onOneSheet();
    const moved = moveInstance(laid, laid.instances[0].id, 12, 34).instances[0];
    expect([moved.xMm, moved.yMm]).toEqual([12, 34]);
  });

  it('往負的拖會被夾在 0', () => {
    const laid = onOneSheet();
    const moved = moveInstance(laid, laid.instances[0].id, -900, -900).instances[0];
    expect([moved.xMm, moved.yMm]).toEqual([0, 0]);
  });

  it('往外拖會被夾在「版面尺寸減項目尺寸」', () => {
    const laid = onOneSheet();
    const box = layerBoxMm(laid.layers[0], laid.instances[0].rotationDeg);
    const moved = moveInstance(laid, laid.instances[0].id, 9999, 9999).instances[0];
    expect([moved.xMm, moved.yMm]).toEqual([300 - box.w, 400 - box.h]);
  });

  it('項目比版面大時夾到 0，上界不會變成負數', () => {
    const next = idGen();
    const s = withLayer(layer({ layoutBoxPx: { x: 0, y: 0, width: 500, height: 500 } }), next);
    const forced: ImpositionState = {
      ...s,
      sheets: [{ id: 'sheet-1', sizeName: 'S', widthMm: 100, heightMm: 100 }],
      instances: s.instances.map(i => ({ ...i, sheetId: 'sheet-1' })),
    };
    const moved = moveInstance(forced, forced.instances[0].id, 50, 50).instances[0];
    expect([moved.xMm, moved.yMm]).toEqual([0, 0]);
  });
});
