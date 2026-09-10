/** 去背服務的共同介面；之後新增超解析時另外定義 Upscaler，不改動這裡 */
export interface BackgroundRemover {
  removeBackground(input: Blob, options?: { signal?: AbortSignal }): Promise<Blob>;
}
