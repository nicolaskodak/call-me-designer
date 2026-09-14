/**
 * 把 Blob 的內容複製成一份純記憶體的 Blob。
 *
 * 從 `<input type="file">` 或拖放拿到的 `File` 只是磁碟檔案的參照：檔案一旦被
 * 改寫、移動或所在目錄被清掉，之後再讀就會拋 `NotFoundError`。實際遇過的症狀是
 * 匯出「分層 SVG」失敗——只有它會把原圖嵌進去，也就是唯一會讀這個 blob 的路徑。
 *
 * 在上傳當下複製一份（那時檔案必定讀得到），後續就不再受磁碟狀態影響。
 */
export async function detachBlob(blob: Blob): Promise<Blob> {
  return new Blob([await blob.arrayBuffer()], { type: blob.type });
}
