/**
 * @jest-environment jsdom
 */

const stateManager = require('../../../../src/components/modifierBox/stateManager.js');

describe('State Manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    stateManager.resetState();
  });

  test('initial state: null element, not visible/created, initialized', () => {
    expect(stateManager.getModifierBoxElement()).toBeNull();
    expect(stateManager.isModifierBoxVisible()).toBe(false);
    expect(stateManager.isModifierBoxCreated()).toBe(false);
    expect(stateManager.isModifierBoxInitialized()).toBe(true);
  });

  test('set/get element, visible, created coerce with Boolean()', () => {
    const el = document.createElement('div');
    el.id = 'pixels-modifier-box';
    expect(stateManager.setModifierBoxElement(el)).toBe(el);
    expect(stateManager.getModifierBoxElement()).toBe(el);
    expect(stateManager.setModifierBoxVisible(true)).toBe(true);
    expect(stateManager.setModifierBoxVisible(0)).toBe(false);
    expect(stateManager.setModifierBoxCreated(1)).toBe(true);
    expect(stateManager.setModifierBoxCreated(null)).toBe(false);
    expect(stateManager.setModifierBoxElement(null)).toBeNull();
  });

  test('findExistingModifierBox adopts visible box', () => {
    const box = document.createElement('div');
    box.id = 'pixels-modifier-box';
    box.style.display = 'block';
    document.body.appendChild(box);
    const found = stateManager.findExistingModifierBox();
    expect(found).toBe(box);
    expect(stateManager.getModifierBoxElement()).toBe(box);
    expect(stateManager.isModifierBoxVisible()).toBe(true);
  });

  test('findExistingModifierBox marks display:none as hidden', () => {
    const box = document.createElement('div');
    box.id = 'pixels-modifier-box';
    box.style.display = 'none';
    document.body.appendChild(box);
    stateManager.findExistingModifierBox();
    expect(stateManager.isModifierBoxVisible()).toBe(false);
  });

  test('findExistingModifierBox returns null when absent', () => {
    expect(stateManager.findExistingModifierBox()).toBeNull();
  });

  test('resetState removes element and legacy-class boxes', () => {
    const box = document.createElement('div');
    box.id = 'pixels-modifier-box';
    document.body.appendChild(box);
    stateManager.setModifierBoxElement(box);
    stateManager.setModifierBoxVisible(true);
    stateManager.setModifierBoxCreated(true);
    const legacy = document.createElement('div');
    legacy.className = 'PIXELS_EXTENSION_BOX_FIND_ME';
    document.body.appendChild(legacy);
    stateManager.resetState();
    expect(document.body.contains(box)).toBe(false);
    expect(document.body.contains(legacy)).toBe(false);
    expect(stateManager.getModifierBoxElement()).toBeNull();
    expect(stateManager.isModifierBoxVisible()).toBe(false);
    expect(stateManager.isModifierBoxCreated()).toBe(false);
    expect(stateManager.getStateSummary()).toEqual({
      hasElement: false,
      isVisible: false,
      isCreated: false,
      isInitialized: true,
      elementId: null,
      elementInDOM: false,
    });
  });

  test('updateLegacyDefaults migrates None/D20 to Attack', () => {
    const box = document.createElement('div');
    box.innerHTML = '<input class="modifier-name" value="None">';
    stateManager.updateLegacyDefaults(box);
    expect(box.querySelector('.modifier-name').value).toBe('Attack');
    expect(box.querySelector('.modifier-name').placeholder).toBe('Name');

    box.innerHTML = '<input class="modifier-name" value="D20">';
    stateManager.updateLegacyDefaults(box);
    expect(box.querySelector('.modifier-name').value).toBe('Attack');
  });

  test('updateLegacyDefaults leaves other names and handles nulls', () => {
    const box = document.createElement('div');
    box.innerHTML = '<input class="modifier-name" value="Fireball">';
    stateManager.updateLegacyDefaults(box);
    expect(box.querySelector('.modifier-name').value).toBe('Fireball');
    expect(() => stateManager.updateLegacyDefaults(null)).not.toThrow();
    const empty = document.createElement('div');
    expect(() => stateManager.updateLegacyDefaults(empty)).not.toThrow();
  });

  test('ensureModifierBoxInDOM appends detached box and shows it', () => {
    const box = document.createElement('div');
    box.style.display = 'none';
    expect(stateManager.ensureModifierBoxInDOM(box)).toBe(true);
    expect(document.body.contains(box)).toBe(true);
    expect(box.style.display).toBe('block');
    expect(stateManager.isModifierBoxVisible()).toBe(true);
    // already in DOM path
    expect(stateManager.ensureModifierBoxInDOM(box)).toBe(true);
    expect(stateManager.ensureModifierBoxInDOM(null)).toBe(false);
  });

  test('validatePosition resets out-of-bounds positions', () => {
    const box = document.createElement('div');
    box.style.top = '0px';
    box.style.left = '0px';
    document.body.appendChild(box);
    stateManager.validatePosition(box);
    expect(box.style.top).toBe('20px');
    expect(box.style.left).toBe('20px');
    // (jsdom normalizes right/bottom:auto away; lines still executed)

    // in-bounds keeps position
    box.style.top = '50px';
    box.style.left = '50px';
    stateManager.validatePosition(box);
    expect(box.style.top).toBe('50px');

    // off-screen right/bottom resets
    box.style.left = `${window.innerWidth + 1000}px`;
    stateManager.validatePosition(box);
    expect(box.style.left).toBe('20px');

    expect(() => stateManager.validatePosition(null)).not.toThrow();
  });

  test('getStateSummary reflects live state', () => {
    const box = document.createElement('div');
    box.id = 'pixels-modifier-box';
    document.body.appendChild(box);
    stateManager.setModifierBoxElement(box);
    stateManager.setModifierBoxVisible(true);
    stateManager.setModifierBoxCreated(true);
    const summary = stateManager.getStateSummary();
    expect(summary).toEqual({
      hasElement: true,
      isVisible: true,
      isCreated: true,
      isInitialized: true,
      elementId: 'pixels-modifier-box',
      elementInDOM: true,
    });
    // detached element reports elementInDOM false
    box.remove();
    expect(stateManager.getStateSummary().elementInDOM).toBe(false);
  });

  test('default export and window global expose all functions', () => {
    expect(stateManager.default.getModifierBoxElement).toBeInstanceOf(Function);
    expect(window.ModifierBoxStateManager).toBeDefined();
    expect(window.ModifierBoxStateManager.resetState).toBeInstanceOf(Function);
  });
});
