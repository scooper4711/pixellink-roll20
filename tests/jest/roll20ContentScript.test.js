/**
 * roll20 Content Script Tests
 *
 * Exercises the message handlers and startup flow in
 * src/content/roll20.ts. Collaborator modules are mocked so each
 * handler is tested in isolation.
 */

jest.mock('../../src/content/modules/PixelsBridge.js', () => ({
  initialize: jest.fn(),
  connectToPixel: jest.fn(),
  connectToPixelByName: jest.fn(),
  disconnectAllPixels: jest.fn(),
  getPixels: jest.fn(() => []),
  findPixelByName: jest.fn(),
  diceManager: { forget: jest.fn(() => Promise.resolve()) },
}));

jest.mock('../../src/content/modules/PixelsCommand.js', () => ({
  setupChatInterception: jest.fn(),
}));

jest.mock('../../src/core/extensionMessaging.js', () => ({
  sendTextToExtension: jest.fn(),
  sendStatusToExtension: jest.fn(() => Promise.resolve()),
  setupMessageListener: jest.fn(),
}));

const flushMicrotasks = async (rounds = 10) => {
  for (let round = 0; round < rounds; round += 1) {
    await Promise.resolve();
  }
};

describe('roll20 content script', () => {
  let messageListeners;
  let chromeMock;
  let pixelsBridge;
  let extensionMessaging;

  function installChromeMock({ storageValues = {}, listenerBehavior } = {}) {
    messageListeners = [];
    const addListener = listenerBehavior
      ? jest.fn(listenerBehavior)
      : jest.fn(listener => {
          messageListeners.push(listener);
        });
    chromeMock = {
      storage: {
        local: {
          get: jest.fn((key, callback) => callback(storageValues)),
        },
      },
      runtime: {
        onMessage: { addListener },
      },
    };
    global.chrome = chromeMock;
  }

  function installWindowDefaults() {
    delete window.roll20PixelsLoaded;
    delete window.RollBatcher;
    delete window.ModifierBox;
    delete window.ModifierBoxRowManager;
    delete window.ThemeDetector;
    delete window.pixelsAllowUnprompted;
    delete window.pixelsAllowDiceSubstitution;
    window.log = jest.fn();
    window.showModifierBox = jest.fn();
    window.hideModifierBox = jest.fn();
    window.isRoll20PopupWindow = jest.fn(() => false);
  }

  function loadContentScript(configureCollaborators) {
    jest.resetModules();
    pixelsBridge = require('../../src/content/modules/PixelsBridge.js');
    extensionMessaging = require('../../src/core/extensionMessaging.js');
    if (configureCollaborators) {
      configureCollaborators({ pixelsBridge, extensionMessaging });
    }
    require('../../src/content/roll20.js');
    jest.runAllTimers();
  }

  function dispatchMessage(message) {
    const sendResponse = jest.fn();
    const result = messageListeners[0](message, null, sendResponse);
    return { sendResponse, result };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    installChromeMock();
    installWindowDefaults();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.chrome;
  });

  describe('startup', () => {
    test('loads saved settings from chrome storage', () => {
      installChromeMock({
        storageValues: {
          pixels_allow_unprompted: false,
          pixels_allow_dice_substitution: true,
        },
      });
      loadContentScript();
      expect(window.pixelsAllowUnprompted).toBe(false);
      expect(window.pixelsAllowDiceSubstitution).toBe(true);
    });

    test('keeps defaults when storage is empty', () => {
      loadContentScript();
      expect(window.pixelsAllowUnprompted).toBe(true);
      expect(window.pixelsAllowDiceSubstitution).toBe(false);
    });

    test('initializes modules and exposes window functions', () => {
      loadContentScript();
      expect(pixelsBridge.initialize).toHaveBeenCalled();
      expect(extensionMessaging.setupMessageListener).toHaveBeenCalled();
      expect(window.connectToPixel).toBe(pixelsBridge.connectToPixel);
      expect(window.sendStatusToExtension).toBe(extensionMessaging.sendStatusToExtension);
      expect(messageListeners).toHaveLength(1);
    });

    test('starts without chrome APIs', () => {
      delete global.chrome;
      expect(() => loadContentScript()).not.toThrow();
      expect(window.showModifierBox).toHaveBeenCalled();
    });

    test('skips saved rolls panel in popup windows', () => {
      window.isRoll20PopupWindow = jest.fn(() => true);
      loadContentScript();
      expect(window.showModifierBox).not.toHaveBeenCalled();
      expect(window.log).toHaveBeenCalledWith('Skipping saved rolls panel in popup window');
    });

    test('hides saved rolls panel when visibility setting is false', () => {
      installChromeMock({
        storageValues: { pixels_saved_rolls_visible: false },
      });
      loadContentScript();
      expect(window.showModifierBox).not.toHaveBeenCalled();
    });

    test('logs panel errors instead of throwing', () => {
      window.showModifierBox = jest.fn(() => {
        throw new Error('panel broken');
      });
      loadContentScript();
      expect(window.log).toHaveBeenCalledWith(expect.stringContaining('Error showing saved rolls panel'));
    });

    test('logs initial status failures instead of throwing', async () => {
      loadContentScript(({ extensionMessaging }) => {
        extensionMessaging.sendStatusToExtension.mockRejectedValueOnce(new Error('status down'));
      });
      await flushMicrotasks();
      expect(window.log).toHaveBeenCalledWith(expect.stringContaining('Error sending initial status'));
    });

    test('reports message listener setup failures', () => {
      installChromeMock({
        listenerBehavior: () => {
          throw new Error('listener denied');
        },
      });
      loadContentScript();
      expect(console.warn).toHaveBeenCalledWith('Could not set up extension message listener:', expect.anything());
    });

    test('starts on DOMContentLoaded while document is loading', () => {
      Object.defineProperty(document, 'readyState', {
        configurable: true,
        get: () => 'loading',
      });
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
      try {
        jest.resetModules();
        pixelsBridge = require('../../src/content/modules/PixelsBridge.js');
        extensionMessaging = require('../../src/core/extensionMessaging.js');
        require('../../src/content/roll20.js');
        const domReady = addEventListenerSpy.mock.calls.find(([event]) => event === 'DOMContentLoaded');
        expect(domReady).toBeDefined();
        domReady[1]();
        jest.runAllTimers();
        expect(messageListeners).toHaveLength(1);
      } finally {
        addEventListenerSpy.mockRestore();
        delete document.readyState;
      }
    });
  });

  describe('message validation', () => {
    test('rejects null and non-object messages', () => {
      loadContentScript();
      expect(() => dispatchMessage(null)).not.toThrow();
      expect(() => dispatchMessage('getStatus')).not.toThrow();
      expect(window.log).toHaveBeenCalledWith(expect.stringContaining('Received invalid message'));
    });

    test('logs unknown actions', () => {
      loadContentScript();
      dispatchMessage({ action: 'noSuchAction' });
      expect(window.log).toHaveBeenCalledWith('Unknown action received: noSuchAction');
    });
  });

  describe('settings actions', () => {
    test('toggles unprompted rolls and dice substitution', () => {
      loadContentScript();
      dispatchMessage({ action: 'setAllowUnprompted', value: false });
      expect(window.pixelsAllowUnprompted).toBe(false);
      dispatchMessage({ action: 'setAllowUnprompted' });
      expect(window.pixelsAllowUnprompted).toBe(true);
      dispatchMessage({ action: 'setAllowDiceSubstitution', value: true });
      expect(window.pixelsAllowDiceSubstitution).toBe(true);
      dispatchMessage({ action: 'setAllowDiceSubstitution', value: false });
      expect(window.pixelsAllowDiceSubstitution).toBe(false);
    });

    test('persists the roll window and ignores non-numbers', () => {
      window.RollBatcher = { setWindowMs: jest.fn() };
      loadContentScript();
      dispatchMessage({ action: 'setRollWindow', value: 5 });
      expect(window.RollBatcher.setWindowMs).toHaveBeenCalledWith(5000);
      expect(localStorage.getItem('pixels_roll_window_seconds')).toBe('5');
      dispatchMessage({ action: 'setRollWindow', value: 'lots' });
      expect(window.RollBatcher.setWindowMs).toHaveBeenCalledTimes(1);
    });

    test('survives unavailable localStorage when persisting', () => {
      window.RollBatcher = { setWindowMs: jest.fn() };
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('denied');
      });
      try {
        loadContentScript();
        expect(() => dispatchMessage({ action: 'setRollWindow', value: 5 })).not.toThrow();
        expect(window.RollBatcher.setWindowMs).toHaveBeenCalledWith(5000);
      } finally {
        setItemSpy.mockRestore();
      }
    });
  });

  describe('saved rows actions', () => {
    test('returns live rows from the modifier box', () => {
      const liveRows = { rows: [{ name: 'attack' }], version: 2 };
      window.ModifierBox = { getElement: jest.fn(() => ({ id: 'box' })) };
      window.ModifierBoxRowManager = {
        serializeRows: jest.fn(() => liveRows),
      };
      loadContentScript();
      const { sendResponse } = dispatchMessage({ action: 'getCurrentRows' });
      expect(sendResponse).toHaveBeenCalledWith(liveRows);
    });

    test('falls back to stored rows when the box is absent', () => {
      localStorage.setItem('pixels_saved_rolls', JSON.stringify({ rows: [{ name: 'saved' }], version: 1 }));
      loadContentScript();
      const { sendResponse } = dispatchMessage({ action: 'getCurrentRows' });
      expect(sendResponse).toHaveBeenCalledWith({
        rows: [{ name: 'saved' }],
        version: 1,
      });
    });

    test('returns an empty default when nothing is stored', () => {
      loadContentScript();
      const { sendResponse } = dispatchMessage({ action: 'getCurrentRows' });
      expect(sendResponse).toHaveBeenCalledWith({ rows: [], version: 2 });
    });

    test('returns an empty default for corrupt stored rows', () => {
      localStorage.setItem('pixels_saved_rolls', 'not-json{{{');
      loadContentScript();
      const { sendResponse } = dispatchMessage({ action: 'getCurrentRows' });
      expect(sendResponse).toHaveBeenCalledWith({ rows: [], version: 2 });
      expect(window.log).toHaveBeenCalledWith(expect.stringContaining('Could not read stored rows'));
    });

    test('applies a profile through the row manager', async () => {
      const box = { id: 'box' };
      const profile = { rows: [], version: 2 };
      window.ModifierBox = {
        show: jest.fn(() => Promise.resolve()),
        getElement: jest.fn(() => box),
      };
      window.ModifierBoxRowManager = {
        applyProfileRows: jest.fn(() => true),
      };
      loadContentScript();
      const { sendResponse, result } = dispatchMessage({
        action: 'applyProfile',
        profile,
      });
      expect(result).toBe(true);
      await flushMicrotasks();
      expect(window.ModifierBoxRowManager.applyProfileRows).toHaveBeenCalledWith(box, profile);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('reports failure when no modifier box exists', async () => {
      loadContentScript();
      const { sendResponse } = dispatchMessage({
        action: 'applyProfile',
        profile: { rows: [], version: 2 },
      });
      await flushMicrotasks();
      expect(sendResponse).toHaveBeenCalledWith({ success: false });
    });

    test('reports profile errors instead of throwing', async () => {
      window.ModifierBox = {
        show: jest.fn(() => Promise.reject(new Error('show failed'))),
        getElement: jest.fn(),
      };
      loadContentScript();
      const { sendResponse } = dispatchMessage({
        action: 'applyProfile',
        profile: { rows: [], version: 2 },
      });
      await flushMicrotasks();
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'show failed',
      });
    });
  });

  describe('connection actions', () => {
    test('connects and disconnects pixels', async () => {
      loadContentScript();
      dispatchMessage({ action: 'connect' });
      await flushMicrotasks();
      expect(pixelsBridge.connectToPixel).toHaveBeenCalled();
      dispatchMessage({ action: 'disconnect' });
      expect(pixelsBridge.disconnectAllPixels).toHaveBeenCalled();
    });

    test('notifies the user when connecting fails', async () => {
      loadContentScript();
      pixelsBridge.connectToPixel.mockRejectedValueOnce(new Error('no adapter'));
      window.sendTextToExtension = jest.fn();
      dispatchMessage({ action: 'connect' });
      await flushMicrotasks();
      expect(window.log).toHaveBeenCalledWith('Error connecting to Pixel: no adapter');
      expect(window.sendTextToExtension).toHaveBeenCalledWith('Failed to connect: no adapter');
    });

    test('reconnects by name and reports failures', async () => {
      loadContentScript();
      pixelsBridge.connectToPixelByName.mockResolvedValueOnce({});
      window.sendTextToExtension = jest.fn();
      dispatchMessage({ action: 'reconnect', name: 'PixelA' });
      await flushMicrotasks();
      expect(pixelsBridge.connectToPixelByName).toHaveBeenCalledWith('PixelA');
      pixelsBridge.connectToPixelByName.mockRejectedValueOnce(new Error('gone'));
      dispatchMessage({ action: 'reconnect', name: 'PixelA' });
      await flushMicrotasks();
      expect(window.sendTextToExtension).toHaveBeenCalledWith('Failed to reconnect to PixelA: gone');
    });

    test('disconnects, blinks, and forgets pixels by name', async () => {
      const pixel = {
        disconnect: jest.fn(() => Promise.resolve()),
        blink: jest.fn(() => Promise.resolve()),
        isConnected: true,
        systemId: 'sys-1',
      };
      loadContentScript();
      pixelsBridge.findPixelByName.mockReturnValue(pixel);
      dispatchMessage({ action: 'disconnectByName', name: 'PixelA' });
      dispatchMessage({ action: 'blinkByName', name: 'PixelA' });
      dispatchMessage({ action: 'forgetByName', name: 'PixelA' });
      await flushMicrotasks();
      expect(pixel.disconnect).toHaveBeenCalled();
      expect(pixel.blink).toHaveBeenCalledWith({ r: 0xcc, g: 0x66, b: 0x00 });
      expect(pixelsBridge.diceManager.forget).toHaveBeenCalledWith('sys-1');
    });

    test('ignores pixel actions for unknown names', async () => {
      loadContentScript();
      pixelsBridge.findPixelByName.mockReturnValue(undefined);
      expect(() => dispatchMessage({ action: 'disconnectByName', name: 'Nobody' })).not.toThrow();
      expect(() => dispatchMessage({ action: 'blinkByName', name: 'Nobody' })).not.toThrow();
      expect(() => dispatchMessage({ action: 'forgetByName', name: 'Nobody' })).not.toThrow();
      await flushMicrotasks();
    });

    test('skips blinking disconnected pixels and logs failures', async () => {
      const pixel = {
        disconnect: jest.fn(() => Promise.resolve()),
        blink: jest.fn(() => Promise.reject(new Error('blink denied'))),
        isConnected: false,
        systemId: 'sys-1',
      };
      loadContentScript();
      pixelsBridge.findPixelByName.mockReturnValue(pixel);
      dispatchMessage({ action: 'blinkByName', name: 'PixelA' });
      await flushMicrotasks();
      expect(pixel.blink).not.toHaveBeenCalled();
      pixel.isConnected = true;
      pixel.disconnect.mockRejectedValueOnce(new Error('stuck'));
      dispatchMessage({ action: 'blinkByName', name: 'PixelA' });
      dispatchMessage({ action: 'disconnectByName', name: 'PixelA' });
      pixelsBridge.diceManager.forget.mockRejectedValueOnce(new Error('unknown die'));
      dispatchMessage({ action: 'forgetByName', name: 'PixelA' });
      await flushMicrotasks();
      expect(window.log).toHaveBeenCalledWith('Blink failed for PixelA: blink denied');
      expect(window.log).toHaveBeenCalledWith('Disconnect failed for PixelA: stuck');
      expect(window.log).toHaveBeenCalledWith('Could not forget PixelA: unknown die');
    });

    test('reports connected dice with levels and types', () => {
      const connected = { name: 'PixelA', isConnected: true };
      Object.assign(connected, {
        batteryLevel: 80,
        dieType: 20,
        rssi: -60,
      });
      const stale = {
        name: 'PixelB',
        isConnected: false,
        batteryLevel: null,
        dieType: null,
        rssi: null,
      };
      const partial = {
        name: 'PixelC',
        isConnected: true,
        batteryLevel: null,
        dieType: null,
        rssi: null,
      };
      loadContentScript();
      pixelsBridge.getPixels.mockReturnValue([connected, stale, partial]);
      const { sendResponse, result } = dispatchMessage({
        action: 'getConnectedDice',
      });
      expect(result).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({
        connected: ['PixelA', 'PixelC'],
        batteryLevels: { PixelA: 80 },
        dieTypes: { PixelA: 20 },
        rssiLevels: { PixelA: -60 },
      });
    });
  });

  describe('status and theme actions', () => {
    test('requests a status update and reports send failures', async () => {
      loadContentScript();
      dispatchMessage({ action: 'getStatus' });
      await flushMicrotasks();
      expect(extensionMessaging.sendStatusToExtension).toHaveBeenCalled();
      extensionMessaging.sendStatusToExtension.mockRejectedValueOnce(new Error('status failed'));
      dispatchMessage({ action: 'getStatus' });
      await flushMicrotasks();
      expect(window.log).toHaveBeenCalledWith('Error sending status to extension: status failed');
    });

    test('toggles the saved rolls panel', () => {
      loadContentScript();
      dispatchMessage({ action: 'showSavedRolls' });
      expect(window.showModifierBox).toHaveBeenCalled();
      dispatchMessage({ action: 'hideSavedRolls' });
      expect(window.hideModifierBox).toHaveBeenCalled();
    });

    test('detects the current theme with a dark fallback', () => {
      loadContentScript();
      window.ThemeDetector = { detectTheme: jest.fn(() => 'light') };
      const first = dispatchMessage({ action: 'getTheme' });
      expect(first.result).toBe(true);
      expect(first.sendResponse).toHaveBeenCalledWith({ theme: 'light' });
      delete window.ThemeDetector;
      const second = dispatchMessage({ action: 'getTheme' });
      expect(second.sendResponse).toHaveBeenCalledWith({ theme: 'dark' });
    });
  });
});
