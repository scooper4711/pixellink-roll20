/**
 * PixelsBridge Module Tests
 *
 * Tests for Bluetooth dice bridging: connection flows, roll/status event
 * wiring, unprompted roll batching, and pixel lookup helpers.
 */

jest.mock('@scooper4711/pixels-ble', () => ({
  DiceManager: jest.fn().mockImplementation(() => ({
    dice: new Map(),
    connectedDice: [],
    requestPixel: jest.fn(),
    reconnect: jest.fn(),
    forget: jest.fn(),
    connectKnownDevices: jest.fn(() => Promise.resolve()),
    addEventListener: jest.fn(),
  })),
}));

const { DiceManager } = require('@scooper4711/pixels-ble');

// Globals captured at module import time must exist before requiring PixelsBridge.
window.log = jest.fn();
window.postChatMessage = jest.fn();
window.sendTextToExtension = jest.fn();

describe('PixelsBridge', () => {
  // NOTE: no jest.resetModules() here — resetting the registry drops the
  // jest.mock above and the module would bind the real DiceManager.
  // The module is required once and state is reset per test instead.
  const PixelsBridge = require('../../src/content/modules/PixelsBridge.js');
  const diceManager = DiceManager.mock.results[0].value;
  const managerListeners = {};
  diceManager.addEventListener.mock.calls.forEach(([event, cb]) => {
    managerListeners[event] = cb;
  });

  function makePixel(overrides = {}) {
    const pixelListeners = {};
    return {
      pixelListeners,
      pixel: {
        name: 'TestD6',
        systemId: 'sys-1',
        isConnected: true,
        disconnect: jest.fn(),
        reportRssi: jest.fn(() => Promise.resolve()),
        addEventListener: jest.fn((event, cb) => {
          pixelListeners[event] = cb;
        }),
        ...overrides,
      },
    };
  }

  beforeEach(() => {
    document.head.innerHTML = '';
    document.documentElement.replaceChild(document.createElement('body'), document.body);

    jest.clearAllMocks();
    diceManager.requestPixel.mockReset();
    diceManager.reconnect.mockReset();
    diceManager.forget.mockReset();
    diceManager.connectKnownDevices.mockReset();
    diceManager.connectKnownDevices.mockResolvedValue(undefined);
    diceManager.dice.clear();
    diceManager.connectedDice = [];

    window.sendStatusToExtension = jest.fn();
    window.pixelsAllowUnprompted = true;
    delete window.PixelsCommand;
    delete window.RollBatcher;
  });

  describe('initialize', () => {
    test('should connect known devices on startup', async () => {
      PixelsBridge.initialize();
      expect(diceManager.connectKnownDevices).toHaveBeenCalled();
      expect(window.log).toHaveBeenCalledWith('PixelsBridge module initialized');
    });

    test('should log when silent reconnection fails', async () => {
      diceManager.connectKnownDevices.mockRejectedValueOnce(new Error('no bluetooth'));
      PixelsBridge.initialize();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(window.log).toHaveBeenCalledWith(expect.stringContaining('Silent reconnection failed'));
    });
  });

  describe('connectToPixel', () => {
    test('should return the chosen pixel', async () => {
      const { pixel } = makePixel();
      diceManager.requestPixel.mockResolvedValue(pixel);
      await expect(PixelsBridge.connectToPixel()).resolves.toBe(pixel);
      expect(window.sendTextToExtension).toHaveBeenCalledWith('Connected to TestD6');
    });

    test('should return null when the user cancels the chooser', async () => {
      const cancelError = new Error('cancelled');
      cancelError.name = 'NotFoundError';
      diceManager.requestPixel.mockRejectedValue(cancelError);
      await expect(PixelsBridge.connectToPixel()).resolves.toBeNull();
    });

    test('should rethrow unexpected errors', async () => {
      diceManager.requestPixel.mockRejectedValue(new Error('boom'));
      await expect(PixelsBridge.connectToPixel()).rejects.toThrow('boom');
    });
  });

  describe('connectToPixelByName', () => {
    test('should return an already-connected die without reconnecting', async () => {
      const { pixel } = makePixel({ name: 'MyD20', isConnected: true });
      diceManager.dice.set('sys-1', pixel);
      await expect(PixelsBridge.connectToPixelByName('MyD20')).resolves.toBe(pixel);
      expect(diceManager.reconnect).not.toHaveBeenCalled();
    });

    test('should reconnect a known disconnected die', async () => {
      const { pixel } = makePixel({ name: 'MyD20', isConnected: false });
      diceManager.dice.set('sys-1', pixel);
      diceManager.reconnect.mockResolvedValue(undefined);
      await expect(PixelsBridge.connectToPixelByName('MyD20')).resolves.toBe(pixel);
      expect(diceManager.reconnect).toHaveBeenCalledWith('sys-1');
    });

    test('should fall back to the chooser for unknown dice', async () => {
      const { pixel } = makePixel();
      diceManager.requestPixel.mockResolvedValue(pixel);
      await expect(PixelsBridge.connectToPixelByName('Nope')).resolves.toBe(pixel);
      expect(diceManager.requestPixel).toHaveBeenCalled();
    });
  });

  describe('disconnectAllPixels', () => {
    test('should disconnect only connected dice', () => {
      const { pixel: connected } = makePixel({ name: 'A' });
      const { pixel: idle } = makePixel({ name: 'B', isConnected: false });
      diceManager.dice.set('a', connected);
      diceManager.dice.set('b', idle);
      PixelsBridge.disconnectAllPixels();
      expect(connected.disconnect).toHaveBeenCalled();
      expect(idle.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('pixel lookups', () => {
    test('should list pixels and find them by name', () => {
      const { pixel } = makePixel({ name: 'Searched' });
      diceManager.dice.set('sys-1', pixel);
      expect(PixelsBridge.getPixels()).toEqual([pixel]);
      expect(PixelsBridge.findPixelByName('Searched')).toBe(pixel);
      expect(PixelsBridge.findPixelByName('Missing')).toBeUndefined();
    });

    test('should search an explicit list when provided', () => {
      const { pixel } = makePixel({ name: 'Listed' });
      expect(PixelsBridge.findPixelByName('Listed', [pixel])).toBe(pixel);
    });

    test('should return connected dice', () => {
      const { pixel } = makePixel();
      diceManager.connectedDice = [pixel];
      expect(PixelsBridge.getConnectedPixelsList()).toEqual([pixel]);
    });
  });

  describe('roll events', () => {
    test('should offer rolls to an active prompt', () => {
      const offerRoll = jest.fn();
      window.PixelsCommand = { isPromptActive: () => true, offerRoll };
      const { pixel, pixelListeners } = makePixel();
      managerListeners.dieAdded(pixel);
      pixelListeners.roll({ face: 4, dieType: 6 });
      expect(offerRoll).toHaveBeenCalledWith(6, 4);
    });

    test('should ignore rolls when unprompted rolls are disallowed', () => {
      window.pixelsAllowUnprompted = false;
      window.RollBatcher = { addRoll: jest.fn(), parseDieType: jest.fn() };
      const { pixel, pixelListeners } = makePixel();
      managerListeners.dieAdded(pixel);
      pixelListeners.roll({ face: 4, dieType: 6 });
      expect(window.RollBatcher.addRoll).not.toHaveBeenCalled();
      expect(window.postChatMessage).not.toHaveBeenCalled();
    });

    test('should batch unprompted rolls', () => {
      const addRoll = jest.fn();
      window.RollBatcher = { addRoll, parseDieType: jest.fn() };
      const { pixel, pixelListeners } = makePixel({ name: 'PixelD6_X' });
      managerListeners.dieAdded(pixel);
      pixelListeners.roll({ face: 4, dieType: 6 });
      expect(addRoll).toHaveBeenCalledWith({ dieName: 'PixelD6_X', dieType: 6, faceValue: 4 });
    });

    test('should infer die type when the event omits it', () => {
      const addRoll = jest.fn();
      const parseDieType = jest.fn(() => 20);
      window.RollBatcher = { addRoll, parseDieType };
      const { pixel, pixelListeners } = makePixel({ name: 'Mystery' });
      managerListeners.dieAdded(pixel);
      pixelListeners.roll({ face: 15, dieType: 0 });
      expect(parseDieType).toHaveBeenCalledWith('Mystery', 15);
      expect(addRoll).toHaveBeenCalledWith({ dieName: 'Mystery', dieType: 20, faceValue: 15 });
    });

    test('should post directly when no batcher exists', () => {
      const { pixel, pixelListeners } = makePixel({ name: 'Solo' });
      managerListeners.dieAdded(pixel);
      pixelListeners.roll({ face: 5, dieType: 6 });
      expect(window.postChatMessage).toHaveBeenCalled();
      expect(window.sendTextToExtension).toHaveBeenCalledWith('Solo: face up = 5');
    });
  });

  describe('status events', () => {
    test('should announce connects and disconnects', () => {
      const { pixel, pixelListeners } = makePixel();
      managerListeners.dieAdded(pixel);
      pixelListeners.status({ connected: true });
      expect(window.sendTextToExtension).toHaveBeenCalledWith('Connected to TestD6');
      expect(window.sendStatusToExtension).toHaveBeenCalled();
      pixelListeners.status({ connected: false });
      expect(window.log).toHaveBeenCalledWith('Pixel TestD6 disconnected');
    });

    test('should log battery and rssi updates', () => {
      const { pixel, pixelListeners } = makePixel();
      managerListeners.dieAdded(pixel);
      pixelListeners.battery({ level: 80 });
      pixelListeners.rssi({ rssi: -60 });
      expect(window.log).toHaveBeenCalledWith('Pixel TestD6 battery: 80%');
      expect(window.log).toHaveBeenCalledWith('Pixel TestD6 RSSI: -60 dBm');
    });

    test('should ignore unsupported rssi reporting', async () => {
      const { pixel } = makePixel({
        reportRssi: jest.fn(() => Promise.reject(new Error('unsupported'))),
      });
      managerListeners.dieAdded(pixel);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(pixel.reportRssi).toHaveBeenCalledWith(true, 5000);
    });

    test('should refresh status on manager events', () => {
      managerListeners.dieConnected();
      managerListeners.dieDisconnected();
      expect(window.sendStatusToExtension).toHaveBeenCalledTimes(2);
    });
  });
});
