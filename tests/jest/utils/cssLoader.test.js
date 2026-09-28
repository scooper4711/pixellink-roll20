/**
 * @jest-environment jsdom
 */

const cssLoader = require('../../../src/utils/cssLoader.js');
const { loadCSS, loadMultipleCSS, removeCSS, isLoaded } = cssLoader;

const originalFetch = global.fetch;
const originalRuntime = global.chrome && global.chrome.runtime;

function mockFetchOk(cssText) {
  global.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(cssText),
  });
}

beforeEach(() => {
  resetMocks();
  global.fetch = jest.fn();
  if (originalRuntime) {
    global.chrome.runtime = originalRuntime;
  }
});

afterEach(() => {
  if (originalFetch === undefined) {
    delete global.fetch;
  } else {
    global.fetch = originalFetch;
  }
  if (originalRuntime) {
    global.chrome.runtime = originalRuntime;
  }
  jest.restoreAllMocks();
});

describe('loadCSS', () => {
  test('fetches CSS via chrome.runtime.getURL and injects a style element', async () => {
    mockFetchOk('.a{color:red}');

    await loadCSS('styles/a.css', 'css-a');

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('styles/a.css');
    expect(global.fetch).toHaveBeenCalledWith('chrome-extension://mock-id/styles/a.css');
    const style = document.getElementById('css-a');
    expect(style).not.toBeNull();
    expect(style.textContent).toBe('.a{color:red}');
    expect(isLoaded('css-a')).toBe(true);
  });

  test('resolves immediately without fetching when the id is already loaded', async () => {
    mockFetchOk('.a{}');
    await loadCSS('styles/dup.css', 'css-dup');
    global.fetch.mockClear();

    await loadCSS('styles/dup.css', 'css-dup');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('removes a pre-existing DOM element with the same id before injecting', async () => {
    const stale = document.createElement('style');
    stale.id = 'css-stale';
    stale.textContent = '.old{}';
    document.head.appendChild(stale);
    mockFetchOk('.new{}');

    await loadCSS('styles/stale.css', 'css-stale');

    const styles = document.querySelectorAll('#css-stale');
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toBe('.new{}');
  });

  test('rejects when the response is not ok', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('') });

    await expect(loadCSS('styles/missing.css', 'css-404')).rejects.toThrow('Failed to load CSS: 404');
    expect(isLoaded('css-404')).toBe(false);
  });

  test('rejects when fetch itself fails', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));

    await expect(loadCSS('styles/x.css', 'css-net')).rejects.toThrow('network down');
    expect(isLoaded('css-net')).toBe(false);
  });

  test('uses the raw path when chrome.runtime is unavailable', async () => {
    delete global.chrome.runtime;
    mockFetchOk('.raw{}');

    await loadCSS('raw.css', 'css-raw');

    expect(global.fetch).toHaveBeenCalledWith('raw.css');
    expect(document.getElementById('css-raw').textContent).toBe('.raw{}');
  });
});

describe('loadMultipleCSS', () => {
  test('loads several files and resolves with all results', async () => {
    mockFetchOk('.multi{}');

    const results = await loadMultipleCSS([
      { path: 'a.css', id: 'css-m1' },
      { path: 'b.css', id: 'css-m2' },
    ]);

    expect(results.length).toBe(2);
    expect(isLoaded('css-m1')).toBe(true);
    expect(isLoaded('css-m2')).toBe(true);
  });

  test('rejects when any file fails', async () => {
    global.fetch.mockRejectedValue(new Error('boom'));
    await expect(loadMultipleCSS([{ path: 'a.css', id: 'css-mf1' }])).rejects.toThrow('boom');
  });
});

describe('removeCSS / isLoaded', () => {
  test('removes an injected style and marks it unloaded', async () => {
    mockFetchOk('.gone{}');
    await loadCSS('gone.css', 'css-gone');
    expect(isLoaded('css-gone')).toBe(true);

    removeCSS('css-gone');
    expect(document.getElementById('css-gone')).toBeNull();
    expect(isLoaded('css-gone')).toBe(false);
  });

  test('removeCSS on an unknown id does not throw', () => {
    expect(() => removeCSS('css-never')).not.toThrow();
  });

  test('isLoaded is false for unknown ids', () => {
    expect(isLoaded('css-unknown')).toBe(false);
  });
});

describe('default export', () => {
  test('exposes all functions', () => {
    expect(cssLoader.default).toMatchObject({
      loadCSS: expect.any(Function),
      loadMultipleCSS: expect.any(Function),
      removeCSS: expect.any(Function),
      isLoaded: expect.any(Function),
    });
  });
});
