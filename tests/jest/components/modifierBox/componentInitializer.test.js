/**
 * @jest-environment jsdom
 */

jest.mock('../../../../src/components/modifierBox/themeManager', () => ({
  __esModule: true,
  addStyles: jest.fn(),
  updateTheme: jest.fn(),
  startThemeMonitoring: jest.fn(),
  stopThemeMonitoring: jest.fn(),
  forceElementUpdates: jest.fn(),
  forceThemeRefresh: jest.fn(),
}));

const initializer = require('../../../../src/components/modifierBox/componentInitializer.js');
const themeMock = require('../../../../src/components/modifierBox/themeManager.js');

function createFullBox() {
  const box = document.createElement('div');
  box.id = 'pixels-modifier-box';
  box.innerHTML = `
    <div class="pixels-header">
      <div class="pixels-controls">
        <button class="pixels-minimize" title="Minimize">−</button>
        <button class="clear-all-btn" type="button">Clear All</button>
        <button class="pixels-popout" type="button">⧉</button>
      </div>
    </div>
    <div class="pixels-content">
      <div class="modifier-row">
        <input type="text" class="modifier-name" value="Attack">
        <input type="text" class="formula-input" value="1d20">
      </div>
    </div>
  `;
  document.body.appendChild(box);
  return box;
}

function setWindowMocks() {
  window.ModifierBoxThemeManager = {
    addStyles: jest.fn(),
    updateTheme: jest.fn(),
    startThemeMonitoring: jest.fn(),
    stopThemeMonitoring: jest.fn(),
    forceElementUpdates: jest.fn(),
  };
  window.ModifierBoxDragHandler = { setupDragFunctionality: jest.fn() };
  window.ModifierBoxRowManager = {
    setupModifierRowLogic: jest.fn(),
    loadModifierRows: jest.fn(),
  };
}

describe('Component Initializer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    localStorage.clear();
    delete window.ModifierBoxThemeManager;
    delete window.ModifierBoxDragHandler;
    delete window.ModifierBoxRowManager;
    delete window.RowDragDrop;
    delete window.addDragHandle;
    delete window.modifierRowDragDrop;
    jest.clearAllMocks();
  });

  test('returns false for null box', () => {
    expect(initializer.setupModifierBoxComponents(null, jest.fn())).toBe(false);
    expect(console.error).toHaveBeenCalledWith('setupModifierBoxComponents: modifierBox is null');
  });

  test('returns true immediately when already set up', () => {
    const box = createFullBox();
    box.dataset.componentsSetup = 'true';
    expect(initializer.setupModifierBoxComponents(box, jest.fn())).toBe(true);
  });

  test('happy path via window globals', () => {
    setWindowMocks();
    const box = createFullBox();
    const cb = jest.fn();
    expect(initializer.setupModifierBoxComponents(box, cb)).toBe(true);
    expect(box.dataset.componentsSetup).toBe('true');

    expect(window.ModifierBoxThemeManager.addStyles).toHaveBeenCalled();
    expect(window.ModifierBoxDragHandler.setupDragFunctionality).toHaveBeenCalledWith(box);
    expect(window.ModifierBoxRowManager.setupModifierRowLogic).toHaveBeenCalledWith(box);
    expect(window.ModifierBoxRowManager.loadModifierRows).toHaveBeenCalledWith(box);
    expect(window.ModifierBoxThemeManager.startThemeMonitoring).toHaveBeenCalled();
    expect(window.ModifierBoxThemeManager.updateTheme).toHaveBeenCalledWith(box);
    // module-level fallbacks not used
    expect(themeMock.addStyles).not.toHaveBeenCalled();

    // positioning applied
    expect(box.style.top).toBe('20px');
    expect(box.style.left).toBe('60px');

    // minimize + clear-all wired through real uiControls
    box.querySelector('.pixels-minimize').click();
    expect(box.classList.contains('minimized')).toBe(true);
    box.querySelector('.clear-all-btn').click();
  });

  test('window theme-monitoring callback updates theme', () => {
    setWindowMocks();
    const box = createFullBox();
    initializer.setupModifierBoxComponents(box, jest.fn());
    const cb = window.ModifierBoxThemeManager.startThemeMonitoring.mock.calls[0][0];
    window.ModifierBoxThemeManager.updateTheme.mockClear();
    cb('dark', {});
    expect(window.ModifierBoxThemeManager.updateTheme).toHaveBeenCalledWith(box);
  });

  test('happy path via module functions when window globals absent', async () => {
    const box = createFullBox();
    expect(initializer.setupModifierBoxComponents(box, jest.fn())).toBe(true);
    expect(themeMock.addStyles).toHaveBeenCalled();
    expect(themeMock.startThemeMonitoring).toHaveBeenCalled();
    expect(themeMock.updateTheme).toHaveBeenCalledWith(box);
    // real drag/row wiring ran without throwing
    expect(box.querySelector('.pixels-resize-handle')).toBeTruthy();
    await Promise.resolve();
  });

  test('module theme-monitoring callback updates theme', () => {
    const box = createFullBox();
    initializer.setupModifierBoxComponents(box, jest.fn());
    const cb = themeMock.startThemeMonitoring.mock.calls[0][0];
    themeMock.updateTheme.mockClear();
    cb('light', {});
    expect(themeMock.updateTheme).toHaveBeenCalledWith(box);
  });

  test('skips clear-all setup when callback missing', () => {
    setWindowMocks();
    const box = createFullBox();
    expect(initializer.setupModifierBoxComponents(box, undefined)).toBe(true);
  });

  test('setupStyles catches throwing window theme manager', () => {
    setWindowMocks();
    window.ModifierBoxThemeManager.addStyles.mockImplementation(() => {
      throw new Error('styles boom');
    });
    expect(initializer.setupModifierBoxComponents(createFullBox(), jest.fn())).toBe(true);
    expect(console.error).toHaveBeenCalledWith('Error adding styles:', expect.any(Error));
  });

  test('setupDragHandling catches throwing window drag handler', () => {
    setWindowMocks();
    window.ModifierBoxDragHandler.setupDragFunctionality.mockImplementation(() => {
      throw new Error('drag boom');
    });
    expect(initializer.setupModifierBoxComponents(createFullBox(), jest.fn())).toBe(true);
    expect(console.error).toHaveBeenCalledWith('Error setting up drag functionality:', expect.any(Error));
  });

  test('setupRowManagement catches row logic and load errors', () => {
    setWindowMocks();
    window.ModifierBoxRowManager.setupModifierRowLogic.mockImplementation(() => {
      throw new Error('row boom');
    });
    window.ModifierBoxRowManager.loadModifierRows.mockImplementation(() => {
      throw new Error('load boom');
    });
    expect(initializer.setupModifierBoxComponents(createFullBox(), jest.fn())).toBe(true);
    expect(console.error).toHaveBeenCalledWith('Error setting up row logic:', expect.any(Error));
    expect(console.error).toHaveBeenCalledWith('Error loading saved rows:', expect.any(Error));
  });

  test('setupThemeManagement catches monitoring and initial-theme errors', () => {
    setWindowMocks();
    window.ModifierBoxThemeManager.startThemeMonitoring.mockImplementation(() => {
      throw new Error('monitor boom');
    });
    window.ModifierBoxThemeManager.updateTheme.mockImplementation(() => {
      throw new Error('theme boom');
    });
    expect(initializer.setupModifierBoxComponents(createFullBox(), jest.fn())).toBe(true);
    expect(console.error).toHaveBeenCalledWith('Error starting theme monitoring:', expect.any(Error));
    expect(console.error).toHaveBeenCalledWith('Error applying initial theme:', expect.any(Error));
  });

  test('outer catch returns false when drag-and-drop setup throws', () => {
    setWindowMocks();
    window.RowDragDrop = jest.fn(() => {
      throw new Error('dnd boom');
    });
    expect(initializer.setupModifierBoxComponents(createFullBox(), jest.fn())).toBe(false);
    expect(console.error).toHaveBeenCalledWith('Error during component setup:', expect.any(Error));
    delete window.RowDragDrop;
  });

  test('setupDragAndDrop wires rows via RowDragDrop and addDragHandle', () => {
    setWindowMocks();
    const box = createFullBox();
    // add a second row that already has a handle (skipped) and one without
    const content = box.querySelector('.pixels-content');
    const withHandle = document.createElement('div');
    withHandle.className = 'modifier-row';
    withHandle.innerHTML = '<div class="drag-handle"></div>';
    content.appendChild(withHandle);
    window.addDragHandle = jest.fn();
    window.RowDragDrop = jest.fn().mockReturnValue({ destroy: jest.fn() });
    expect(initializer.setupModifierBoxComponents(box, jest.fn())).toBe(true);
    expect(window.addDragHandle).toHaveBeenCalled();
    expect(window.RowDragDrop).toHaveBeenCalledWith(
      '#pixels-modifier-box .pixels-content',
      '.modifier-row',
      window.ModifierBoxRowManager
    );
  });

  test('setupDragAndDrop tolerates missing addDragHandle', () => {
    setWindowMocks();
    window.RowDragDrop = jest.fn().mockReturnValue({});
    expect(initializer.setupModifierBoxComponents(createFullBox(), jest.fn())).toBe(true);
  });

  test('warns when RowDragDrop unavailable', () => {
    setWindowMocks();
    expect(initializer.setupModifierBoxComponents(createFullBox(), jest.fn())).toBe(true);
    expect(console.warn).toHaveBeenCalledWith('RowDragDrop not available - drag and drop disabled');
  });

  test('cleanup handler stops theme monitoring via window global', () => {
    setWindowMocks();
    initializer.setupModifierBoxComponents(createFullBox(), jest.fn());
    window.dispatchEvent(new Event('beforeunload'));
    expect(window.ModifierBoxThemeManager.stopThemeMonitoring).toHaveBeenCalled();
  });

  test('cleanup handler falls back to module stopThemeMonitoring', () => {
    initializer.setupModifierBoxComponents(createFullBox(), jest.fn());
    window.dispatchEvent(new Event('beforeunload'));
    expect(themeMock.stopThemeMonitoring).toHaveBeenCalled();
  });

  describe('checkDependencies', () => {
    test('returns true when all present', () => {
      setWindowMocks();
      expect(initializer.checkDependencies()).toBe(true);
    });

    test('returns false when theme manager missing', () => {
      setWindowMocks();
      delete window.ModifierBoxThemeManager;
      expect(initializer.checkDependencies()).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Required modules not loaded. Make sure all modifier box modules are included.'
      );
    });

    test('returns false when drag handler missing', () => {
      setWindowMocks();
      delete window.ModifierBoxDragHandler;
      expect(initializer.checkDependencies()).toBe(false);
    });

    test('returns false when row manager missing', () => {
      setWindowMocks();
      delete window.ModifierBoxRowManager;
      expect(initializer.checkDependencies()).toBe(false);
    });

    test('returns false when all missing', () => {
      expect(initializer.checkDependencies()).toBe(false);
    });
  });

  test('default export and window global', () => {
    expect(initializer.default.setupModifierBoxComponents).toBeInstanceOf(Function);
    expect(initializer.default.checkDependencies).toBeInstanceOf(Function);
    expect(window.ModifierBoxComponentInitializer).toBeDefined();
  });
});
