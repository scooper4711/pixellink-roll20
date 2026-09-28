/**
 * PixelsCommand Module Tests
 *
 * Tests for /pixels chat command interception, physical dice prompt
 * lifecycle, die substitution, explosions/rerolls, and roll queries.
 */

describe('PixelsCommand', () => {
  let PixelsCommand;

  beforeEach(() => {
    jest.resetModules();
    document.head.innerHTML = '';
    // Swap in a fresh body so MutationObservers from previous tests
    // (which watch the old body node) cannot fire on this test's DOM.
    document.documentElement.replaceChild(document.createElement('body'), document.body);

    window.postChatMessage = jest.fn();
    window.sendTextToExtension = jest.fn();
    window.pixelsAllowDiceSubstitution = false;

    PixelsCommand = require('../../src/content/modules/PixelsCommand.js').default;
  });

  afterEach(async () => {
    // Disconnect any chat observer left running so queued MutationObserver
    // callbacks can't fire after teardown (when `document` is gone).
    try {
      PixelsCommand?.teardownChatInterception?.();
    } catch {
      // ignore teardown errors
    }
    // Flush pending MutationObserver microtasks while `document` is valid.
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  function slotCount() {
    return document.querySelectorAll('.pixels-cmd-slot').length;
  }

  function postedMessage() {
    return window.postChatMessage.mock.calls.map(call => call[0]).join('\n');
  }

  describe('interceptFormula validation', () => {
    test('should reject empty formulas', () => {
      expect(PixelsCommand.interceptFormula('')).toBe(false);
      expect(PixelsCommand.interceptFormula('   ')).toBe(false);
      expect(PixelsCommand.isPromptActive()).toBe(false);
    });

    test('should reject invalid formulas with a chat message', () => {
      expect(PixelsCommand.interceptFormula('hello')).toBe(false);
      expect(postedMessage()).toContain('Invalid dice formula: hello');
      expect(PixelsCommand.isPromptActive()).toBe(false);
    });

    test('should reject diceless expressions with a chat message', () => {
      expect(PixelsCommand.interceptFormula('3+4')).toBe(false);
      expect(postedMessage()).toContain('No dice found in formula: 3+4');
    });

    test('should start a prompt for valid formulas', () => {
      expect(PixelsCommand.interceptFormula('2d6')).toBe(true);
      expect(PixelsCommand.isPromptActive()).toBe(true);
      expect(slotCount()).toBe(2);
    });
  });

  describe('offerRoll', () => {
    test('should return false with no active prompt', () => {
      expect(PixelsCommand.offerRoll(6, 4)).toBe(false);
    });

    test('should fill matching slots and complete the prompt', () => {
      PixelsCommand.interceptFormula('2d6');
      expect(PixelsCommand.offerRoll(6, 4)).toBe(true);
      expect(PixelsCommand.isPromptActive()).toBe(true);
      expect(PixelsCommand.offerRoll(6, 2)).toBe(true);
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(postedMessage()).toContain('Pixels Dice');
      expect(postedMessage()).toContain('[[6]]');
    });

    test('should shake on unmatched dice without consuming the prompt', () => {
      PixelsCommand.interceptFormula('1d6');
      expect(PixelsCommand.offerRoll(20, 5)).toBe(true);
      expect(PixelsCommand.isPromptActive()).toBe(true);
      expect(window.postChatMessage).not.toHaveBeenCalled();
      expect(document.querySelector('#pixels-command-overlay').classList.contains('shake')).toBe(true);
    });
  });

  describe('cancelPrompt', () => {
    test('should deactivate the prompt and hide the overlay', () => {
      PixelsCommand.interceptFormula('2d6');
      expect(PixelsCommand.isPromptActive()).toBe(true);
      PixelsCommand.cancelPrompt();
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(document.querySelector('#pixels-command-overlay').style.display).toBe('none');
    });
  });

  describe('exploding dice', () => {
    test('should add an explosion slot on max rolls', () => {
      PixelsCommand.interceptFormula('1d6!');
      expect(slotCount()).toBe(1);
      PixelsCommand.offerRoll(6, 6);
      expect(slotCount()).toBe(2);
      expect(PixelsCommand.isPromptActive()).toBe(true);
      PixelsCommand.offerRoll(6, 2);
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(window.postChatMessage).toHaveBeenCalled();
    });
  });

  describe('rerolling dice', () => {
    test('should clear and refill rerolled slots', () => {
      PixelsCommand.interceptFormula('1d20r1');
      PixelsCommand.offerRoll(20, 1);
      expect(PixelsCommand.isPromptActive()).toBe(true);
      expect(window.postChatMessage).not.toHaveBeenCalled();
      PixelsCommand.offerRoll(20, 15);
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(postedMessage()).toContain('[[15]]');
    });
  });

  describe('die substitution', () => {
    test('should substitute a larger die when enabled', () => {
      window.pixelsAllowDiceSubstitution = true;
      PixelsCommand.interceptFormula('1d4');
      PixelsCommand.offerRoll(8, 3);
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(postedMessage()).toContain('1d4');
    });

    test('should not substitute when disabled', () => {
      PixelsCommand.interceptFormula('1d4');
      PixelsCommand.offerRoll(8, 3);
      expect(PixelsCommand.isPromptActive()).toBe(true);
      expect(window.postChatMessage).not.toHaveBeenCalled();
    });
  });

  describe('percentile dice', () => {
    test('should treat a d100 roll as a d10', () => {
      PixelsCommand.interceptFormula('1d10');
      PixelsCommand.offerRoll(100, 70);
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(postedMessage()).toContain('[[7]]');
    });
  });

  describe('success counting', () => {
    test('should report successes for target formulas', () => {
      PixelsCommand.interceptFormula('2d6>4');
      PixelsCommand.offerRoll(6, 6);
      PixelsCommand.offerRoll(6, 2);
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(postedMessage()).toContain('success');
    });
  });

  describe('keep highest', () => {
    test('should prompt for every die in 4d6kh3', () => {
      PixelsCommand.interceptFormula('4d6kh3');
      expect(slotCount()).toBe(4);
      PixelsCommand.offerRoll(6, 4);
      PixelsCommand.offerRoll(6, 3);
      PixelsCommand.offerRoll(6, 5);
      PixelsCommand.offerRoll(6, 2);
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(window.postChatMessage).toHaveBeenCalled();
    });
  });

  describe('group rolls', () => {
    test('should prompt for every die in {4d6}', () => {
      expect(PixelsCommand.interceptFormula('{4d6}')).toBe(true);
      expect(slotCount()).toBe(4);
      PixelsCommand.offerRoll(6, 1);
      PixelsCommand.offerRoll(6, 2);
      PixelsCommand.offerRoll(6, 3);
      PixelsCommand.offerRoll(6, 4);
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(window.postChatMessage).toHaveBeenCalled();
    });
  });

  describe('roll queries', () => {
    test('should resolve text queries through the modal', () => {
      expect(PixelsCommand.interceptFormula('2d6+?{Modifier|0}')).toBe(true);
      expect(PixelsCommand.isPromptActive()).toBe(false);

      const modal = document.querySelector('#pixels-query-modal');
      expect(modal.style.display).toBe('block');

      const input = document.querySelector('#pixels-query-input-0');
      input.value = '5';
      document.querySelector('.pixels-query-submit').click();

      expect(PixelsCommand.isPromptActive()).toBe(true);
      PixelsCommand.offerRoll(6, 3);
      PixelsCommand.offerRoll(6, 4);
      expect(postedMessage()).toContain('2d6+5');
    });

    test('should render dropdowns for queries with options', () => {
      PixelsCommand.interceptFormula('1d20+?{Level|1|2|3}');
      const select = document.querySelector('#pixels-query-input-0');
      expect(select.tagName).toBe('SELECT');
      expect(select.querySelectorAll('option')).toHaveLength(3);
      document.querySelector('.pixels-query-submit').click();
      expect(PixelsCommand.isPromptActive()).toBe(true);
    });

    test('should resolve queries without defaults', () => {
      expect(PixelsCommand.interceptFormula('2d6+?{Bonus}')).toBe(true);
      const input = document.querySelector('#pixels-query-input-0');
      expect(input.value).toBe('');
      input.value = '2';
      document.querySelector('.pixels-query-submit').click();
      expect(PixelsCommand.isPromptActive()).toBe(true);
    });

    test('should submit the modal on Enter', () => {
      PixelsCommand.interceptFormula('1d20+?{Modifier|0}');
      const fields = document.querySelector('.pixels-query-fields');
      fields.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(PixelsCommand.isPromptActive()).toBe(true);
    });
    test('should cancel the query modal without starting a prompt', () => {
      PixelsCommand.interceptFormula('2d6+?{Modifier|0}');
      document.querySelector('.pixels-query-cancel').click();
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(document.querySelector('#pixels-query-modal').style.display).toBe('none');
    });
  });

  describe('chat interception', () => {
    function addChatInput() {
      document.body.innerHTML = '<div id="textchat-input"><textarea></textarea><button>Send</button></div>';
      PixelsCommand.setupChatInterception();
      return document.querySelector('#textchat-input textarea');
    }

    function pressEnter(textarea) {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }

    test('should start a prompt from a /pixels chat command', () => {
      const textarea = addChatInput();
      textarea.value = '/pixels 2d6';
      pressEnter(textarea);
      expect(textarea.value).toBe('');
      expect(PixelsCommand.isPromptActive()).toBe(true);
    });

    test('should whisper for /gmpixels commands', () => {
      const textarea = addChatInput();
      textarea.value = '/gmpixels 1d20';
      pressEnter(textarea);
      PixelsCommand.offerRoll(20, 12);
      expect(postedMessage()).toContain('/w gm');
    });

    test('should post usage for a bare /pixels command', () => {
      const textarea = addChatInput();
      textarea.value = '/pixels';
      pressEnter(textarea);
      expect(postedMessage()).toContain('Usage: /pixels');
      expect(PixelsCommand.isPromptActive()).toBe(false);
    });

    test('should ignore non-command chat text', () => {
      const textarea = addChatInput();
      textarea.value = 'hello everyone';
      pressEnter(textarea);
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(window.postChatMessage).not.toHaveBeenCalled();
    });

    test('should attach to chat input added after setup', async () => {
      PixelsCommand.setupChatInterception();
      document.body.innerHTML = '<div id="textchat-input"><textarea></textarea><button>Send</button></div>';
      await new Promise(resolve => setTimeout(resolve, 0));
      const textarea = document.querySelector('#textchat-input textarea');
      textarea.value = '/pixels 1d6';
      pressEnter(textarea);
      expect(PixelsCommand.isPromptActive()).toBe(true);
    });

    test('should intercept the send button', () => {
      const textarea = addChatInput();
      textarea.value = '/pixels 1d6';
      document.querySelector('#textchat-input button').click();
      expect(PixelsCommand.isPromptActive()).toBe(true);
    });

    test('should resolve roll queries from chat', () => {
      const textarea = addChatInput();
      textarea.value = '/pixels 2d6+?{Modifier|0}';
      pressEnter(textarea);
      expect(PixelsCommand.isPromptActive()).toBe(false);
      expect(document.querySelector('#pixels-query-modal').style.display).toBe('block');
      document.querySelector('#pixels-query-input-0').value = '3';
      document.querySelector('.pixels-query-submit').click();
      expect(PixelsCommand.isPromptActive()).toBe(true);
    });

    test('should report invalid formulas from chat', () => {
      const textarea = addChatInput();
      textarea.value = '/pixels hello';
      pressEnter(textarea);
      expect(postedMessage()).toContain('Invalid dice formula: hello');
      expect(PixelsCommand.isPromptActive()).toBe(false);
    });

    test('should report diceless formulas from chat', () => {
      const textarea = addChatInput();
      textarea.value = '/pixels 3+4';
      pressEnter(textarea);
      expect(postedMessage()).toContain('No dice found in formula: 3+4');
      expect(PixelsCommand.isPromptActive()).toBe(false);
    });
    test('should ignore shift+enter line breaks', () => {
      const textarea = addChatInput();
      textarea.value = '/pixels 2d6';
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
      expect(PixelsCommand.isPromptActive()).toBe(false);
    });
  });
});
