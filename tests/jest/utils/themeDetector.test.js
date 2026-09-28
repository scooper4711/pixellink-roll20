/**
 * @jest-environment jsdom
 */

const themeDetector = require('../../../src/utils/themeDetector.js');
const { parseColor, detectTheme, getThemeColors, onThemeChange } = themeDetector;

// jsdom's real Storage instance silently ignores `localStorage.setItem = ...`
// patching, so onThemeChange's interception (and the getItem try/catch) can
// only be exercised with a swappable fake. window.localStorage is an own,
// configurable accessor, so it can be temporarily replaced.
const savedLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
let fakeStore = {};
let fakeStorage = null;

function installFakeStorage() {
  fakeStore = {};
  fakeStorage = {
    getItem: jest.fn(k => (k in fakeStore ? fakeStore[k] : null)),
    setItem: jest.fn((k, v) => {
      fakeStore[k] = String(v);
    }),
    removeItem: jest.fn(k => {
      delete fakeStore[k];
    }),
    clear: jest.fn(() => {
      for (const k of Object.keys(fakeStore)) delete fakeStore[k];
    }),
  };
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage,
    configurable: true,
    writable: true,
  });
}

function restoreRealStorage() {
  if (savedLocalStorageDescriptor) {
    Object.defineProperty(window, 'localStorage', savedLocalStorageDescriptor);
  } else {
    delete window.localStorage;
  }
  fakeStorage = null;
}

function makeStorageEvent(key, newValue) {
  let event;
  try {
    event = new StorageEvent('storage', { key, newValue });
  } catch (_e) {
    event = new Event('storage');
    event.key = key;
    event.newValue = newValue;
  }
  return event;
}

const flushMutations = () => new Promise(resolve => setTimeout(resolve, 20));

beforeEach(() => {
  resetMocks();
  localStorage.clear();
  document.body.className = '';
  document.documentElement.className = '';
  delete document.body.dataset.theme;
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
  document.querySelectorAll('.textchatcontainer,#textchat').forEach(el => el.remove());
});

afterEach(() => {
  // Restore the real localStorage (discards any setItem patching installed
  // on the fake) and any jest spies.
  restoreRealStorage();
  jest.restoreAllMocks();
});

describe('parseColor', () => {
  test('returns null for null or empty input', () => {
    expect(parseColor(null)).toBeNull();
    expect(parseColor('')).toBeNull();
  });

  test('parses rgb() format', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor('rgb(255,255,255)')).toEqual({ r: 255, g: 255, b: 255 });
  });

  test('parses rgba() format (alpha ignored)', () => {
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3 });
  });

  test('parses hex format (either case)', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('#2B2B2B')).toEqual({ r: 43, g: 43, b: 43 });
  });

  test('returns null for unsupported formats', () => {
    expect(parseColor('red')).toBeNull();
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('#fff')).toBeNull();
    expect(parseColor('not a color')).toBeNull();
  });
});

describe('detectTheme', () => {
  test('prefers a valid localStorage colorTheme (dark)', () => {
    localStorage.setItem('colorTheme', 'dark');
    document.body.classList.add('lightmode');
    expect(detectTheme()).toBe('dark');
  });

  test('prefers a valid localStorage colorTheme (light)', () => {
    localStorage.setItem('colorTheme', 'light');
    document.body.classList.add('darkmode');
    expect(detectTheme()).toBe('light');
  });

  test('falls through to DOM classes when storage value is invalid', () => {
    localStorage.setItem('colorTheme', 'banana');
    document.body.classList.add('darkmode');
    expect(detectTheme()).toBe('dark');
  });

  test('reads darkmode/lightmode from body and html', () => {
    document.body.classList.add('darkmode');
    expect(detectTheme()).toBe('dark');

    document.body.className = '';
    document.documentElement.classList.add('darkmode');
    expect(detectTheme()).toBe('dark');

    document.documentElement.className = '';
    document.body.classList.add('lightmode');
    expect(detectTheme()).toBe('light');

    document.body.className = '';
    document.documentElement.classList.add('lightmode');
    expect(detectTheme()).toBe('light');
  });

  test('reads dataset.theme from body or html', () => {
    document.body.dataset.theme = 'light';
    expect(detectTheme()).toBe('light');

    delete document.body.dataset.theme;
    document.documentElement.dataset.theme = 'dark';
    expect(detectTheme()).toBe('dark');
  });

  test('infers theme from CSS custom property brightness', () => {
    document.documentElement.style.setProperty('--background-color', 'rgb(10, 10, 10)');
    expect(detectTheme()).toBe('dark');

    document.documentElement.style.setProperty('--background-color', 'rgb(250, 250, 250)');
    expect(detectTheme()).toBe('light');
  });

  test('infers theme from --main-bg when --background-color is absent', () => {
    document.documentElement.style.setProperty('--main-bg', 'rgb(250, 250, 250)');
    expect(detectTheme()).toBe('light');
  });

  test('falls back to the chat container color when variables are unparsable', () => {
    document.documentElement.style.setProperty('--background-color', 'notacolor');
    const chat = document.createElement('div');
    chat.className = 'textchatcontainer';
    chat.style.backgroundColor = 'rgb(5, 5, 5)';
    document.body.appendChild(chat);
    expect(detectTheme()).toBe('dark');

    chat.style.backgroundColor = 'rgb(250, 250, 250)';
    expect(detectTheme()).toBe('light');
  });

  test('supports the #textchat selector as chat container', () => {
    document.documentElement.style.setProperty('--background-color', 'notacolor');
    const chat = document.createElement('div');
    chat.id = 'textchat';
    chat.style.backgroundColor = 'rgb(250, 250, 250)';
    document.body.appendChild(chat);
    expect(detectTheme()).toBe('light');
  });

  test('defaults to dark when nothing is detectable', () => {
    expect(detectTheme()).toBe('dark');
  });

  test('survives a localStorage access error and uses the DOM', () => {
    installFakeStorage();
    fakeStorage.getItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    document.body.classList.add('darkmode');
    expect(detectTheme()).toBe('dark');
  });
});

describe('getThemeColors', () => {
  test('returns the dark palette for the dark theme', () => {
    localStorage.setItem('colorTheme', 'dark');
    const colors = getThemeColors();
    expect(colors.theme).toBe('dark');
    expect(colors.background).toBe('#2b2b2b');
    expect(colors.text).toBe('#ffffff');
    expect(colors.primary).toBe('#4CAF50');
  });

  test('returns the light palette for the light theme', () => {
    localStorage.setItem('colorTheme', 'light');
    const colors = getThemeColors();
    expect(colors.theme).toBe('light');
    expect(colors.background).toBe('#ffffff');
    expect(colors.text).toBe('#212529');
  });
});

describe('onThemeChange localStorage interception (fake storage)', () => {
  beforeEach(() => {
    installFakeStorage();
  });

  test('fires when localStorage colorTheme is set to a new theme', () => {
    localStorage.setItem('colorTheme', 'dark');
    const cb = jest.fn();
    onThemeChange(cb);

    localStorage.setItem('colorTheme', 'light');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBe('light');
    // Note: the source invokes the callback before delegating to the real
    // setItem, so the colors snapshot still reflects the previous theme.
    expect(cb.mock.calls[0][1]).toMatchObject({ primary: '#4CAF50' });
  });

  test('does not fire for the same theme or unrelated keys (still delegates)', () => {
    localStorage.setItem('colorTheme', 'dark');
    const cb = jest.fn();
    onThemeChange(cb);

    localStorage.setItem('colorTheme', 'dark');
    localStorage.setItem('otherKey', 'light');
    expect(cb).not.toHaveBeenCalled();
    expect(localStorage.getItem('otherKey')).toBe('light');
  });

  test('ignores invalid colorTheme values written to storage', () => {
    const cb = jest.fn();
    onThemeChange(cb);
    localStorage.setItem('colorTheme', 'banana');
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('onThemeChange', () => {
  test('fires on cross-tab storage events', () => {
    localStorage.setItem('colorTheme', 'dark');
    const cb = jest.fn();
    onThemeChange(cb);

    window.dispatchEvent(makeStorageEvent('colorTheme', 'light'));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBe('light');
  });

  test('ignores storage events for other keys, invalid values, or the same theme', () => {
    localStorage.setItem('colorTheme', 'dark');
    const cb = jest.fn();
    onThemeChange(cb);

    window.dispatchEvent(makeStorageEvent('other', 'light'));
    window.dispatchEvent(makeStorageEvent('colorTheme', 'banana'));
    window.dispatchEvent(makeStorageEvent('colorTheme', 'dark'));
    expect(cb).not.toHaveBeenCalled();
  });

  test('fires via MutationObserver when a class change flips the theme', async () => {
    document.body.classList.add('darkmode');
    const cb = jest.fn();
    const observer = onThemeChange(cb);
    expect(observer).toBeInstanceOf(MutationObserver);

    document.body.classList.remove('darkmode');
    document.body.classList.add('lightmode');
    await flushMutations();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBe('light');
    observer.disconnect();
  });

  test('observer mutations that keep the theme do not fire', async () => {
    document.body.classList.add('darkmode');
    const cb = jest.fn();
    const observer = onThemeChange(cb);

    document.body.classList.add('unrelated-class');
    await flushMutations();

    expect(cb).not.toHaveBeenCalled();
    observer.disconnect();
  });

  test('observes the html element too', async () => {
    document.body.classList.add('darkmode');
    const cb = jest.fn();
    const observer = onThemeChange(cb);

    localStorage.clear();
    document.body.className = '';
    document.documentElement.classList.add('lightmode');
    await flushMutations();

    expect(cb).toHaveBeenCalledWith('light', expect.objectContaining({ theme: 'light' }));
    observer.disconnect();
  });
});

describe('default export', () => {
  test('exposes all functions', () => {
    expect(themeDetector.default).toMatchObject({
      detectTheme: expect.any(Function),
      parseColor: expect.any(Function),
      getThemeColors: expect.any(Function),
      onThemeChange: expect.any(Function),
    });
  });
});
