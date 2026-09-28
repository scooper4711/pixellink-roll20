/**
 * @jest-environment jsdom
 */

const htmlGenerator = require('../../../../src/components/modifierBox/htmlGenerator.js');

describe('HTML Generator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  describe('generateModifierBoxHTML', () => {
    test('uses default logo URL when none provided', () => {
      const html = htmlGenerator.generateModifierBoxHTML();
      expect(html).toContain('assets/images/logo-128.png');
      expect(html).toContain('pixels-header');
      expect(html).toContain('pixels-content');
      expect(html).toContain('modifier-row');
      expect(html).toContain('Attack');
      expect(html).toContain('1d20');
      expect(html).toContain('add-modifier-btn');
      expect(html).toContain('clear-all-btn');
      expect(html).toContain('pixels-minimize');
      expect(html).toContain('pixels-resize-handle');
    });

    test('embeds custom logo URL', () => {
      const html = htmlGenerator.generateModifierBoxHTML('chrome-extension://x/logo.png');
      expect(html).toContain('chrome-extension://x/logo.png');
    });
  });

  describe('getLogoUrl', () => {
    test('returns chrome runtime URL when available', () => {
      global.chrome = { runtime: { getURL: jest.fn(p => `chrome-extension://mock/${p}`) } };
      expect(htmlGenerator.getLogoUrl()).toBe('chrome-extension://mock/assets/images/logo-128.png');
    });

    test('falls back when chrome is undefined', () => {
      const saved = global.chrome;
      // @ts-ignore - simulate non-extension context
      delete global.chrome;
      // also remove globalThis chrome if present
      const hadWindowChrome = typeof window !== 'undefined' && 'chrome' in window;
      let savedWindowChrome;
      if (hadWindowChrome) {
        savedWindowChrome = window.chrome;
        // @ts-ignore
        delete window.chrome;
      }
      expect(htmlGenerator.getLogoUrl()).toBe('assets/images/logo-128.png');
      global.chrome = saved;
      if (hadWindowChrome) window.chrome = savedWindowChrome;
    });

    test('falls back when getURL throws', () => {
      global.chrome = {
        runtime: {
          getURL: jest.fn(() => {
            throw new Error('nope');
          }),
        },
      };
      expect(htmlGenerator.getLogoUrl()).toBe('assets/images/logo-128.png');
    });

    test('falls back when chrome.runtime.getURL is missing', () => {
      global.chrome = { runtime: {} };
      expect(htmlGenerator.getLogoUrl()).toBe('assets/images/logo-128.png');
    });
  });

  describe('createModifierBoxElement', () => {
    test('creates element with id, testid, class and inner content', () => {
      const el = htmlGenerator.createModifierBoxElement();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.id).toBe('pixels-modifier-box');
      expect(el.dataset.testid).toBe('pixels-modifier-box');
      expect(el.className).toBe('PIXELS_EXTENSION_BOX_FIND_ME');
      expect(el.querySelector('.pixels-header')).toBeTruthy();
      expect(el.querySelector('.modifier-name').value).toBe('Attack');
      expect(el.querySelector('.formula-input').value).toBe('1d20');
    });
  });

  describe('processTemplateHTML', () => {
    test('replaces placeholder with explicit logo URL', () => {
      const out = htmlGenerator.processTemplateHTML('<img src="{{logoUrl}}">', 'http://x/logo.png');
      expect(out).toBe('<img src="http://x/logo.png">');
    });

    test('resolves logo URL when null passed', () => {
      const out = htmlGenerator.processTemplateHTML('<img src="{{logoUrl}}">', null);
      expect(out).not.toContain('{{logoUrl}}');
    });

    test('resolves logo URL when arg omitted', () => {
      const out = htmlGenerator.processTemplateHTML('<img src="{{logoUrl}}">');
      expect(out).not.toContain('{{logoUrl}}');
    });
  });

  describe('extractModifierBoxFromTemplate', () => {
    test('returns first element child', () => {
      const el = htmlGenerator.extractModifierBoxFromTemplate('<div id="pixels-modifier-box"><span>hi</span></div>');
      expect(el).toBeTruthy();
      expect(el.id).toBe('pixels-modifier-box');
    });

    test('returns null for empty template', () => {
      expect(htmlGenerator.extractModifierBoxFromTemplate('')).toBeNull();
    });
  });

  describe('module shape', () => {
    test('default export exposes all functions', () => {
      expect(htmlGenerator.default.generateModifierBoxHTML).toBeInstanceOf(Function);
      expect(htmlGenerator.default.getLogoUrl).toBeInstanceOf(Function);
      expect(htmlGenerator.default.createModifierBoxElement).toBeInstanceOf(Function);
      expect(htmlGenerator.default.processTemplateHTML).toBeInstanceOf(Function);
      expect(htmlGenerator.default.extractModifierBoxFromTemplate).toBeInstanceOf(Function);
    });

    test('sets window.ModifierBoxHTMLGenerator global', () => {
      expect(window.ModifierBoxHTMLGenerator).toBeDefined();
    });
  });
});
