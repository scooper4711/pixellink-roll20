/**
 * @jest-environment jsdom
 */

const uiControls = require('../../../../src/components/modifierBox/uiControls.js');

function createBox() {
  const box = document.createElement('div');
  box.id = 'pixels-modifier-box';
  box.innerHTML = `
    <div class="pixels-header">
      <div class="pixels-controls">
        <button class="pixels-minimize" title="Minimize">−</button>
        <button class="clear-all-btn" type="button">Clear All</button>
      </div>
    </div>
    <div class="pixels-content"></div>
  `;
  document.body.appendChild(box);
  return box;
}

describe('UI Controls', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.PixelsProfileStorage;
  });

  describe('setupMinimizeControls', () => {
    test('logs error when box is null', () => {
      uiControls.setupMinimizeControls(null);
      expect(console.error).toHaveBeenCalledWith('setupMinimizeControls: modifierBox is required');
    });

    test('logs error when minimize button missing', () => {
      uiControls.setupMinimizeControls(document.createElement('div'));
      expect(console.error).toHaveBeenCalledWith('Minimize button not found!');
    });

    test('toggles minimized state and persists via storage', () => {
      const box = createBox();
      window.PixelsProfileStorage = { setMinimized: jest.fn().mockResolvedValue(undefined) };
      uiControls.setupMinimizeControls(box);
      const btn = box.querySelector('.pixels-minimize');

      btn.click();
      expect(box.classList.contains('minimized')).toBe(true);
      expect(btn.textContent).toBe('+');
      expect(window.PixelsProfileStorage.setMinimized).toHaveBeenCalledWith(true);

      btn.click();
      expect(box.classList.contains('minimized')).toBe(false);
      expect(btn.textContent).toBe('−');
      expect(window.PixelsProfileStorage.setMinimized).toHaveBeenCalledWith(false);
    });

    test('works without storage backend', () => {
      const box = createBox();
      uiControls.setupMinimizeControls(box);
      const btn = box.querySelector('.pixels-minimize');
      expect(() => btn.click()).not.toThrow();
      expect(box.classList.contains('minimized')).toBe(true);
    });

    test('handles rejected persist promise', async () => {
      const box = createBox();
      window.PixelsProfileStorage = {
        setMinimized: jest.fn().mockRejectedValue(new Error('db down')),
      };
      uiControls.setupMinimizeControls(box);
      box.querySelector('.pixels-minimize').click();
      await Promise.resolve();
      await new Promise(r => setTimeout(r, 0));
      expect(console.error).toHaveBeenCalledWith('Error persisting minimized state:', expect.any(Error));
    });

    test('handles throwing setMinimized', () => {
      const box = createBox();
      window.PixelsProfileStorage = {
        setMinimized: jest.fn(() => {
          throw new Error('sync throw');
        }),
      };
      uiControls.setupMinimizeControls(box);
      box.querySelector('.pixels-minimize').click();
      expect(console.error).toHaveBeenCalledWith('Error persisting minimized state:', expect.any(Error));
    });
  });

  describe('applyMinimizedState', () => {
    test('logs error for null box', () => {
      uiControls.applyMinimizedState(null, true);
      expect(console.error).toHaveBeenCalledWith('applyMinimizedState: modifierBox is required');
    });

    test('logs error when button missing', () => {
      uiControls.applyMinimizedState(document.createElement('div'), true);
      expect(console.error).toHaveBeenCalledWith('Minimize button not found!');
    });

    test('minimizes and restores with original dimensions', () => {
      const box = createBox();
      box.getBoundingClientRect = jest.fn(() => ({ width: 400, height: 300 }));
      const btn = box.querySelector('.pixels-minimize');

      uiControls.applyMinimizedState(box, true);
      expect(box.classList.contains('minimized')).toBe(true);
      expect(box.dataset.originalWidth).toBe('400');
      expect(btn.title).toBe('Restore');

      uiControls.applyMinimizedState(box, false);
      expect(box.classList.contains('minimized')).toBe(false);
      expect(box.style.getPropertyValue('width')).toBe('400px');
      expect(btn.textContent).toBe('−');
      expect(btn.title).toBe('Minimize');
    });

    test('restores without stored dimensions (no width applied)', () => {
      const box = createBox();
      const btn = box.querySelector('.pixels-minimize');
      uiControls.applyMinimizedState(box, false);
      expect(box.classList.contains('minimized')).toBe(false);
      expect(btn.textContent).toBe('−');
    });
  });

  describe('restoreMinimizedState', () => {
    test('returns early for null box', async () => {
      await expect(uiControls.restoreMinimizedState(null)).resolves.toBeUndefined();
    });

    test('applies minimized when storage returns true', async () => {
      const box = createBox();
      window.PixelsProfileStorage = { getMinimized: jest.fn().mockResolvedValue(true) };
      await uiControls.restoreMinimizedState(box);
      expect(box.classList.contains('minimized')).toBe(true);
    });

    test('does nothing when storage returns false', async () => {
      const box = createBox();
      window.PixelsProfileStorage = { getMinimized: jest.fn().mockResolvedValue(false) };
      await uiControls.restoreMinimizedState(box);
      expect(box.classList.contains('minimized')).toBe(false);
    });

    test('does nothing without storage backend', async () => {
      const box = createBox();
      await expect(uiControls.restoreMinimizedState(box)).resolves.toBeUndefined();
      expect(box.classList.contains('minimized')).toBe(false);
    });

    test('logs error when storage rejects', async () => {
      const box = createBox();
      window.PixelsProfileStorage = {
        getMinimized: jest.fn().mockRejectedValue(new Error('fail')),
      };
      await uiControls.restoreMinimizedState(box);
      expect(console.error).toHaveBeenCalledWith('Error restoring minimized state:', expect.any(Error));
    });
  });

  describe('setupClearAllControls', () => {
    test('logs error for null box', () => {
      uiControls.setupClearAllControls(null, jest.fn());
      expect(console.error).toHaveBeenCalledWith('setupClearAllControls: modifierBox is required');
    });

    test('logs error for missing/invalid callback', () => {
      const box = createBox();
      uiControls.setupClearAllControls(box, null);
      expect(console.error).toHaveBeenCalledWith('setupClearAllControls: clearAllCallback is required');
      uiControls.setupClearAllControls(box, 'nope');
      expect(console.error).toHaveBeenCalledWith('setupClearAllControls: clearAllCallback is required');
    });

    test('logs error when button missing', () => {
      const box = document.createElement('div');
      uiControls.setupClearAllControls(box, jest.fn());
      expect(console.error).toHaveBeenCalledWith('Clear All button not found!');
    });

    test('invokes callback on click', () => {
      const box = createBox();
      const cb = jest.fn();
      uiControls.setupClearAllControls(box, cb);
      box.querySelector('.clear-all-btn').click();
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  test('default export and window global', () => {
    expect(uiControls.default.setupMinimizeControls).toBeInstanceOf(Function);
    expect(window.ModifierBoxUIControls).toBeDefined();
  });
});
