'use strict';

/**
 * Tests for src/core/extensionMessaging.ts.
 * Covers send/receive paths, error paths, and listener registration
 * using the chrome mock. Complements (does not duplicate)
 * tests/jest/coreModules.test.js, which covers modifierSettings only.
 */

describe('extensionMessaging', () => {
  let messaging;
  let onMessageListener;

  function loadMessaging() {
    jest.resetModules();
    onMessageListener = undefined;
    global.chrome = {
      runtime: {
        getURL: jest.fn(p => `chrome-extension://mock-id/${p}`),
        sendMessage: jest.fn(),
        onMessage: {
          addListener: jest.fn(fn => {
            onMessageListener = fn;
          }),
        },
      },
      storage: {
        sync: { get: jest.fn(), set: jest.fn() },
        local: { get: jest.fn((key, cb) => cb({})) },
      },
      action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn(),
      },
    };
    delete window.getPixels;
    delete window.connectToPixel;
    delete window.disconnectAllPixels;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    messaging = require('../../../src/core/extensionMessaging.js');
    return messaging;
  }

  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  function setKnownDice(dice) {
    global.chrome.storage.local.get.mockImplementation((key, cb) => {
      cb({ pixels_known_dice: dice });
    });
  }

  beforeEach(() => {
    loadMessaging();
  });

  describe('sendMessageToExtension', () => {
    test('sends data via chrome.runtime.sendMessage', () => {
      messaging.sendMessageToExtension({ action: 'showText', text: 'hi' });
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'showText',
        text: 'hi',
      });
    });

    test('does not throw when chrome is undefined', () => {
      const saved = global.chrome;
      delete global.chrome;
      try {
        expect(() => messaging.sendMessageToExtension({ action: 'showText' })).not.toThrow();
      } finally {
        global.chrome = saved;
      }
    });

    test('does not throw when sendMessage is missing', () => {
      global.chrome.runtime.sendMessage = undefined;
      expect(() => messaging.sendMessageToExtension({ action: 'showText' })).not.toThrow();
    });

    test('silently ignores Extension context invalidated errors', () => {
      global.chrome.runtime.sendMessage = jest.fn(() => {
        throw new Error('Extension context invalidated.');
      });
      expect(() => messaging.sendMessageToExtension({ action: 'showText' })).not.toThrow();
      expect(console.warn).not.toHaveBeenCalledWith('Could not send message to extension:', expect.anything());
    });

    test('logs other send errors', () => {
      const err = new Error('boom');
      global.chrome.runtime.sendMessage = jest.fn(() => {
        throw err;
      });
      messaging.sendMessageToExtension({ action: 'showText' });
      expect(console.warn).toHaveBeenCalledWith('Could not send message to extension:', err);
    });

    test('sendTextToExtension wraps text with showText action', () => {
      messaging.sendTextToExtension('hello dice');
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'showText',
        text: 'hello dice',
      });
    });

    test('legacy global export is installed on window', () => {
      expect(window.sendMessageToExtension).toBe(messaging.sendMessageToExtension);
    });
  });

  describe('sendStatusToExtension', () => {
    test('reports no pixels when none connected and none known', async () => {
      setKnownDice([]);
      await messaging.sendStatusToExtension();
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'showText',
        text: 'No Pixels connected',
      });
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'updateBadge',
        count: 0,
      });
    });

    test('reports connected/total from live pixels', async () => {
      window.getPixels = () => [{ isConnected: true }, { isConnected: false }];
      setKnownDice([]);
      await messaging.sendStatusToExtension();
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'showText',
        text: '1/2 Pixels connected',
      });
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'updateBadge',
        count: 1,
      });
    });

    test('uses known dice total when larger than live pixel count', async () => {
      window.getPixels = () => [{ isConnected: true }];
      setKnownDice([
        { name: 'a', lastConnected: 1, dieType: 20 },
        { name: 'b', lastConnected: 2, dieType: 6 },
        { name: 'c', lastConnected: 3, dieType: null },
      ]);
      await messaging.sendStatusToExtension();
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'showText',
        text: '1/3 Pixels connected',
      });
    });

    test('treats pixels whose isConnected getter throws as disconnected', async () => {
      const bad = {};
      Object.defineProperty(bad, 'isConnected', {
        get() {
          throw new Error('gatt gone');
        },
      });
      window.getPixels = () => [{ isConnected: true }, bad];
      setKnownDice([]);
      await messaging.sendStatusToExtension();
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'showText',
        text: '1/2 Pixels connected',
      });
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'updateBadge',
        count: 1,
      });
    });

    test('falls back to zero known total when storage throws', async () => {
      window.getPixels = () => [{ isConnected: true }];
      global.chrome.storage.local.get.mockImplementation(() => {
        throw new Error('storage down');
      });
      await messaging.sendStatusToExtension();
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'showText',
        text: '1/1 Pixels connected',
      });
    });

    test('handles missing chrome.storage (getKnownDice resolves [])', async () => {
      window.getPixels = () => [];
      delete global.chrome.storage;
      await messaging.sendStatusToExtension();
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'showText',
        text: 'No Pixels connected',
      });
    });

    test('handles non-function window.getPixels', async () => {
      window.getPixels = 'not-a-function';
      setKnownDice([]);
      await messaging.sendStatusToExtension();
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'showText',
        text: 'No Pixels connected',
      });
    });
  });

  describe('setupMessageListener', () => {
    test('registers an onMessage listener in extension context', () => {
      messaging.setupMessageListener();
      expect(global.chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
      expect(typeof onMessageListener).toBe('function');
    });

    test('getStatus triggers a status update', async () => {
      window.getPixels = () => [{ isConnected: true }];
      setKnownDice([]);
      messaging.setupMessageListener();
      onMessageListener({ action: 'getStatus' }, {}, jest.fn());
      await flush();
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'showText',
        text: '1/1 Pixels connected',
      });
    });

    test('getStatus logs when status update rejects', async () => {
      window.getPixels = () => {
        throw new Error('pixels exploded');
      };
      messaging.setupMessageListener();
      onMessageListener({ action: 'getStatus' }, {}, jest.fn());
      await flush();
      expect(console.warn).toHaveBeenCalledWith('Error sending status to extension:', expect.any(Error));
    });

    test('connect calls window.connectToPixel', () => {
      window.connectToPixel = jest.fn();
      messaging.setupMessageListener();
      onMessageListener({ action: 'connect' }, {}, jest.fn());
      expect(window.connectToPixel).toHaveBeenCalledTimes(1);
    });

    test('connect logs when window.connectToPixel throws', () => {
      window.connectToPixel = jest.fn(() => {
        throw new Error('bt fail');
      });
      messaging.setupMessageListener();
      onMessageListener({ action: 'connect' }, {}, jest.fn());
      expect(console.warn).toHaveBeenCalledWith('Error connecting to pixel:', expect.any(Error));
    });

    test('connect logs async rejections instead of leaving them unhandled', async () => {
      window.connectToPixel = jest.fn(() => Promise.reject(new Error('bt offline')));
      messaging.setupMessageListener();
      onMessageListener({ action: 'connect' }, {}, jest.fn());
      await flush();
      expect(console.warn).toHaveBeenCalledWith('Error connecting to pixel:', expect.any(Error));
    });

    test('connect is a no-op when window.connectToPixel missing', () => {
      messaging.setupMessageListener();
      expect(() => onMessageListener({ action: 'connect' }, {}, jest.fn())).not.toThrow();
    });

    test('disconnect calls window.disconnectAllPixels', () => {
      window.disconnectAllPixels = jest.fn();
      messaging.setupMessageListener();
      onMessageListener({ action: 'disconnect' }, {}, jest.fn());
      expect(window.disconnectAllPixels).toHaveBeenCalledTimes(1);
    });

    test('disconnect logs when window.disconnectAllPixels throws', () => {
      window.disconnectAllPixels = jest.fn(() => {
        throw new Error('bt fail');
      });
      messaging.setupMessageListener();
      onMessageListener({ action: 'disconnect' }, {}, jest.fn());
      expect(console.warn).toHaveBeenCalledWith('Error disconnecting pixels:', expect.any(Error));
    });

    test('disconnect is a no-op when window.disconnectAllPixels missing', () => {
      messaging.setupMessageListener();
      expect(() => onMessageListener({ action: 'disconnect' }, {}, jest.fn())).not.toThrow();
    });

    test('unknown action is ignored', () => {
      messaging.setupMessageListener();
      expect(() => onMessageListener({ action: 'whatever' }, {}, jest.fn())).not.toThrow();
      expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    test.each([[null], [undefined], ['just-a-string'], [42]])('invalid message %p is logged gracefully', message => {
      messaging.setupMessageListener();
      onMessageListener(message, {}, jest.fn());
      expect(console.warn).toHaveBeenCalledWith(`Received invalid message: ${JSON.stringify(message)}`);
    });

    test('logs when addListener itself throws', () => {
      global.chrome.runtime.onMessage.addListener.mockImplementation(() => {
        throw new Error('no listener');
      });
      messaging.setupMessageListener();
      expect(console.warn).toHaveBeenCalledWith('Could not set up extension message listener:', 'no listener');
    });

    test('does nothing when not in extension context', () => {
      const saved = global.chrome;
      delete global.chrome;
      try {
        expect(() => messaging.setupMessageListener()).not.toThrow();
      } finally {
        global.chrome = saved;
      }
    });

    test('does nothing when onMessage is missing', () => {
      delete global.chrome.runtime.onMessage;
      expect(() => messaging.setupMessageListener()).not.toThrow();
    });
  });
});
