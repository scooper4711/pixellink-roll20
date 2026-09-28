/**
 * @jest-environment jsdom
 */

// Coverage for row drag-and-drop (mouse-based, dragDrop.ts) and the legacy
// manager wrapper (dragDropManager.ts). The two modules are coupled:
// dragDropManager imports addDragHandle from dragDrop.

const dragDropModule = require('../../../../src/components/modifierBox/dragDrop.js');
const dragDropManagerModule = require('../../../../src/components/modifierBox/dragDropManager.js');
const themeDetectorModule = require('../../../../src/utils/themeDetector.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dispatchMouseDown(target, x = 10, y = 10) {
  const event = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(event);
  return event;
}

function dispatchMouseMove(x, y) {
  const event = new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  document.dispatchEvent(event);
  return event;
}

function dispatchMouseUp() {
  const event = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

function dispatchTouch(type, target, x, y) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  if (type === 'touchstart' || type === 'touchmove') {
    event.touches = [{ clientX: x, clientY: y }];
  }
  (target || document).dispatchEvent(event);
  return event;
}

function dispatchSelectStart() {
  const event = new Event('selectstart', { bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

function stubRect(el, top, height = 20, width = 200) {
  el.getBoundingClientRect = jest.fn(() => ({
    x: 0,
    y: top,
    left: 0,
    top,
    right: width,
    bottom: top + height,
    width,
    height,
  }));
}

function childIndex(container, el) {
  return Array.from(container.children).indexOf(el);
}

function handleOf(row) {
  return row.querySelector('.drag-handle');
}

// Fixture for createRowDragDrop factories (parameterized selectors so each
// factory instance only reacts to its own DOM and document-level listeners
// from sibling factories stay idle).
function buildRowDragDom({ containerClass, rowClass, rowCount, withBoxId = true }) {
  const wrapper = document.createElement('div');
  if (withBoxId) {
    wrapper.id = 'pixels-modifier-box';
  }
  const container = document.createElement('div');
  container.className = containerClass;
  wrapper.appendChild(container);
  document.body.appendChild(wrapper);
  const rows = [];
  for (let i = 0; i < rowCount; i += 1) {
    const row = document.createElement('div');
    row.className = rowClass;
    row.textContent = `Row ${i}`;
    container.appendChild(row);
    dragDropModule.addDragHandle(row);
    rows.push(row);
  }
  return { wrapper, container, rows };
}

// Fixture for the legacy manager (fixed selectors used by that module).
function buildManagerDom(rowCount = 3) {
  const box = document.createElement('div');
  box.id = 'pixels-modifier-box';
  const content = document.createElement('div');
  content.className = 'pixels-content';
  box.appendChild(content);
  document.body.appendChild(box);
  const rows = [];
  for (let i = 0; i < rowCount; i += 1) {
    const row = document.createElement('div');
    row.className = 'modifier-row';
    row.textContent = `Row ${i}`;
    content.appendChild(row);
    rows.push(row);
  }
  return { box, content, rows };
}

// ---------------------------------------------------------------------------
// dragDrop.ts
// ---------------------------------------------------------------------------

describe('dragDrop (createRowDragDrop)', () => {
  const SEL = {
    full: { containerClass: 'dd-content-a', rowClass: 'dd-row-a' },
    reindexOnly: { containerClass: 'dd-content-b', rowClass: 'dd-row-b' },
    noFns: { containerClass: 'dd-content-c', rowClass: 'dd-row-c' },
    nullManager: { containerClass: 'dd-content-d', rowClass: 'dd-row-d' },
  };

  let fullRowManager;
  let reindexOnlyManager;
  let factoryFull;
  let factoryReindexOnly;
  let factoryNoFns;
  let factoryNullManager;

  beforeAll(() => {
    fullRowManager = { reindexRows: jest.fn(), saveModifierRows: jest.fn() };
    reindexOnlyManager = { reindexRows: jest.fn() };
    factoryFull = dragDropModule.createRowDragDrop(
      `.${SEL.full.containerClass}`,
      `.${SEL.full.rowClass}`,
      fullRowManager
    );
    factoryReindexOnly = dragDropModule.createRowDragDrop(
      `.${SEL.reindexOnly.containerClass}`,
      `.${SEL.reindexOnly.rowClass}`,
      reindexOnlyManager
    );
    factoryNoFns = dragDropModule.createRowDragDrop(`.${SEL.noFns.containerClass}`, `.${SEL.noFns.rowClass}`, {});
    factoryNullManager = dragDropModule.createRowDragDrop(
      `.${SEL.nullManager.containerClass}`,
      `.${SEL.nullManager.rowClass}`,
      null
    );
  });

  // Guarantee the shared factory state machines go idle even if an
  // expectation fails mid-drag.
  afterEach(() => {
    dispatchMouseUp();
  });

  describe('module surface', () => {
    test('exposes factory, alias, handle utilities and legacy globals', () => {
      expect(dragDropModule.createRowDragDrop).toBeInstanceOf(Function);
      expect(dragDropModule.RowDragDrop).toBe(dragDropModule.createRowDragDrop);
      expect(dragDropModule.addDragHandle).toBeInstanceOf(Function);
      expect(dragDropModule.removeDragHandle).toBeInstanceOf(Function);
      expect(window.RowDragDrop).toBe(dragDropModule.createRowDragDrop);
      expect(window.addDragHandle).toBe(dragDropModule.addDragHandle);
      expect(window.removeDragHandle).toBe(dragDropModule.removeDragHandle);
    });

    test('factory returns public API', () => {
      expect(factoryFull.updatePlaceholderTheme).toBeInstanceOf(Function);
      expect(factoryFull.cleanup).toBeInstanceOf(Function);
    });

    test('registers document listeners on creation', () => {
      const addSpy = jest.spyOn(document, 'addEventListener');
      dragDropModule.createRowDragDrop('.dd-tmp-c', '.dd-row-tmp', null);
      expect(addSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('selectstart', expect.any(Function));
      addSpy.mockRestore();
    });
  });

  describe('addDragHandle / removeDragHandle', () => {
    test('adds a handle as the first child with title and grip', () => {
      const row = document.createElement('div');
      row.className = 'dd-row-a';
      row.textContent = 'hello';
      document.body.appendChild(row);

      dragDropModule.addDragHandle(row);

      const handle = handleOf(row);
      expect(handle).toBeTruthy();
      expect(handle.title).toBe('Drag to reorder');
      expect(handle.innerHTML).toBe('⋮⋮');
      expect(row.firstChild).toBe(handle);
    });

    test('does not duplicate an existing handle', () => {
      const row = document.createElement('div');
      document.body.appendChild(row);
      dragDropModule.addDragHandle(row);
      dragDropModule.addDragHandle(row);
      expect(row.querySelectorAll('.drag-handle').length).toBe(1);
    });

    test('works on an empty row', () => {
      const row = document.createElement('div');
      document.body.appendChild(row);
      expect(row.firstChild).toBeNull();
      dragDropModule.addDragHandle(row);
      expect(handleOf(row)).toBeTruthy();
    });

    test('legacy window helpers delegate', () => {
      const row = document.createElement('div');
      document.body.appendChild(row);
      window.addDragHandle(row);
      expect(handleOf(row)).toBeTruthy();
      window.removeDragHandle(row);
      expect(handleOf(row)).toBeNull();
    });

    test('removeDragHandle removes and is a no-op when absent', () => {
      const { rows } = buildRowDragDom({ ...SEL.full, rowCount: 1 });
      dragDropModule.removeDragHandle(rows[0]);
      expect(handleOf(rows[0])).toBeNull();
      expect(() => dragDropModule.removeDragHandle(rows[0])).not.toThrow();
    });
  });

  describe('handleMouseDown', () => {
    test('ignores mousedown with no drag handle', () => {
      const { container } = buildRowDragDom({ ...SEL.full, rowCount: 1 });
      dispatchMouseDown(container, 10, 10);
      expect(document.body.style.cursor).toBe('');
      // A follow-up move must not start a drag.
      dispatchMouseMove(500, 500);
      expect(container.querySelector('.dragging')).toBeNull();
    });

    test('ignores a handle that is not inside a row', () => {
      const { container } = buildRowDragDom({ ...SEL.full, rowCount: 1 });
      const orphan = document.createElement('div');
      orphan.className = 'drag-handle';
      container.appendChild(orphan);
      dispatchMouseDown(orphan, 10, 10);
      expect(document.body.style.cursor).toBe('');
    });

    test('arms a drag, prevents default and sets grabbing cursor', () => {
      const { rows } = buildRowDragDom({ ...SEL.full, rowCount: 2 });
      const event = dispatchMouseDown(handleOf(rows[0]), 10, 10);
      expect(event.defaultPrevented).toBe(true);
      expect(document.body.style.cursor).toBe('grabbing');
    });
  });

  describe('drag threshold and startDrag', () => {
    test('does not start dragging below the movement threshold', () => {
      const { rows } = buildRowDragDom({ ...SEL.full, rowCount: 2 });
      dispatchMouseDown(handleOf(rows[0]), 100, 100);
      dispatchMouseMove(102, 103);
      expect(rows[0].classList.contains('dragging')).toBe(false);
    });

    test('starts dragging past the threshold with visual feedback', () => {
      const { container, rows } = buildRowDragDom({ ...SEL.full, rowCount: 2 });
      const spy = jest.spyOn(themeDetectorModule, 'getThemeColors');
      dispatchMouseDown(handleOf(rows[0]), 100, 100);
      dispatchMouseMove(200, 200);
      expect(rows[0].classList.contains('dragging')).toBe(true);
      expect(rows[0].style.opacity).toBe('0.7');
      // Placeholder is created and themed on first positioned move.
      const placeholder = container.querySelector('.modifier-row-placeholder');
      expect(placeholder).toBeTruthy();
      // Theme integration point: placeholder styling consults theme colors.
      expect(spy).toHaveBeenCalled();
      expect(themeDetectorModule.getThemeColors().primary).toBeTruthy();
      spy.mockRestore();
    });

    test('mousemove with no armed drag is a no-op', () => {
      const { container } = buildRowDragDom({ ...SEL.full, rowCount: 1 });
      expect(() => dispatchMouseMove(300, 300)).not.toThrow();
      expect(container.querySelector('.modifier-row-placeholder')).toBeNull();
    });
  });

  describe('updateDragPosition / reordering', () => {
    test('inserts the placeholder before the row under the cursor', () => {
      const { container, rows } = buildRowDragDom({ ...SEL.full, rowCount: 3 });
      stubRect(rows[0], 0);
      stubRect(rows[1], 30);
      stubRect(rows[2], 60);

      // Drag the last row above the middle row.
      dispatchMouseDown(handleOf(rows[2]), 10, 70);
      dispatchMouseMove(10, 35);

      const placeholder = container.querySelector('.modifier-row-placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder.nextSibling).toBe(rows[1]);

      dispatchMouseUp();
      expect(childIndex(container, rows[0])).toBe(0);
      expect(childIndex(container, rows[2])).toBe(1);
      expect(childIndex(container, rows[1])).toBe(2);
      expect(container.querySelector('.modifier-row-placeholder')).toBeNull();
    });

    test('appends the placeholder at the end when below all rows', () => {
      const { container, rows } = buildRowDragDom({ ...SEL.full, rowCount: 3 });
      stubRect(rows[0], 0);
      stubRect(rows[1], 30);
      stubRect(rows[2], 60);

      dispatchMouseDown(handleOf(rows[0]), 10, 10);
      dispatchMouseMove(10, 500);

      const placeholder = container.querySelector('.modifier-row-placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder.previousSibling).toBe(rows[2]);

      dispatchMouseUp();
      expect(childIndex(container, rows[1])).toBe(0);
      expect(childIndex(container, rows[2])).toBe(1);
      expect(childIndex(container, rows[0])).toBe(2);
    });

    test('single-row container appends placeholder via the empty-list path', () => {
      const { container, rows } = buildRowDragDom({ ...SEL.full, rowCount: 1 });
      stubRect(rows[0], 0);

      dispatchMouseDown(handleOf(rows[0]), 10, 10);
      dispatchMouseMove(10, 200);

      const placeholder = container.querySelector('.modifier-row-placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder.parentNode).toBe(container);

      dispatchMouseUp();
      expect(fullRowManager.reindexRows).toHaveBeenCalledWith(expect.objectContaining({ id: 'pixels-modifier-box' }));
    });

    test('row outside the container never positions the placeholder', () => {
      const wrapper = document.createElement('div');
      wrapper.id = 'pixels-modifier-box';
      const container = document.createElement('div');
      container.className = SEL.full.containerClass;
      wrapper.appendChild(container);
      document.body.appendChild(wrapper);
      const outsider = document.createElement('div');
      outsider.className = SEL.full.rowClass;
      outsider.textContent = 'outsider';
      wrapper.appendChild(outsider);
      dragDropModule.addDragHandle(outsider);

      dispatchMouseDown(handleOf(outsider), 10, 10);
      dispatchMouseMove(300, 300);
      // container is null so updateDragPosition bails out early.
      expect(container.querySelector('.modifier-row-placeholder')).toBeNull();
      expect(outsider.classList.contains('dragging')).toBe(true);

      dispatchMouseUp();
      // completeDrag finds no inserted placeholder and just cleans up.
      expect(outsider.classList.contains('dragging')).toBe(false);
      expect(document.body.style.cursor).toBe('');
    });
  });

  describe('completeDrag / row manager integration', () => {
    test('reindexes and saves through the full row manager', () => {
      const { wrapper, container, rows } = buildRowDragDom({ ...SEL.full, rowCount: 2 });
      stubRect(rows[0], 0);
      stubRect(rows[1], 30);

      dispatchMouseDown(handleOf(rows[0]), 10, 10);
      dispatchMouseMove(10, 500);
      dispatchMouseUp();

      expect(childIndex(container, rows[0])).toBe(1);
      expect(fullRowManager.reindexRows).toHaveBeenCalledWith(wrapper);
      expect(fullRowManager.saveModifierRows).toHaveBeenCalledWith(wrapper);
      expect(rows[0].classList.contains('dragging')).toBe(false);
      expect(document.body.style.cursor).toBe('');
    });

    test('skips reindex when the box ancestor is missing', () => {
      const { container, rows } = buildRowDragDom({
        ...SEL.full,
        rowCount: 2,
        withBoxId: false,
      });
      stubRect(rows[0], 0);
      stubRect(rows[1], 30);

      dispatchMouseDown(handleOf(rows[0]), 10, 10);
      dispatchMouseMove(10, 500);
      dispatchMouseUp();

      expect(childIndex(container, rows[0])).toBe(1);
      expect(fullRowManager.reindexRows).not.toHaveBeenCalled();
      expect(fullRowManager.saveModifierRows).not.toHaveBeenCalled();
    });

    test('reindex-only manager skips the save step', () => {
      const { container, rows } = buildRowDragDom({
        ...SEL.reindexOnly,
        rowCount: 2,
      });
      stubRect(rows[0], 0);
      stubRect(rows[1], 30);

      dispatchMouseDown(handleOf(rows[0]), 10, 10);
      dispatchMouseMove(10, 500);
      dispatchMouseUp();

      expect(childIndex(container, rows[0])).toBe(1);
      expect(reindexOnlyManager.reindexRows).toHaveBeenCalledTimes(1);
    });

    test('manager without row functions still completes the drag', () => {
      const { container, rows } = buildRowDragDom({ ...SEL.noFns, rowCount: 2 });
      stubRect(rows[0], 0);
      stubRect(rows[1], 30);

      dispatchMouseDown(handleOf(rows[0]), 10, 10);
      dispatchMouseMove(10, 500);
      dispatchMouseUp();

      expect(childIndex(container, rows[0])).toBe(1);
      expect(rows[0].classList.contains('dragging')).toBe(false);
    });

    test('null manager still completes the drag', () => {
      const { container, rows } = buildRowDragDom({
        ...SEL.nullManager,
        rowCount: 2,
      });
      stubRect(rows[0], 0);
      stubRect(rows[1], 30);

      dispatchMouseDown(handleOf(rows[0]), 10, 10);
      dispatchMouseMove(10, 500);
      dispatchMouseUp();

      expect(childIndex(container, rows[0])).toBe(1);
    });

    test('click without movement only cleans up', () => {
      const { rows } = buildRowDragDom({ ...SEL.full, rowCount: 2 });
      dispatchMouseDown(handleOf(rows[0]), 10, 10);
      dispatchMouseUp();
      expect(fullRowManager.reindexRows).not.toHaveBeenCalled();
      expect(document.body.style.cursor).toBe('');
    });

    test('mouseup with no armed drag is a no-op', () => {
      expect(() => dispatchMouseUp()).not.toThrow();
      expect(fullRowManager.reindexRows).not.toHaveBeenCalled();
    });
  });

  describe('preventSelect / cleanup / theme', () => {
    test('selectstart is prevented while armed and ignored when idle', () => {
      const { rows } = buildRowDragDom({ ...SEL.full, rowCount: 1 });
      dispatchMouseDown(handleOf(rows[0]), 10, 10);
      expect(dispatchSelectStart().defaultPrevented).toBe(true);
      dispatchMouseUp();
      expect(dispatchSelectStart().defaultPrevented).toBe(false);
    });

    test('public cleanup resets styles, classes and cursor', () => {
      const { container, rows } = buildRowDragDom({ ...SEL.full, rowCount: 2 });
      dispatchMouseDown(handleOf(rows[0]), 10, 10);
      dispatchMouseMove(300, 300);
      expect(rows[0].classList.contains('dragging')).toBe(true);

      factoryFull.cleanup();

      expect(rows[0].classList.contains('dragging')).toBe(false);
      expect(rows[0].style.opacity).toBe('');
      expect(document.body.style.cursor).toBe('');
      expect(container.querySelector('.modifier-row-placeholder')).toBeNull();
    });

    test('public cleanup is safe when idle', () => {
      expect(() => factoryFull.cleanup()).not.toThrow();
    });

    test('public updatePlaceholderTheme is safe to call directly', () => {
      expect(() => factoryFull.updatePlaceholderTheme()).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// dragDropManager.ts
// ---------------------------------------------------------------------------

describe('dragDropManager (setupDragAndDrop)', () => {
  afterEach(() => {
    dispatchMouseUp();
  });

  describe('module surface', () => {
    test('exposes named, default and legacy global exports', () => {
      expect(dragDropManagerModule.setupDragAndDrop).toBeInstanceOf(Function);
      expect(dragDropManagerModule.cleanup).toBeInstanceOf(Function);
      expect(dragDropManagerModule.default.setupDragAndDrop).toBe(dragDropManagerModule.setupDragAndDrop);
      expect(dragDropManagerModule.default.cleanup).toBe(dragDropManagerModule.cleanup);
      expect(window.ModifierBoxDragDropManager.setupDragAndDrop).toBe(dragDropManagerModule.setupDragAndDrop);
      expect(window.ModifierBoxDragDropManager.cleanup).toBe(dragDropManagerModule.cleanup);
    });
  });

  describe('setup validation', () => {
    test('requires a modifier box', () => {
      dragDropManagerModule.setupDragAndDrop(null);
      expect(console.error).toHaveBeenCalledWith('setupDragAndDrop: modifierBox is required');
    });

    test('requires a content area', () => {
      const box = document.createElement('div');
      box.id = 'pixels-modifier-box';
      document.body.appendChild(box);
      dragDropManagerModule.setupDragAndDrop(box);
      expect(console.error).toHaveBeenCalledWith('setupDragAndDrop: content area not found');
    });

    test('adds handles and draggable styling without duplicating', () => {
      const { box, content, rows } = buildManagerDom(3);
      dragDropManagerModule.setupDragAndDrop(box);
      // Second setup finds existing handles and skips creation.
      dragDropManagerModule.setupDragAndDrop(box);

      rows.forEach(row => {
        expect(row.querySelectorAll('.drag-handle').length).toBe(1);
        expect(row.classList.contains('draggable-row')).toBe(true);
      });
      expect(content._modifierBox).toBe(box);
    });
  });

  describe('mouse dragging', () => {
    test('mousedown away from a handle does nothing', () => {
      const { box, content } = buildManagerDom(2);
      dragDropManagerModule.setupDragAndDrop(box);
      const event = dispatchMouseDown(content, 5, 5);
      expect(event.defaultPrevented).toBe(false);
      dispatchMouseMove(200, 200);
      expect(content.querySelector('.dragging')).toBeNull();
      expect(content.querySelector('.drag-placeholder')).toBeNull();
    });

    test('mousedown on a handle starts a drag with placeholder', () => {
      const { box, content, rows } = buildManagerDom(2);
      stubRect(rows[0], 0, 20, 100);
      dragDropManagerModule.setupDragAndDrop(box);

      const event = dispatchMouseDown(handleOf(rows[0]), 50, 15);
      expect(event.defaultPrevented).toBe(true);
      expect(rows[0].classList.contains('dragging')).toBe(true);
      expect(rows[0].style.position).toBe('fixed');
      expect(rows[0].style.zIndex).toBe('10000');
      expect(rows[0].style.left).toBe('0px');
      expect(rows[0].style.top).toBe('-5px');

      const placeholders = content.querySelectorAll('.drag-placeholder');
      expect(placeholders.length).toBe(1);
      expect(placeholders[0].previousSibling).toBe(rows[0]);
      expect(placeholders[0].nextSibling).toBe(rows[1]);
      expect(content.classList.contains('drag-active')).toBe(true);
    });

    test('mousemove repositions the dragged row', () => {
      const { box, rows } = buildManagerDom(2);
      stubRect(rows[0], 0, 20, 100);
      stubRect(rows[1], 40, 20, 100);
      dragDropManagerModule.setupDragAndDrop(box);

      dispatchMouseDown(handleOf(rows[0]), 50, 15);
      dispatchMouseMove(80, 60);
      expect(rows[0].style.left).toBe('30px');
      expect(rows[0].style.top).toBe('40px');
    });

    test('full reorder flow reindexes and resets styles', () => {
      const reindexRows = jest.fn();
      window.ModifierBoxRowManager = { reindexRows };
      const { box, content, rows } = buildManagerDom(3);
      stubRect(rows[0], 10, 20, 100);
      stubRect(rows[1], 40, 20, 100);
      stubRect(rows[2], 70, 20, 100);
      dragDropManagerModule.setupDragAndDrop(box);

      dispatchMouseDown(handleOf(rows[0]), 50, 15);
      dispatchMouseMove(50, 75);

      const placeholder = content.querySelector('.drag-placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder.nextSibling).toBe(rows[2]);

      dispatchMouseUp();

      expect(Array.from(content.children)).toEqual([rows[1], rows[0], rows[2]]);
      expect(content.querySelector('.drag-placeholder')).toBeNull();
      expect(rows[0].classList.contains('dragging')).toBe(false);
      expect(rows[0].style.position).toBe('');
      expect(rows[0].style.left).toBe('');
      expect(rows[0].style.top).toBe('');
      expect(content.classList.contains('drag-active')).toBe(false);
      expect(reindexRows).toHaveBeenCalledWith(box);
    });

    test('mouseup with no active drag is a no-op', () => {
      const reindexRows = jest.fn();
      window.ModifierBoxRowManager = { reindexRows };
      const { box } = buildManagerDom(2);
      dragDropManagerModule.setupDragAndDrop(box);
      dispatchMouseUp();
      expect(reindexRows).not.toHaveBeenCalled();
    });

    test('second mousedown while dragging is ignored', () => {
      const reindexRows = jest.fn();
      window.ModifierBoxRowManager = { reindexRows };
      const { box, content, rows } = buildManagerDom(2);
      dragDropManagerModule.setupDragAndDrop(box);

      dispatchMouseDown(handleOf(rows[0]), 50, 15);
      dispatchMouseDown(handleOf(rows[1]), 50, 45);

      expect(rows[0].classList.contains('dragging')).toBe(true);
      expect(rows[1].classList.contains('dragging')).toBe(false);

      dispatchMouseUp();
      expect(reindexRows).toHaveBeenCalledTimes(1);
      expect(Array.from(content.children).filter(el => el.classList.contains('modifier-row')).length).toBe(2);
    });

    test('endDrag without a row manager skips reindex', () => {
      const { box, content, rows } = buildManagerDom(2);
      stubRect(rows[0], 0, 20, 100);
      stubRect(rows[1], 40, 20, 100);
      dragDropManagerModule.setupDragAndDrop(box);

      dispatchMouseDown(handleOf(rows[0]), 50, 15);
      dispatchMouseMove(50, 80);
      dispatchMouseUp();

      expect(Array.from(content.children)).toEqual([rows[1], rows[0]]);
      expect(content.querySelector('.drag-placeholder')).toBeNull();
    });

    test('endDrag without a stored box reference skips reindex', () => {
      const reindexRows = jest.fn();
      window.ModifierBoxRowManager = { reindexRows };
      const { box, content, rows } = buildManagerDom(2);
      stubRect(rows[0], 0, 20, 100);
      stubRect(rows[1], 40, 20, 100);
      dragDropManagerModule.setupDragAndDrop(box);

      dispatchMouseDown(handleOf(rows[0]), 50, 15);
      dispatchMouseMove(50, 80);
      delete content._modifierBox;
      dispatchMouseUp();

      expect(reindexRows).not.toHaveBeenCalled();
      expect(content.querySelector('.drag-placeholder')).toBeNull();
    });

    test('detached dragged row short-circuits drop targeting', () => {
      const reindexRows = jest.fn();
      window.ModifierBoxRowManager = { reindexRows };
      const { box, content, rows } = buildManagerDom(2);
      stubRect(rows[0], 0, 20, 100);
      stubRect(rows[1], 40, 20, 100);
      dragDropManagerModule.setupDragAndDrop(box);

      dispatchMouseDown(handleOf(rows[0]), 50, 15);
      rows[0].remove();
      expect(() => dispatchMouseMove(50, 80)).not.toThrow();
      dispatchMouseUp();

      // Row is restored next to the placeholder; no box ref survives.
      expect(content.contains(rows[0])).toBe(true);
      expect(reindexRows).not.toHaveBeenCalled();
    });

    test('placeholder holds position when already at the drop target', () => {
      const { box, content, rows } = buildManagerDom(3);
      stubRect(rows[0], 10, 20, 100);
      stubRect(rows[1], 40, 20, 100);
      stubRect(rows[2], 70, 20, 100);
      dragDropManagerModule.setupDragAndDrop(box);

      dispatchMouseDown(handleOf(rows[0]), 50, 15);
      const placeholder = content.querySelector('.drag-placeholder');
      dispatchMouseMove(50, 45);
      // Drop target resolves to row B which already follows the placeholder.
      expect(content.querySelector('.drag-placeholder')).toBe(placeholder);
      expect(placeholder.previousSibling).toBe(rows[0]);
      expect(placeholder.nextSibling).toBe(rows[1]);
    });

    test('single-row content appends the placeholder at the end', () => {
      const reindexRows = jest.fn();
      window.ModifierBoxRowManager = { reindexRows };
      const { box, content, rows } = buildManagerDom(1);
      stubRect(rows[0], 0, 20, 100);
      dragDropManagerModule.setupDragAndDrop(box);

      dispatchMouseDown(handleOf(rows[0]), 50, 15);
      expect(() => dispatchMouseMove(50, 200)).not.toThrow();
      expect(content.querySelector('.drag-placeholder')).toBeTruthy();
      dispatchMouseUp();
      expect(reindexRows).toHaveBeenCalledWith(box);
    });

    test('idle mousemove and touchmove are ignored', () => {
      const { box } = buildManagerDom(2);
      dragDropManagerModule.setupDragAndDrop(box);
      expect(() => dispatchMouseMove(10, 10)).not.toThrow();
      expect(() => dispatchTouch('touchmove', document, 10, 10)).not.toThrow();
    });

    test('cleanup aborts an in-progress drag', () => {
      const reindexRows = jest.fn();
      window.ModifierBoxRowManager = { reindexRows };
      const { box, rows } = buildManagerDom(2);
      stubRect(rows[0], 0, 20, 100);
      stubRect(rows[1], 40, 20, 100);
      dragDropManagerModule.setupDragAndDrop(box);

      dispatchMouseDown(handleOf(rows[0]), 50, 15);
      const leftAfterStart = rows[0].style.left;
      dragDropManagerModule.cleanup();
      dispatchMouseMove(200, 200);
      expect(rows[0].style.left).toBe(leftAfterStart);
      dispatchMouseUp();
      expect(reindexRows).not.toHaveBeenCalled();

      // A fresh drag still works after cleanup.
      dispatchMouseDown(handleOf(rows[1]), 50, 45);
      expect(rows[1].classList.contains('dragging')).toBe(true);
    });

    test('cleanup is safe when idle', () => {
      expect(() => dragDropManagerModule.cleanup()).not.toThrow();
    });
  });

  describe('touch dragging', () => {
    test('touchstart away from a handle does nothing', () => {
      const { box, content } = buildManagerDom(2);
      dragDropManagerModule.setupDragAndDrop(box);
      const event = dispatchTouch('touchstart', content, 5, 5);
      expect(event.defaultPrevented).toBe(false);
      expect(content.querySelector('.dragging')).toBeNull();
    });

    test('full touch reorder flow', () => {
      const reindexRows = jest.fn();
      window.ModifierBoxRowManager = { reindexRows };
      const { box, content, rows } = buildManagerDom(3);
      stubRect(rows[0], 10, 20, 100);
      stubRect(rows[1], 40, 20, 100);
      stubRect(rows[2], 70, 20, 100);
      dragDropManagerModule.setupDragAndDrop(box);

      const startEvent = dispatchTouch('touchstart', handleOf(rows[0]), 50, 15);
      expect(startEvent.defaultPrevented).toBe(true);
      expect(rows[0].classList.contains('dragging')).toBe(true);

      dispatchTouch('touchmove', document, 50, 75);
      expect(rows[0].style.top).toBe('55px');

      dispatchTouch('touchend', document);
      expect(Array.from(content.children)).toEqual([rows[1], rows[0], rows[2]]);
      expect(reindexRows).toHaveBeenCalledWith(box);
    });

    test('idle touchend is a no-op', () => {
      const { box } = buildManagerDom(1);
      dragDropManagerModule.setupDragAndDrop(box);
      expect(() => dispatchTouch('touchend', document)).not.toThrow();
    });
  });

  describe('module load auto-setup', () => {
    function reloadManagerWith(rowManager) {
      if (rowManager === undefined) {
        delete window.ModifierBoxRowManager;
      } else {
        window.ModifierBoxRowManager = rowManager;
      }
      jest.resetModules();
      return require('../../../../src/components/modifierBox/dragDropManager.js');
    }

    test('loads without a row manager', () => {
      const fresh = reloadManagerWith(undefined);
      expect(fresh.setupDragAndDrop).toBeInstanceOf(Function);
      expect(window.ModifierBoxDragDropManager.setupDragAndDrop).toBe(fresh.setupDragAndDrop);
    });

    test('loads with a row manager lacking addModifierRow', () => {
      const fresh = reloadManagerWith({});
      expect(fresh.setupDragAndDrop).toBeInstanceOf(Function);
      expect(window.ModifierBoxRowManager.addModifierRow).toBeUndefined();
    });

    test('wraps addModifierRow to attach handles to new rows', () => {
      const originalAddRow = jest.fn();
      reloadManagerWith({ addModifierRow: originalAddRow });

      const box = document.createElement('div');
      box.id = 'pixels-modifier-box';
      const content = document.createElement('div');
      content.className = 'pixels-content';
      box.appendChild(content);
      document.body.appendChild(box);
      const row = document.createElement('div');
      row.className = 'modifier-row';
      content.appendChild(row);

      window.ModifierBoxRowManager.addModifierRow(box);

      expect(originalAddRow).toHaveBeenCalledWith(box);
      expect(row.querySelectorAll('.drag-handle').length).toBe(1);
      expect(row.classList.contains('draggable-row')).toBe(true);

      // Second call finds the existing handle and skips creation.
      window.ModifierBoxRowManager.addModifierRow(box);
      expect(originalAddRow).toHaveBeenCalledTimes(2);
      expect(row.querySelectorAll('.drag-handle').length).toBe(1);
    });

    test('wrapped addModifierRow tolerates missing content and rows', () => {
      const originalAddRow = jest.fn();
      reloadManagerWith({ addModifierRow: originalAddRow });

      const bareBox = document.createElement('div');
      bareBox.id = 'pixels-modifier-box';
      document.body.appendChild(bareBox);
      expect(() => window.ModifierBoxRowManager.addModifierRow(bareBox)).not.toThrow();
      expect(originalAddRow).toHaveBeenCalledWith(bareBox);

      const emptyBox = document.createElement('div');
      const emptyContent = document.createElement('div');
      emptyContent.className = 'pixels-content';
      emptyBox.appendChild(emptyContent);
      document.body.appendChild(emptyBox);
      expect(() => window.ModifierBoxRowManager.addModifierRow(emptyBox)).not.toThrow();
    });
  });
});
