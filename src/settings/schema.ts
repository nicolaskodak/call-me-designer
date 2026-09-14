import { z } from 'zod';
import { DEFAULT_DPI, DPI_MAX, DPI_MIN } from '../units';
import { DEFAULT_SHEET_SIZES } from '../imposition/sheetSizes';

export const REMOVE_BG_SIZES = ['auto', 'preview', 'full'] as const;
export type RemoveBgSize = (typeof REMOVE_BG_SIZES)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const API_KEY_MAX_LENGTH = 200;

export const SHEET_NAME_MAX_LENGTH = 20;
export const SHEET_SIDE_MAX_MM = 2000;

const sheetSizeSchema = z.object({
  name: z.string().min(1).max(SHEET_NAME_MAX_LENGTH),
  widthMm: z.number().positive().max(SHEET_SIDE_MAX_MM),
  heightMm: z.number().positive().max(SHEET_SIDE_MAX_MM),
});

export const settingsSchema = z.object({
  version: z.literal(1),
  defaultDpi: z.number().int().min(DPI_MIN).max(DPI_MAX),
  exportColors: z.object({ cut: hexColor, underprint: hexColor }),
  removeBg: z.object({
    apiKey: z.string().max(API_KEY_MAX_LENGTH),
    size: z.enum(REMOVE_BG_SIZES),
  }),
  /** 用 .default() 而不是升版號，舊設定才不會被整包重設 */
  sheetSizes: z.array(sheetSizeSchema).default([...DEFAULT_SHEET_SIZES]),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  defaultDpi: DEFAULT_DPI,
  exportColors: { cut: '#FF0000', underprint: '#FFFFFF' },
  removeBg: { apiKey: '', size: 'auto' },
  sheetSizes: [...DEFAULT_SHEET_SIZES],
};

export function parseSettings(raw: unknown): Settings | null {
  const result = settingsSchema.safeParse(raw);
  return result.success ? result.data : null;
}
