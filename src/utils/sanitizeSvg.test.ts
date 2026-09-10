// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { nestedSvgMarkup, parseUploadedSvg, sanitizeSvg } from './sanitizeSvg';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe('sanitizeSvg', () => {
  it('removes scripts, event handlers and javascript links but keeps paths', () => {
    const dirty = `<svg ${NS} onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><path d="M0 0L1 1"/></a></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onload/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain('<path');
  });
});

describe('parseUploadedSvg', () => {
  it('keeps the viewBox and inner markup', () => {
    const parsed = parseUploadedSvg(`<svg ${NS} viewBox="0 0 10 20" width="10mm"><path d="M0 0L5 5"/></svg>`, 1, 1);
    expect(parsed.viewBox).toBe('0 0 10 20');
    expect(parsed.inner).toContain('<path');
    expect(parsed.inner).toContain('M0 0L5 5');
  });

  it('derives the viewBox from width and height', () => {
    expect(parseUploadedSvg(`<svg ${NS} width="30" height="40"><g/></svg>`, 1, 1).viewBox).toBe('0 0 30 40');
  });

  it('falls back to the image size', () => {
    expect(parseUploadedSvg(`<svg ${NS}><g/></svg>`, 300, 200).viewBox).toBe('0 0 300 200');
  });

  it('throws for non-SVG input', () => {
    expect(() => parseUploadedSvg('not an svg', 1, 1)).toThrow('不是有效的 SVG');
  });
});

describe('nestedSvgMarkup', () => {
  it('wraps the inner markup in a sized nested svg', () => {
    expect(nestedSvgMarkup({ viewBox: '0 0 10 20', inner: '<g/>' }, 100, 200)).toBe(
      '<svg x="0" y="0" width="100" height="200" viewBox="0 0 10 20" preserveAspectRatio="none" overflow="visible"><g/></svg>',
    );
  });
});
