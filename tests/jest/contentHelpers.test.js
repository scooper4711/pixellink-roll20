/**
 * Content Helper Module Tests
 *
 * Tests for Utils, Roll20Integration, and ModifierBoxManager —
 * chat posting, popup-aware modifier box visibility, and array helpers.
 */

describe('Content helpers', () => {
  let Utils;
  let Roll20Integration;
  let ModifierBoxManager;

  beforeEach(() => {
    jest.resetModules();
    document.head.innerHTML = '';
    document.documentElement.replaceChild(document.createElement('body'), document.body);

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    Utils = require('../../src/content/modules/Utils.js');
    Roll20Integration = require('../../src/content/modules/Roll20Integration.js');
    ModifierBoxManager = require('../../src/content/modules/ModifierBoxManager.js');

    delete window.ModifierBox;
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  describe('getArrayFirstElement', () => {
    test('should return the first element', () => {
      expect(Utils.getArrayFirstElement(['a', 'b'])).toBe('a');
    });

    test('should return undefined for missing or empty input', () => {
      expect(Utils.getArrayFirstElement(undefined)).toBeUndefined();
      expect(Utils.getArrayFirstElement([])).toBeUndefined();
    });
  });

  describe('postChatMessage', () => {
    function addChat() {
      document.body.innerHTML = '<div id="textchat-input"><textarea>original</textarea><button>Send</button></div>';
      return {
        textarea: document.querySelector('#textchat-input textarea'),
        button: document.querySelector('#textchat-input button'),
      };
    }

    test('should post through the Roll20 chat box and restore it', () => {
      const { textarea, button } = addChat();
      const clickSpy = jest.spyOn(button, 'click');
      Roll20Integration.postChatMessage('hello');
      expect(clickSpy).toHaveBeenCalled();
      expect(textarea.value).toBe('original');
    });

    test('should log when the chat box is missing', () => {
      Roll20Integration.postChatMessage('hello');
      expect(console.log).toHaveBeenCalledWith("Couldn't find Roll20 chat textarea and/or button");
    });

    test('should log when textarea or button is missing', () => {
      document.body.innerHTML = '<div id="textchat-input"></div>';
      Roll20Integration.postChatMessage('hello');
      expect(console.log).toHaveBeenCalledWith("Couldn't find Roll20 chat textarea and/or button");
    });
  });

  describe('showModifierBox', () => {
    function addBox(overrides = {}) {
      window.ModifierBox = {
        isInitialized: jest.fn(() => true),
        show: jest.fn(() => Promise.resolve()),
        hide: jest.fn(),
        ...overrides,
      };
      return window.ModifierBox;
    }

    test('should show an initialized box', async () => {
      const box = addBox();
      ModifierBoxManager.showModifierBox();
      expect(box.show).toHaveBeenCalled();
      await Promise.resolve();
      expect(console.error).not.toHaveBeenCalled();
    });

    test('should warn when the box is not initialized', () => {
      addBox({ isInitialized: () => false });
      ModifierBoxManager.showModifierBox();
      expect(console.log).toHaveBeenCalledWith('ModifierBox module not initialized yet');
    });

    test('should report show failures', async () => {
      addBox({ show: () => Promise.reject(new Error('denied')) });
      ModifierBoxManager.showModifierBox();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(console.error).toHaveBeenCalledWith('Failed to show modifier box:', expect.any(Error));
    });

    test('should tolerate a non-promise show result', () => {
      addBox({ show: () => undefined });
      expect(() => ModifierBoxManager.showModifierBox()).not.toThrow();
    });

    test('should log when the module is not loaded', () => {
      ModifierBoxManager.showModifierBox();
      expect(console.log).toHaveBeenCalledWith('ModifierBox module not loaded');
    });

    test('should skip popup windows', () => {
      const original = window.location;
      Object.defineProperty(window, 'location', {
        value: { href: 'https://app.roll20.net/editor/?popout=true' },
        writable: true,
        configurable: true,
      });
      try {
        addBox();
        ModifierBoxManager.showModifierBox();
        expect(console.log).toHaveBeenCalledWith('Skipping modifier box display - this is a Roll20 popup window');
      } finally {
        Object.defineProperty(window, 'location', {
          value: original,
          writable: true,
          configurable: true,
        });
      }
    });
  });

  describe('hideModifierBox', () => {
    test('should hide a loaded box', () => {
      window.ModifierBox = { hide: jest.fn() };
      ModifierBoxManager.hideModifierBox();
      expect(window.ModifierBox.hide).toHaveBeenCalled();
    });

    test('should log when the module is not loaded', () => {
      ModifierBoxManager.hideModifierBox();
      expect(console.log).toHaveBeenCalledWith('ModifierBox module not loaded');
    });
  });
});
