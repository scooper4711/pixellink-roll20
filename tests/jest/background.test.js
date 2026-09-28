'use strict';

/**
 * Tests for src/background/background.ts (service-worker entry).
 * Drives the module by requiring it (side-effect listeners) then dispatching
 * fake messages through the captured chrome.runtime.onMessage listener.
 */

describe('background service worker', () => {
  let onInstalledListener;
  let onMessageListener;

  function loadBackground() {
    jest.resetModules();
    onInstalledListener = undefined;
    onMessageListener = undefined;
    global.chrome = {
      runtime: {
        getURL: jest.fn(p => `chrome-extension://mock-id/${p}`),
        sendMessage: jest.fn(),
        onInstalled: {
          addListener: jest.fn(fn => {
            onInstalledListener = fn;
          }),
        },
        onMessage: {
          addListener: jest.fn(fn => {
            onMessageListener = fn;
          }),
        },
      },
      storage: {
        sync: { get: jest.fn(), set: jest.fn() },
        local: { get: jest.fn() },
      },
      action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn(),
      },
    };
    require('../../src/background/background.js');
    return global.chrome;
  }

  function dispatch(request, sender = {}) {
    const sendResponse = jest.fn();
    const result = onMessageListener(request, sender, sendResponse);
    return { sendResponse, result };
  }

  test('registers onInstalled and onMessage listeners on load', () => {
    const chromeMock = loadBackground();
    expect(chromeMock.runtime.onInstalled.addListener).toHaveBeenCalledTimes(1);
    expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(typeof onInstalledListener).toBe('function');
    expect(typeof onMessageListener).toBe('function');
  });

  test('onInstalled initializes default settings when none stored', () => {
    const chromeMock = loadBackground();
    chromeMock.storage.sync.get.mockImplementation((keys, cb) => {
      cb({});
    });
    chromeMock.storage.sync.set.mockImplementation((items, cb) => {
      cb();
    });

    onInstalledListener();

    expect(chromeMock.storage.sync.get).toHaveBeenCalledWith(['pixelsSettings'], expect.any(Function));
    expect(chromeMock.storage.sync.set).toHaveBeenCalledWith(
      {
        pixelsSettings: {
          autoConnect: true,
          showModifierBox: true,
          theme: 'auto',
        },
      },
      expect.any(Function)
    );
  });

  test('onInstalled does not overwrite existing settings', () => {
    const chromeMock = loadBackground();
    chromeMock.storage.sync.get.mockImplementation((keys, cb) => {
      cb({ pixelsSettings: { autoConnect: false } });
    });

    onInstalledListener();

    expect(chromeMock.storage.sync.set).not.toHaveBeenCalled();
  });

  test('getSettings responds with stored settings and returns true', () => {
    const chromeMock = loadBackground();
    const stored = { autoConnect: true };
    chromeMock.storage.sync.get.mockImplementation((keys, cb) => {
      cb({ pixelsSettings: stored });
    });

    const { sendResponse, result } = dispatch({ action: 'getSettings' });

    expect(chromeMock.storage.sync.get).toHaveBeenCalledWith(['pixelsSettings'], expect.any(Function));
    expect(sendResponse).toHaveBeenCalledWith(stored);
    expect(result).toBe(true);
  });

  test('getSettings responds with {} when no settings stored', () => {
    const chromeMock = loadBackground();
    chromeMock.storage.sync.get.mockImplementation((keys, cb) => {
      cb({});
    });

    const { sendResponse, result } = dispatch({ action: 'getSettings' });

    expect(sendResponse).toHaveBeenCalledWith({});
    expect(result).toBe(true);
  });

  test('saveSettings persists settings, responds success, returns true', () => {
    const chromeMock = loadBackground();
    const settings = { autoConnect: false, showModifierBox: false, theme: 'dark' };
    chromeMock.storage.sync.set.mockImplementation((items, cb) => {
      cb();
    });

    const { sendResponse, result } = dispatch({
      action: 'saveSettings',
      settings,
    });

    expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({ pixelsSettings: settings }, expect.any(Function));
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
    expect(result).toBe(true);
  });

  test('updateBadge sets text/color for connected count and returns false', () => {
    const chromeMock = loadBackground();
    const sender = { tab: { id: 42 } };

    const { result } = dispatch({ action: 'updateBadge', count: 3 }, sender);

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      text: '3',
      tabId: 42,
    });
    expect(chromeMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: '#4ade80',
      tabId: 42,
    });
    expect(result).toBe(false);
  });

  test('updateBadge clears badge when count is 0/missing', () => {
    const chromeMock = loadBackground();
    const sender = { tab: { id: 7 } };

    const zero = dispatch({ action: 'updateBadge', count: 0 }, sender);
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      text: '',
      tabId: 7,
    });
    expect(chromeMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: '#666666',
      tabId: 7,
    });
    expect(zero.result).toBe(false);

    chromeMock.action.setBadgeText.mockClear();
    chromeMock.action.setBadgeBackgroundColor.mockClear();

    // count omitted -> falsy branch of `request.count || 0`
    const missing = dispatch({ action: 'updateBadge' }, sender);
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      text: '',
      tabId: 7,
    });
    expect(missing.result).toBe(false);
  });

  test('updateBadge without sender.tab.id does nothing and returns false', () => {
    const chromeMock = loadBackground();

    const noSender = dispatch({ action: 'updateBadge', count: 2 }, {});
    expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
    expect(chromeMock.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
    expect(noSender.result).toBe(false);

    const noTabId = dispatch({ action: 'updateBadge', count: 2 }, { tab: {} });
    expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
    expect(noTabId.result).toBe(false);
  });

  test('unknown action returns undefined and sends nothing', () => {
    const chromeMock = loadBackground();
    const { sendResponse, result } = dispatch({ action: 'bogus' });

    expect(result).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
    expect(chromeMock.storage.sync.get).not.toHaveBeenCalled();
    expect(chromeMock.storage.sync.set).not.toHaveBeenCalled();
  });
});
