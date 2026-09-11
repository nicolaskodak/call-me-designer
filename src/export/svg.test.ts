import { describe, expect, it } from 'vitest';
import {
  buildAlignedSvg,
  buildTrimmedCutSvg,
  escapeAttr,
  formatNumber,
  pathElement,
  svgDocument,
} from './svg';

describe('formatNumber', () => {
  it('keeps at most 4 decimals and drops trailing zeros', () => {
    expect(formatNumber(1.23456789)).toBe('1.2346');
    expect(formatNumber(2)).toBe('2');
    expect(formatNumber(2.5)).toBe('2.5');
    expect(formatNumber(-0.00001)).toBe('0');
  });
});

describe('escapeAttr', () => {
  it('escapes XML special characters', () => {
    expect(escapeAttr('a&b<c>"d')).toBe('a&amp;b&lt;c&gt;&quot;d');
  });
});

describe('pathElement', () => {
  it('adds fill-rule only when present', () => {
    expect(pathElement({ d: 'M0 0Z' })).toBe('<path d="M0 0Z"/>');
    expect(pathElement({ d: 'M0 0Z', fillRule: 'evenodd' })).toBe('<path d="M0 0Z" fill-rule="evenodd"/>');
  });
});

describe('svgDocument', () => {
  it('writes mm size and viewBox', () => {
    const svg = svgDocument({ widthMm: 10, heightMm: 5, viewBox: { x: 0, y: 0, width: 100, height: 50 }, body: '<g/>' });
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="5mm" viewBox="0 0 100 50">');
    expect(svg).toContain('<g/>');
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});

describe('buildAlignedSvg', () => {
  it('builds a cut layer sized to the image in mm', () => {
    const svg = buildAlignedSvg({ kind: 'cut', paths: [{ d: 'M1 1L2 2Z' }], widthPx: 300, heightPx: 150, dpi: 300, color: '#FF0000' });
    expect(svg).toContain('width="25.4mm" height="12.7mm" viewBox="0 0 300 150"');
    expect(svg).toContain('<g id="cut" fill="none" stroke="#FF0000" stroke-width="2.9528" stroke-linejoin="round">');
    expect(svg).toContain('<path d="M1 1L2 2Z"/>');
  });

  it('builds an underprint layer', () => {
    const svg = buildAlignedSvg({ kind: 'underprint', paths: [{ d: 'M0 0Z', fillRule: 'evenodd' }], widthPx: 10, heightPx: 10, dpi: 25.4, color: '#FFFFFF' });
    expect(svg).toContain('<g id="underprint" fill="#FFFFFF" stroke="none"><path d="M0 0Z" fill-rule="evenodd"/></g>');
  });
});

describe('buildTrimmedCutSvg', () => {
  it('pads the bounds by half the stroke width', () => {
    const svg = buildTrimmedCutSvg({ paths: [{ d: 'M0 0Z' }], bounds: { x: 10, y: 20, width: 100, height: 50 }, dpi: 25.4, color: '#FF0000' });
    expect(svg).toContain('width="100.25mm" height="50.25mm" viewBox="9.875 19.875 100.25 50.25"');
  });
});
