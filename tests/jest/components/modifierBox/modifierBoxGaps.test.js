/**
 * @jest-environment jsdom
 */

jest.mock('../../../../src/utils/htmlLoader', () => ({
  __esModule: true,
  loadTemplate: jest.fn(),
}));

const modifierBox = require('../../../../src/components/modifierBox/modifierBox.js');
const htmlLoaderMock = require('../../../../src/utils/htmlLoader.js');

const TEMPLATE = `
  <div id="pixels-modifier-box" class="PIXELS_EXTENSION_BOX_FIND_ME" data-testid="pixels-modifier-box">
    <div class="pixels-header">
      <span class="pixels-title"><img src="{{logoUrl}}" alt="Pixels" class="pixels-logo"> Saved Rolls</span>
      <div class="pixels-controls">
        <button class="add-modifier-btn" type="button">Add</button>
        <button class="clear-all-btn" type="button">Clear All</button>
        <button class="pixels-popout" type="button">⧉</button>
        <button class="pixels-minimize">−</button>
      </div>
    </div>
    <div class="pixels-content">
      <div class="modifier-row">
        <div class="drag-handle">⋮⋮</div>
        <input type="text" class="modifier-name" value="Attack" data-index="0">
        <input type="text" class="formula-input" value="1d20" data-index="0">
        <button class="roll-formula-btn" type="button">Roll</button>
        <button class="remove-row-btn" type="button">×</button>
      </div>
    </div>
  </div>
`;

function setWindowDeps(extraRowManager = {}) {
  window.ModifierBoxThemeManager = {
    addStyles: jest.fn(),
    updateTheme: jest.fn(),
    startThemeMonitoring: jest.fn(),
    stopThemeMonitoring: jest.fn(),
    forceThemeRefresh: jest.fn(),
    forceElementUpdates: jest.fn(),
  };
  window.ModifierBoxDragHandler = { setupDragFunctionality: jest.fn() };
  window.ModifierBoxRowManager = {
    setupModifierRowLogic: jest.fn(),
    resetAllRows: jest.fn(),
    ...extraRowManager,
  };
}

describe('ModifierBox gaps', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    localStorage.clear();
    modifierBox.resetState();
    if (typeof htmlLoaderMock.loadTemplate !== 'function' || !htmlLoaderMock.loadTemplate.mockReset) {
      htmlLoaderMock.loadTemplate = jest.fn();
    }
    htmlLoaderMock.loadTemplate.mockReset();
    htmlLoaderMock.loadTemplate.mockRejectedValue(new Error('no template'));
    setWindowDeps();
  });

  test('create via HTML template path', async () => {
    htmlLoaderMock.loadTemplate.mockResolvedValue(TEMPLATE);
    const el = await modifierBox.create();
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.id).toBe('pixels-modifier-box');
    expect(htmlLoaderMock.loadTemplate).toHaveBeenCalledWith('components/modifierBox/modifierBox.html', 'modifierBox');
    // logo placeholder replaced
    expect(el.querySelector('.pixels-logo').src).toContain('logo-128.png');
    expect(document.body.contains(el)).toBe(true);
    expect(modifierBox.isVisible()).toBe(true);
  });

  test('create falls back when loadTemplate is unavailable', async () => {
    htmlLoaderMock.loadTemplate = undefined;
    const el = await modifierBox.create();
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.id).toBe('pixels-modifier-box');
    expect(el.querySelector('.formula-input').value).toBe('1d20');
  });

  test('show logs error when creation fails', async () => {
    delete window.ModifierBoxThemeManager;
    delete window.ModifierBoxDragHandler;
    delete window.ModifierBoxRowManager;
    await modifierBox.show();
    expect(console.error).toHaveBeenCalledWith('Failed to create modifier box');
  });

  test('show re-appends detached box and resets bad position', async () => {
    htmlLoaderMock.loadTemplate.mockResolvedValue(TEMPLATE);
    await modifierBox.show();
    const el = modifierBox.getElement();
    el.remove();
    el.style.top = '0px';
    el.style.left = '0px';
    await modifierBox.show();
    expect(document.body.contains(el)).toBe(true);
    expect(el.style.display).toBe('block');
    expect(el.style.top).toBe('20px');
    expect(el.style.left).toBe('20px');
    expect(modifierBox.isVisible()).toBe(true);
  });

  test('show re-runs theme update via delayed refresh', async () => {
    htmlLoaderMock.loadTemplate.mockResolvedValue(TEMPLATE);
    await modifierBox.show();
    // second show hits the existing-box path with setTimeout refresh
    await modifierBox.show();
    window.ModifierBoxThemeManager.updateTheme.mockClear();
    window.ModifierBoxThemeManager.forceElementUpdates.mockClear();
    await modifierBox.show();
    await new Promise(r => setTimeout(r, 150));
    expect(window.ModifierBoxThemeManager.updateTheme).toHaveBeenCalled();
    expect(window.ModifierBoxThemeManager.forceElementUpdates).toHaveBeenCalled();
  });

  test('updateTheme and forceThemeRefresh fall back to module functions', async () => {
    await modifierBox.show();
    delete window.ModifierBoxThemeManager;
    expect(() => modifierBox.updateTheme()).not.toThrow();
    expect(() => modifierBox.forceThemeRefresh()).not.toThrow();
    // no-ops without element
    modifierBox.resetState();
    expect(() => modifierBox.updateTheme()).not.toThrow();
    expect(() => modifierBox.forceThemeRefresh()).not.toThrow();
  });

  test('clearAll resets rows via RowManager', async () => {
    await modifierBox.show();
    modifierBox.clearAll();
    expect(window.ModifierBoxRowManager.resetAllRows).toHaveBeenCalled();
  });

  test('clearAll logs error without element', () => {
    modifierBox.clearAll();
    expect(console.error).toHaveBeenCalledWith('Cannot clear saved rolls - modifierBox is null');
  });

  test('clearAll logs error when RowManager unavailable', async () => {
    await modifierBox.show();
    setWindowDeps({ resetAllRows: undefined });
    modifierBox.clearAll();
    expect(console.error).toHaveBeenCalledWith('ModifierBoxRowManager.resetAllRows not available');
  });
});
