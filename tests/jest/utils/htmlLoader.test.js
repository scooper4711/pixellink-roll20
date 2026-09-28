/**
 * @jest-environment jsdom
 */

const htmlLoader = require('../../../src/utils/htmlLoader.js');
const { loadTemplate, loadMultipleTemplates, isLoaded, getTemplate } = htmlLoader;

const originalFetch = global.fetch;
const originalRuntime = global.chrome && global.chrome.runtime;

function mockFetchOk(html) {
  global.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(html),
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

describe('loadTemplate', () => {
  test('fetches HTML via chrome.runtime.getURL and caches it', async () => {
    mockFetchOk('<div>hello</div>');

    const html = await loadTemplate('templates/a.html', 'tpl-a');

    expect(html).toBe('<div>hello</div>');
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('templates/a.html');
    expect(global.fetch).toHaveBeenCalledWith('chrome-extension://mock-id/templates/a.html');
    expect(isLoaded('tpl-a')).toBe(true);
    expect(getTemplate('tpl-a')).toBe('<div>hello</div>');
  });

  test('returns the cached template without fetching twice', async () => {
    mockFetchOk('<p>cached</p>');
    await loadTemplate('templates/c.html', 'tpl-cached');
    global.fetch.mockClear();

    const html = await loadTemplate('templates/c.html', 'tpl-cached');
    expect(html).toBe('<p>cached</p>');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects when the response is not ok', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('') });

    await expect(loadTemplate('templates/missing.html', 'tpl-404')).rejects.toThrow('Failed to load template: 404');
    expect(isLoaded('tpl-404')).toBe(false);
  });

  test('rejects when fetch itself fails', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));

    await expect(loadTemplate('templates/x.html', 'tpl-net')).rejects.toThrow('offline');
  });

  test('rejects when chrome.runtime is unavailable', async () => {
    delete global.chrome.runtime;

    await expect(loadTemplate('templates/y.html', 'tpl-noctx')).rejects.toThrow(
      /Chrome extension context not available/
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects when chrome.runtime.getURL throws', async () => {
    chrome.runtime.getURL.mockImplementationOnce(() => {
      throw new Error('no url');
    });

    await expect(loadTemplate('templates/z.html', 'tpl-throw')).rejects.toThrow(
      'Chrome extension context not available: no url'
    );
  });
});

describe('loadMultipleTemplates', () => {
  test('loads several templates in order', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('<a/>') })
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('<b/>') });

    const results = await loadMultipleTemplates([
      { path: 'a.html', id: 'tpl-m1' },
      { path: 'b.html', id: 'tpl-m2' },
    ]);

    expect(results).toEqual(['<a/>', '<b/>']);
  });

  test('rejects when any template fails', async () => {
    global.fetch.mockRejectedValue(new Error('boom'));
    await expect(loadMultipleTemplates([{ path: 'a.html', id: 'tpl-mf1' }])).rejects.toThrow('boom');
  });
});

describe('isLoaded / getTemplate', () => {
  test('false and null for unknown ids', () => {
    expect(isLoaded('tpl-unknown')).toBe(false);
    expect(getTemplate('tpl-unknown')).toBeNull();
  });
});

describe('default export', () => {
  test('exposes all functions', () => {
    expect(htmlLoader.default).toMatchObject({
      loadTemplate: expect.any(Function),
      loadMultipleTemplates: expect.any(Function),
      isLoaded: expect.any(Function),
      getTemplate: expect.any(Function),
    });
  });
});
