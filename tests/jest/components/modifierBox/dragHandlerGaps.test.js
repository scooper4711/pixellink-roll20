/**
 * @jest-environment jsdom
 */

const dragHandler = require('../../../../src/components/modifierBox/dragHandler.js');

function createBox(rect = { left: 100, top: 200, width: 280, height: 150, right: 380, bottom: 350 }) {
  const box = document.createElement('div');
  box.id = 'pixels-modifier-box';
  box.style.position = 'fixed';
  box.style.left = '100px';
  box.style.top = '200px';
  const header = document.createElement('div');
  header.className = 'pixels-header';
  header.textContent = 'header';
  box.appendChild(header);
  document.body.appendChild(box);
  box.getBoundingClientRect = jest.fn(() => ({ ...rect }));
  return { box, header };
}

function mousedown(target, x = 150, y = 250) {
  target.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }));
}

function mousemove(x, y) {
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
}

function mouseup() {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

describe('Drag Handler gaps', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (dragHandler.default) window.ModifierBoxDragHandler = dragHandler.default;
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('double-click restores auto height before content measured', () => {
    const { box } = createBox();
    window.ModifierBoxDragHandler.setupDragFunctionality(box);
    const handle = box.querySelector('.pixels-resize-handle');
    expect(handle).toBeTruthy();
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(box.style.width).toBe('400px');
    expect(box.style.height).toBe('auto');
  });

  test('double-click restores measured height after timeout', () => {
    jest.useFakeTimers();
    const { box } = createBox();
    window.ModifierBoxDragHandler.setupDragFunctionality(box);
    jest.advanceTimersByTime(150);
    box.querySelector('.pixels-resize-handle').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(box.style.width).toBe('400px');
    expect(box.style.height).toBe('150px');
  });

  test('mousedown on header buttons is ignored', () => {
    const { box, header } = createBox();
    const btn = document.createElement('button');
    btn.textContent = 'x';
    header.appendChild(btn);
    window.ModifierBoxDragHandler.setupDragFunctionality(box);
    const spy = jest.spyOn(document, 'addEventListener');
    mousedown(btn, 150, 250);
    expect(spy).not.toHaveBeenCalledWith('mousemove', expect.any(Function));
    spy.mockRestore();

    // interactive class targets are also ignored
    for (const cls of ['pixels-close', 'pixels-minimize', 'add-modifier-btn']) {
      const el = document.createElement('span');
      el.className = cls;
      header.appendChild(el);
      mousedown(el, 150, 250);
      expect(box.style.left).toBe('100px');
      mouseup();
    }

    // element nested inside a button is ignored via closest('button')
    const inner = document.createElement('span');
    btn.appendChild(inner);
    mousedown(inner, 150, 250);
    mousemove(500, 500);
    expect(box.style.left).toBe('100px');
    mouseup();
  });

  test('resize drag clamps to maximum dimensions', () => {
    const { box } = createBox();
    window.ModifierBoxDragHandler.setupDragFunctionality(box);
    mousedown(box.querySelector('.pixels-resize-handle'), 150, 250);
    mousemove(2000, 2000);
    const maxW = Math.min(800, window.innerWidth * 0.8);
    const maxH = Math.min(600, window.innerHeight * 0.8);
    expect(box.style.width).toBe(`${maxW}px`);
    expect(box.style.height).toBe(`${maxH}px`);
    mouseup();
  });

  test('resize drag clamps to minimum dimensions', () => {
    const { box } = createBox();
    window.ModifierBoxDragHandler.setupDragFunctionality(box);
    mousedown(box.querySelector('.pixels-resize-handle'), 150, 250);
    mousemove(0, 0);
    expect(box.style.width).toBe('250px');
    expect(box.style.height).toBe('120px');
    mouseup();
  });

  test('resize drag keeps box on-screen', () => {
    const { box } = createBox();
    window.ModifierBoxDragHandler.setupDragFunctionality(box);
    mousedown(box.querySelector('.pixels-resize-handle'), 150, 250);
    // report an off-screen rect after resize
    box.getBoundingClientRect = jest.fn(() => ({
      left: 900,
      top: 700,
      width: 300,
      height: 200,
      right: 1200,
      bottom: 900,
    }));
    mousemove(400, 400);
    expect(box.style.left).toBe(`${window.innerWidth - 300 - 10}px`);
    expect(box.style.top).toBe(`${window.innerHeight - 200 - 10}px`);
    mouseup();
  });

  test('drag clamps to viewport bounds', () => {
    const { box, header } = createBox();
    window.ModifierBoxDragHandler.setupDragFunctionality(box);
    mousedown(header, 150, 250);
    mousemove(-500, -500);
    expect(box.style.left).toBe('0px');
    expect(box.style.top).toBe('0px');
    mousemove(5000, 5000);
    expect(box.style.left).toBe(`${window.innerWidth - 100}px`);
    expect(box.style.top).toBe(`${window.innerHeight - 50}px`);
    mouseup();
  });

  test('mousemove with no active gesture is a no-op', () => {
    const { box } = createBox();
    window.ModifierBoxDragHandler.setupDragFunctionality(box);
    mousemove(600, 600);
    expect(box.style.left).toBe('100px');
  });
});
