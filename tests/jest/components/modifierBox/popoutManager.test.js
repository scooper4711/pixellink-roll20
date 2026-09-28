/**
 * @jest-environment jsdom
 */

let popout;

function makePipWindow() {
  const pipDoc = document.implementation.createHTMLDocument('pip');
  const listeners = {};
  const win = {
    document: pipDoc,
    addEventListener: jest.fn((type, fn) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    }),
    close: jest.fn(() => {
      (listeners.pagehide || []).forEach(fn => fn());
    }),
    _listeners: listeners,
  };
  return win;
}

function createBoxWithButton() {
  const box = document.createElement('div');
  box.id = 'pixels-modifier-box';
  box.innerHTML = '<button class="pixels-popout" type="button">pop</button>';
  document.body.appendChild(box);
  return box;
}

async function flush() {
  await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
}

describe('Popout Manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.body.className = '';
    jest.resetModules();
    delete window.documentPictureInPicture;
    popout = require('../../../../src/components/modifierBox/popoutManager.js');
  });

  afterEach(() => {
    delete window.documentPictureInPicture;
  });

  test('returns early for null box', () => {
    expect(() => popout.setupPopoutControls(null)).not.toThrow();
    expect(() => popout.setupPopoutControls(undefined)).not.toThrow();
  });

  test('returns early when button missing', () => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    expect(() => popout.setupPopoutControls(box)).not.toThrow();
  });

  test('hides button when API unsupported', () => {
    const box = createBoxWithButton();
    popout.setupPopoutControls(box);
    expect(box.querySelector('.pixels-popout').style.display).toBe('none');
    expect(popout.default.isSupported()).toBe(false);
  });

  test('isSupported true when API present', () => {
    window.documentPictureInPicture = { requestWindow: jest.fn() };
    expect(popout.default.isSupported()).toBe(true);
  });

  test('opens popout on click and restores on second click', async () => {
    const pipWin = makePipWindow();
    window.documentPictureInPicture = { requestWindow: jest.fn().mockResolvedValue(pipWin) };
    const box = createBoxWithButton();
    box.getBoundingClientRect = jest.fn(() => ({ width: 400, height: 320 }));
    popout.setupPopoutControls(box);

    box.querySelector('.pixels-popout').click();
    await flush();

    expect(window.documentPictureInPicture.requestWindow).toHaveBeenCalled();
    expect(pipWin.document.body.contains(box)).toBe(true);
    expect(box.classList.contains('pixels-popped-out')).toBe(true);
    // placeholder left behind in main doc
    expect(document.body.textContent).toContain('');
    // popout styles injected
    expect(pipWin.document.getElementById('pixels-modifier-box-popout-styles')).toBeTruthy();

    // second click closes (toggle path via pipWindow.close)
    box.querySelector('.pixels-popout').click();
    await flush();
    expect(pipWin.close).toHaveBeenCalled();
    expect(document.body.contains(box)).toBe(true);
    expect(box.classList.contains('pixels-popped-out')).toBe(false);
  });

  test('copies existing style nodes and syncs theme class', async () => {
    document.body.classList.add('roll20-light-theme');
    const style = document.createElement('style');
    style.id = 'pixels-modifier-box-base-styles';
    style.textContent = '.x{color:red}';
    document.head.appendChild(style);

    const pipWin = makePipWindow();
    window.documentPictureInPicture = { requestWindow: jest.fn().mockResolvedValue(pipWin) };
    const box = createBoxWithButton();
    popout.setupPopoutControls(box);
    box.querySelector('.pixels-popout').click();
    await flush();

    // style cloned into pip doc
    const cloned = pipWin.document.getElementById('pixels-modifier-box-base-styles');
    expect(cloned).toBeTruthy();
    expect(cloned.textContent).toContain('color:red');
    // theme class mirrored
    expect(pipWin.document.body.classList.contains('roll20-light-theme')).toBe(true);

    // change theme while popped out -> observer syncs
    document.body.classList.remove('roll20-light-theme');
    document.body.classList.add('roll20-dark-theme');
    await flush();
    expect(pipWin.document.body.classList.contains('roll20-dark-theme')).toBe(true);
    expect(pipWin.document.body.classList.contains('roll20-light-theme')).toBe(false);

    pipWin.close();
    await flush();
  });

  test('uses default dimensions when rect is empty', async () => {
    const pipWin = makePipWindow();
    window.documentPictureInPicture = { requestWindow: jest.fn().mockResolvedValue(pipWin) };
    const box = createBoxWithButton();
    box.getBoundingClientRect = jest.fn(() => ({ width: 0, height: 0 }));
    popout.setupPopoutControls(box);
    box.querySelector('.pixels-popout').click();
    await flush();
    expect(window.documentPictureInPicture.requestWindow).toHaveBeenCalledWith({ width: 400, height: 320 });
    pipWin.close();
    await flush();
  });

  test('logs error and recovers when requestWindow rejects', async () => {
    window.documentPictureInPicture = {
      requestWindow: jest.fn().mockRejectedValue(new Error('denied')),
    };
    const box = createBoxWithButton();
    popout.setupPopoutControls(box);
    box.querySelector('.pixels-popout').click();
    await flush();
    expect(console.error).toHaveBeenCalledWith('Failed to open modifier box pop-out window:', expect.any(Error));
    // box stays in main document
    expect(document.body.contains(box)).toBe(true);
  });

  test('restore appends to body when placeholder was removed', async () => {
    const pipWin = makePipWindow();
    window.documentPictureInPicture = { requestWindow: jest.fn().mockResolvedValue(pipWin) };
    const box = createBoxWithButton();
    popout.setupPopoutControls(box);
    box.querySelector('.pixels-popout').click();
    await flush();

    // remove placeholder so restore takes the fallback branch
    const placeholder = [...document.body.childNodes].find(n => n.nodeType === 8);
    expect(placeholder).toBeTruthy();
    placeholder.remove();

    pipWin.close();
    await flush();
    expect(document.body.contains(box)).toBe(true);
  });

  test('injectPopoutStyles is idempotent across two opens', async () => {
    const pipWin = makePipWindow();
    window.documentPictureInPicture = {
      requestWindow: jest.fn().mockResolvedValue(pipWin),
    };
    const box = createBoxWithButton();
    popout.setupPopoutControls(box);
    box.querySelector('.pixels-popout').click();
    await flush();
    expect(pipWin.document.getElementById('pixels-modifier-box-popout-styles')).toBeTruthy();
    pipWin.close();
    await flush();
    // reopen into the SAME pip document: style already present -> early return
    box.querySelector('.pixels-popout').click();
    await flush();
    const styles = pipWin.document.querySelectorAll('#pixels-modifier-box-popout-styles');
    expect(styles.length).toBe(1);
    pipWin.close();
    await flush();
  });

  test('handles missing MutationObserver gracefully', async () => {
    const saved = global.MutationObserver;
    // @ts-ignore - simulate old browser
    global.MutationObserver = undefined;
    const pipWin = makePipWindow();
    window.documentPictureInPicture = { requestWindow: jest.fn().mockResolvedValue(pipWin) };
    const box = createBoxWithButton();
    popout.setupPopoutControls(box);
    box.querySelector('.pixels-popout').click();
    await flush();
    expect(pipWin.document.body.contains(box)).toBe(true);
    pipWin.close();
    await flush();
    expect(document.body.contains(box)).toBe(true);
    global.MutationObserver = saved;
  });

  test('does not duplicate styles already in target doc', async () => {
    const pipWin = makePipWindow();
    const pre = pipWin.document.createElement('style');
    pre.id = 'pixels-modifier-box-base-styles';
    pre.textContent = 'pre-existing';
    pipWin.document.head.appendChild(pre);
    const src = document.createElement('style');
    src.id = 'pixels-modifier-box-base-styles';
    src.textContent = 'source';
    document.head.appendChild(src);

    window.documentPictureInPicture = { requestWindow: jest.fn().mockResolvedValue(pipWin) };
    const box = createBoxWithButton();
    popout.setupPopoutControls(box);
    box.querySelector('.pixels-popout').click();
    await flush();
    expect(pipWin.document.getElementById('pixels-modifier-box-base-styles').textContent).toBe('pre-existing');
    pipWin.close();
    await flush();
  });

  test('default export and window global', () => {
    expect(popout.default.setupPopoutControls).toBeInstanceOf(Function);
    expect(popout.default.isSupported).toBeInstanceOf(Function);
    expect(window.ModifierBoxPopoutManager).toBeDefined();
  });
});
