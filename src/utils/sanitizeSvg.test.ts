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

describe('sanitizeSvg external resources', () => {
  const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';

  it('drops @import and external url() in <style> but keeps local references', () => {
    const clean = sanitizeSvg(
      `<svg ${NS}><style>@import url(https://evil.test/a.css); .a{fill:url(https://evil.test/k)} .b{fill:url(#g)}</style><path class="a" d="M0 0"/></svg>`,
    );
    expect(clean).not.toContain('evil.test');
    expect(clean).not.toMatch(/@import/i);
    expect(clean).toContain('url(#g)');
    expect(clean).toContain('<path');
  });

  it('drops external url() in style attributes but keeps other declarations', () => {
    const clean = sanitizeSvg(`<svg ${NS}><path style="fill:url(https://evil.test/x);stroke:red" d="M0 0"/></svg>`);
    expect(clean).not.toContain('evil.test');
    expect(clean).toMatch(/stroke:\s?red/);
  });

  it('drops presentation attributes with external url() but keeps local ones', () => {
    expect(sanitizeSvg(`<svg ${NS}><path fill="url(https://evil.test/p)" d="M0 0"/></svg>`)).not.toContain('evil.test');
    expect(sanitizeSvg(`<svg ${NS}><path fill="url(#g)" d="M0 0"/></svg>`)).toContain('url(#g)');
  });

  it('keeps only local and raster data: hrefs', () => {
    expect(sanitizeSvg(`<svg ${NS}><image href="https://evil.test/x.png"/></svg>`)).not.toContain('evil.test');
    expect(sanitizeSvg(`<svg ${NS} ${XLINK}><image xlink:href="https://evil.test/x.png"/></svg>`)).not.toContain('evil.test');
    expect(sanitizeSvg(`<svg ${NS}><image href="data:image/png;base64,AAA"/></svg>`)).toContain('data:image/png;base64,AAA');
    // DOMPurify 的 svg profile 本來就會移除 <use>，改用 Illustrator 常見的漸層 href 驗證本地參照
    expect(sanitizeSvg(`<svg ${NS}><linearGradient id="g" href="#a"/></svg>`)).toContain('href="#a"');
    expect(sanitizeSvg(`<svg ${NS} ${XLINK}><linearGradient id="g" xlink:href="#a"/></svg>`)).toContain('xlink:href="#a"');
  });

  it('is not fooled by CSS escapes or image-set()', () => {
    const clean = sanitizeSvg(
      `<svg ${NS}><style>@\\69mport "https://evil.test/a.css"; .a{fill:\\75rl(https://evil.test/k)} input{background:image-set("https://evil.test/i" 1x)}</style></svg>`,
    );
    expect(clean).not.toMatch(/evil\.test\/(a|k)/);
    expect(clean).not.toMatch(/image-set/i);
    expect(sanitizeSvg(`<svg ${NS}><path fill="\\75rl(https://evil.test/p)" d="M0 0"/></svg>`)).not.toContain('evil.test');
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
