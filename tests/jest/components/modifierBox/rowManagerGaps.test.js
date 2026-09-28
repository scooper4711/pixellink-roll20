/**
 * @jest-environment jsdom
 */

const rowManager = require('../../../../src/components/modifierBox/rowManager.js');
// Capture the import-time window literal before setup.js resetMocks deletes it.
const importTimeRowManager = window.ModifierBoxRowManager;

function createBox() {
  const box = document.createElement('div');
  box.id = 'pixels-modifier-box';
  box.innerHTML = `
    <div class="pixels-header">
      <div class="pixels-controls"><button class="add-modifier-btn" type="button">Add</button></div>
    </div>
    <div class="pixels-content">
      <div class="modifier-row">
        <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
        <input type="text" class="modifier-name" placeholder="Name" value="Attack" data-index="0">
        <input type="text" class="formula-input" placeholder="e.g. 2d6+3" value="1d20" data-index="0">
        <button class="roll-formula-btn" type="button" title="Roll this formula">Roll</button>
        <button class="remove-row-btn" type="button">×</button>
      </div>
    </div>
  `;
  document.body.appendChild(box);
  return box;
}

describe('Row Manager gaps', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.PixelsCommand;
    delete window.ModifierBoxThemeManager;
    if (rowManager.resetState) rowManager.resetState();
    // Restore the import-time window literal (setup.js deletes it). Using the
    // literal (not .default) exercises its get/setRowCounter arrows.
    window.ModifierBoxRowManager = importTimeRowManager;
    window.ModifierBoxThemeManager = { forceElementUpdates: jest.fn() };
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('migrateRowData keeps existing formula strings in unversioned data', () => {
    const box = createBox();
    const result = window.ModifierBoxRowManager.applyRows(box, {
      rows: [{ name: 'Kept', formula: '2d6' }],
    });
    expect(result).toBe(true);
    expect(box.querySelector('.formula-input').value).toBe('2d6');
  });

  test('executeFormula logs error without PixelsCommand', () => {
    window.ModifierBoxRowManager.executeFormula('1d20');
    expect(console.error).toHaveBeenCalledWith(
      'PixelsCommand.interceptFormula not available. Is the content script loaded?'
    );
    window.PixelsCommand = {};
    window.ModifierBoxRowManager.executeFormula('1d20');
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  test('setRowCounter/getRowCounter via window and named exports', () => {
    window.ModifierBoxRowManager.setRowCounter(7);
    expect(window.ModifierBoxRowManager.getRowCounter()).toBe(7);
    rowManager.setRowCounter(3);
    expect(rowManager.getRowCounter()).toBe(3);
  });

  test('add button click adds a row', () => {
    const box = createBox();
    window.ModifierBoxRowManager.setupModifierRowLogic(box);
    box.querySelector('.add-modifier-btn').click();
    expect(box.querySelectorAll('.modifier-row').length).toBe(2);
  });

  test('addFormulaRow falls back to module forceElementUpdates', () => {
    delete window.ModifierBoxThemeManager;
    const box = createBox();
    window.ModifierBoxRowManager.addModifierRow(box);
    expect(box.querySelectorAll('.modifier-row').length).toBe(2);
  });

  test('updateEventListeners logs error for null box', () => {
    window.ModifierBoxRowManager.updateEventListeners(null);
    expect(console.error).toHaveBeenCalledWith('updateEventListeners: modifierBox is required');
  });

  test('input events persist rows', () => {
    const box = createBox();
    window.ModifierBoxRowManager.updateEventListeners(box);
    localStorage.clear();
    box.querySelector('.modifier-name').dispatchEvent(new Event('input', { bubbles: true }));
    expect(localStorage.getItem('pixels_saved_rolls')).toBeTruthy();
    localStorage.clear();
    box.querySelector('.formula-input').dispatchEvent(new Event('input', { bubbles: true }));
    expect(localStorage.getItem('pixels_saved_rolls')).toBeTruthy();
  });

  test('Enter key in formula input executes formula', () => {
    const box = createBox();
    window.PixelsCommand = { interceptFormula: jest.fn() };
    window.ModifierBoxRowManager.updateEventListeners(box);
    const input = box.querySelector('.formula-input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(window.PixelsCommand.interceptFormula).toHaveBeenCalledWith('1d20', 'Attack');
    // non-Enter key does nothing
    window.PixelsCommand.interceptFormula.mockClear();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(window.PixelsCommand.interceptFormula).not.toHaveBeenCalled();
  });

  test('roll button executes formula', () => {
    const box = createBox();
    window.PixelsCommand = { interceptFormula: jest.fn() };
    window.ModifierBoxRowManager.updateEventListeners(box);
    box.querySelector('.roll-formula-btn').click();
    expect(window.PixelsCommand.interceptFormula).toHaveBeenCalledWith('1d20', 'Attack');
  });

  test('roll button with empty formula flashes invalid and clears', () => {
    jest.useFakeTimers();
    const box = createBox();
    window.ModifierBoxRowManager.updateEventListeners(box);
    const input = box.querySelector('.formula-input');
    input.value = '';
    box.querySelector('.roll-formula-btn').click();
    expect(input.classList.contains('formula-invalid')).toBe(true);
    jest.runAllTimers();
    expect(input.classList.contains('formula-invalid')).toBe(false);
  });

  test('remove button click removes row', () => {
    const box = createBox();
    window.ModifierBoxRowManager.addModifierRow(box);
    expect(box.querySelectorAll('.modifier-row').length).toBe(2);
    window.ModifierBoxRowManager.updateEventListeners(box);
    box.querySelectorAll('.remove-row-btn')[1].click();
    expect(box.querySelectorAll('.modifier-row').length).toBe(1);
  });

  test('serializeRows skips rows missing inputs', () => {
    const box = createBox();
    const empty = document.createElement('div');
    empty.className = 'modifier-row';
    box.querySelector('.pixels-content').appendChild(empty);
    const data = window.ModifierBoxRowManager.serializeRows(box);
    expect(data.rows).toEqual([{ name: 'Attack', formula: '1d20' }]);
  });

  test('saveModifierRows handles null and storage errors', () => {
    expect(() => window.ModifierBoxRowManager.saveModifierRows(null)).not.toThrow();
    const box = createBox();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    window.ModifierBoxRowManager.saveModifierRows(box);
    expect(console.error).toHaveBeenCalledWith('Error saving formula rows:', expect.any(Error));
    Storage.prototype.setItem.mockRestore();
  });

  test('applyRows returns false without content area', () => {
    const box = document.createElement('div');
    expect(window.ModifierBoxRowManager.applyRows(box, { rows: [{ name: 'A', formula: '1d20' }], version: 2 })).toBe(
      false
    );
  });

  test('applyRows falls back to module forceElementUpdates', () => {
    delete window.ModifierBoxThemeManager;
    const box = createBox();
    expect(window.ModifierBoxRowManager.applyRows(box, { rows: [{ name: 'A', formula: '1d20' }], version: 2 })).toBe(
      true
    );
  });

  test('loadModifierRows returns false for null box', () => {
    expect(window.ModifierBoxRowManager.loadModifierRows(null)).toBe(false);
  });

  test('loadModifierRows returns false when nothing stored', () => {
    expect(window.ModifierBoxRowManager.loadModifierRows(createBox())).toBe(false);
  });

  test('loadModifierRows returns false for non-array rows', () => {
    localStorage.setItem('pixels_saved_rolls', JSON.stringify({ rows: 'nope', version: 2 }));
    expect(window.ModifierBoxRowManager.loadModifierRows(createBox())).toBe(false);
  });

  test('loadModifierRows returns false on corrupt JSON', () => {
    localStorage.setItem('pixels_saved_rolls', '{not json');
    expect(window.ModifierBoxRowManager.loadModifierRows(createBox())).toBe(false);
    expect(console.error).toHaveBeenCalledWith('Error loading formula rows:', expect.any(Error));
  });

  test('applyProfileRows persists on success, false on bad data', () => {
    const box = createBox();
    expect(
      window.ModifierBoxRowManager.applyProfileRows(box, {
        rows: [{ name: 'P', formula: '3d6' }],
        version: 2,
      })
    ).toBe(true);
    expect(JSON.parse(localStorage.getItem('pixels_saved_rolls')).rows).toEqual([{ name: 'P', formula: '3d6' }]);
    expect(window.ModifierBoxRowManager.applyProfileRows(box, null)).toBe(false);
  });

  test('clearStoredModifierRows handles storage errors', () => {
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    window.ModifierBoxRowManager.clearStoredModifierRows();
    expect(console.error).toHaveBeenCalledWith('Error clearing stored rows:', expect.any(Error));
    Storage.prototype.removeItem.mockRestore();
  });

  test('resetAllRows logs error without content area', () => {
    window.ModifierBoxRowManager.resetAllRows(document.createElement('div'));
    expect(console.error).toHaveBeenCalledWith('resetAllRows: content area not found');
  });

  test('escapeHtml neutralizes markup in names', () => {
    const box = createBox();
    window.ModifierBoxRowManager.applyRows(box, {
      rows: [{ name: '<img src=x onerror=1>', formula: '1d20' }],
      version: 2,
    });
    const input = box.querySelector('.modifier-name');
    expect(input.value).toBe('<img src=x onerror=1>');
    expect(box.querySelector('img:not(.pixels-logo)')).toBeNull();
  });
});
