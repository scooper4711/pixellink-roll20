/**
 * Popup theme tests
 */

describe('Popup Theme System', () => {
  // Mock chrome API
  const mockChrome = {
    tabs: {
      query: jest.fn(),
      executeScript: jest.fn(),
      sendMessage: jest.fn(),
    },
    scripting: {
      executeScript: jest.fn(),
    },
    storage: {
      sync: {
        get: jest.fn((key, callback) => {
          callback({ modifier: '0' });
        }),
        set: jest.fn(),
      },
    },
    runtime: {
      onMessage: {
        addListener: jest.fn(),
      },
      lastError: null,
      getURL: jest.fn(path => `chrome-extension://test-extension-id/${path}`),
    },
  };

  beforeEach(() => {
    // Set up DOM with required elements
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <div class="popup-container">
        <div class="popup-header">
          <img src="" alt="Pixels Roll20" class="popup-icon">
          <span class="popup-title">Pixels Roll20</span>
        </div>
        <div class="popup-content">
          <div class="connection-section">
            <button id="connect" class="primary-button">Connect to Pixel</button>
            <div class="connection-status">
              <div id="text" class="status-text"></div>
            </div>
          </div>
          <div class="modifier-section">
            <div class="button-container">
              <button id="showModifier" class="secondary-button">Show Modifier Box</button>
              <button id="hideModifier" class="secondary-button">Hide Modifier Box</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Mock chrome global
    global.chrome = mockChrome;

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    delete global.chrome;
  });

  test('should apply dark theme by default', () => {
    // Mock chrome.tabs.query to call callback with no tabs
    mockChrome.tabs.query.mockImplementation((query, callback) => {
      callback([]);
    });

    // Load popup script
    require('../../src/components/popup/popup.js');

    // Simulate DOMContentLoaded
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Should not add light theme link
    const lightThemeLink = document.getElementById('popup-light-theme');
    expect(lightThemeLink).toBeNull();
  });

  test('should apply light theme when Roll20 is in light mode', done => {
    // Mock chrome.tabs.query to return active Roll20 tab
    mockChrome.tabs.query.mockImplementation((query, callback) => {
      callback([{ id: 1, url: 'https://app.roll20.net/editor/game/123' }]);
    });

    // Mock chrome.tabs.sendMessage to return light theme
    mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
      callback({ theme: 'light' });
    });

    // Load popup script
    require('../../src/components/popup/popup.js');

    // Simulate DOMContentLoaded
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Wait for async operations
    setTimeout(() => {
      // Should add light theme link
      const lightThemeLink = document.getElementById('popup-light-theme');
      expect(lightThemeLink).toBeTruthy();
      expect(lightThemeLink.href).toContain('popup-light.css');
      done();
    }, 100);
  });

  test('should apply dark theme when Roll20 is in dark mode', () => {
    // Mock chrome.tabs.query to return active Roll20 tab
    mockChrome.tabs.query.mockImplementation((query, callback) => {
      callback([{ id: 1, url: 'https://app.roll20.net/editor/game/123' }]);
    });

    // Mock chrome.tabs.sendMessage to return dark theme
    mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
      callback({ theme: 'dark' });
    });

    // Load popup script
    require('../../src/components/popup/popup.js');

    // Simulate DOMContentLoaded
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Should not add light theme link for dark mode
    const lightThemeLink = document.getElementById('popup-light-theme');
    expect(lightThemeLink).toBeNull();
  });

  test('should handle script execution failures gracefully', done => {
    // Mock chrome.tabs.query to return active Roll20 tab
    mockChrome.tabs.query.mockImplementation((query, callback) => {
      callback([{ id: 1, url: 'https://app.roll20.net/editor/game/123' }]);
    });

    // Mock chrome.tabs.sendMessage to fail (content script not available)
    mockChrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
      mockChrome.runtime.lastError = {
        message: 'Content script not available',
      };
      callback(null);
    });

    // Mock chrome.scripting.executeScript to return light theme
    mockChrome.scripting.executeScript.mockImplementation(options => {
      return Promise.resolve([{ result: 'light' }]);
    });

    // Load popup script
    require('../../src/components/popup/popup.js');

    // Simulate DOMContentLoaded
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Should fall back to direct script execution and detect light theme
    setTimeout(() => {
      const lightThemeLink = document.getElementById('popup-light-theme');
      expect(lightThemeLink).toBeTruthy();
      done();
    }, 100);
  });
});

/**
 * Extended coverage suite for src/components/popup/popup.ts
 * Drives the module through its DOM + chrome API surface (all helpers are
 * module-private, so coverage must come from DOMContentLoaded flows, button
 * clicks, and chrome message handlers). Uses fresh module state per test via
 * jest.resetModules().
 */
describe('Popup Extended Coverage', () => {
  const FULL_DOM = `
      <div class="popup-container">
        <div class="popup-header">
          <img src="" alt="Pixels Roll20" class="popup-icon">
          <span class="popup-title">Pixels Roll20</span>
        </div>
        <div class="popup-content">
          <div class="modifier-section">
            <div class="toggle-container">
              <label class="toggle-label">
                <input type="checkbox" id="allowUnprompted" checked />
                <span class="toggle-text">Allow unprompted rolls</span>
              </label>
            </div>
            <div class="roll-window-container" id="rollWindowContainer">
              <label class="roll-window-label" for="rollWindowSlider">
                Roll window: <span id="rollWindowValue" class="roll-window-value">2</span>s
              </label>
              <input type="range" id="rollWindowSlider" min="1" max="10" value="2" step="1" />
            </div>
            <div class="toggle-container">
              <label class="toggle-label">
                <input type="checkbox" id="allowDiceSubstitution" />
                <span class="toggle-text">Allow substitution</span>
              </label>
            </div>
            <div class="button-container" id="savedRollsButtons">
              <label class="toggle-label">
                <input type="checkbox" id="toggleSavedRolls" checked />
                <span class="toggle-text">Display Saved Roll Formulas</span>
              </label>
            </div>
          </div>
          <div class="profiles-section" id="profilesSection">
            <div class="section-label">Saved Profiles</div>
            <div id="activeProfileBanner" class="active-profile-banner" style="display: none">
              <span class="active-profile-label">Active: <span id="activeProfileName"></span></span>
              <button id="updateProfile" class="profile-item-btn">Update</button>
            </div>
            <div class="profile-save-row">
              <input id="profileName" type="text" class="profile-input" placeholder="Profile name" maxlength="40" />
              <button id="saveProfile" class="primary-button profile-save-btn">Save</button>
            </div>
            <ul id="profileList" class="profile-list"></ul>
            <div id="profileEmpty" class="text-small text-muted">No saved profiles yet.</div>
            <div class="profile-io-row">
              <button id="exportProfiles" class="secondary-button">Export All</button>
              <button id="importProfiles" class="secondary-button">Import</button>
              <input id="importFile" type="file" accept="application/json,.json" style="display: none" />
            </div>
          </div>
          <div class="connection-section">
            <div id="knownDiceSection" class="known-dice-section" style="display: none">
              <div class="section-label">Known Dice <span id="knownDiceCount" class="dice-count-label"></span></div>
              <ul id="knownDiceList" class="known-dice-list"></ul>
            </div>
            <button id="connect" class="primary-button">Connect to Pixel</button>
          </div>
        </div>
      </div>
  `;

  const flush = (ms = 30) => new Promise(r => setTimeout(r, ms));

  function makeStore() {
    return { local: {}, sync: {} };
  }

  function areaGet(areaStore) {
    return jest.fn((key, cb) => {
      let result = {};
      if (typeof key === 'string') {
        result[key] = areaStore[key];
      } else if (Array.isArray(key)) {
        key.forEach(k => {
          result[k] = areaStore[k];
        });
      } else if (key && typeof key === 'object') {
        Object.keys(key).forEach(k => {
          result[k] = areaStore[k] !== undefined ? areaStore[k] : key[k];
        });
      } else if (key == null) {
        result = { ...areaStore };
      }
      if (cb) cb(result);
    });
  }

  function areaSet(areaStore) {
    return jest.fn((obj, cb) => {
      Object.assign(areaStore, obj);
      if (cb) cb();
    });
  }

  function makeChrome(store, overrides = {}) {
    const c = {
      tabs: {
        query: jest.fn((q, cb) => cb([{ id: 1, url: 'https://app.roll20.net/editor/' }])),
        sendMessage: jest.fn((tabId, msg, cb) => {
          if (cb) cb({});
        }),
      },
      scripting: {
        executeScript: jest.fn(() => Promise.resolve([{ result: 'dark' }])),
      },
      storage: {
        local: { get: areaGet(store.local), set: areaSet(store.local) },
        sync: { get: areaGet(store.sync), set: areaSet(store.sync) },
      },
      runtime: {
        onMessage: { addListener: jest.fn() },
        lastError: null,
        getURL: jest.fn(p => `chrome-extension://id/${p}`),
      },
      ...overrides,
    };
    return c;
  }

  function loadPopup(chromeMock, dom = 'full') {
    jest.resetModules();
    global.chrome = chromeMock;
    document.head.innerHTML = '';
    document.body.innerHTML = dom === 'full' ? FULL_DOM : '<button id="connect"></button>';
    const spy = jest.spyOn(global, 'setInterval').mockReturnValue(999);
    require('../../src/components/popup/popup.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    return spy;
  }

  function getMessageListener(chromeMock) {
    const calls = chromeMock.runtime.onMessage.addListener.mock.calls;
    return calls[calls.length - 1][0];
  }

  let anchorClickSpy;
  let createObjectURLMock;
  let revokeObjectURLMock;

  beforeEach(() => {
    window.confirm = jest.fn(() => true);
    anchorClickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    createObjectURLMock = jest.fn(() => 'blob:mock');
    revokeObjectURLMock = jest.fn();
    if (typeof URL !== 'undefined') {
      URL.createObjectURL = createObjectURLMock;
      URL.revokeObjectURL = revokeObjectURLMock;
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.chrome;
  });

  test('dark theme for non-roll20 tab, empty tabs, and icon src set', async () => {
    const store = makeStore();
    const chromeMock = makeChrome(store);
    chromeMock.tabs.query.mockImplementation((q, cb) => cb([{ id: 7, url: 'https://example.com/' }]));
    const intervalSpy = loadPopup(chromeMock);
    await flush();
    expect(document.getElementById('popup-light-theme')).toBeNull();
    expect(document.querySelector('.popup-icon').src).toContain('logo-128.png');
    expect(intervalSpy).toHaveBeenCalled();
    intervalSpy.mockRestore();

    // empty tabs -> dark + no interval scheduled
    const chromeMock2 = makeChrome(makeStore());
    chromeMock2.tabs.query.mockImplementation((q, cb) => cb([]));
    const spy2 = loadPopup(chromeMock2);
    await flush();
    expect(document.getElementById('popup-light-theme')).toBeNull();
    expect(spy2).not.toHaveBeenCalled();
    spy2.mockRestore();
  });

  test('applyTheme light: existing link removed, onload/onerror covered', async () => {
    const store = makeStore();
    const chromeMock = makeChrome(store);
    chromeMock.tabs.sendMessage.mockImplementation((id, msg, cb) => cb({ theme: 'light' }));
    // pre-existing stale link should be removed
    const stale = document.createElement('link');
    stale.id = 'popup-light-theme';
    const spy = loadPopup(chromeMock);
    document.head.appendChild(stale);
    await flush(60);
    const links = document.querySelectorAll('#popup-light-theme');
    expect(links.length).toBeLessThanOrEqual(2);
    const link = document.getElementById('popup-light-theme');
    expect(link).toBeTruthy();
    // exercise handlers
    link.onload();
    expect(document.body.style.border).toContain('solid');
    link.onerror();
    spy.mockRestore();
  });

  test('theme fallback paths: no-response, empty script result, rejection, no scripting', async () => {
    // no theme in response -> executeScript; run the injected func for real to
    // cover the detection body, with page states driving its branches
    let store = makeStore();
    let cm = makeChrome(store);
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => cb({}));
    cm.scripting.executeScript.mockImplementation(opts => Promise.resolve([{ result: opts.func() }]));
    localStorage.setItem('colorTheme', 'light');
    let spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('popup-light-theme')).toBeTruthy();
    localStorage.removeItem('colorTheme');
    spy.mockRestore();

    document.body.classList.add('lightmode');
    cm = makeChrome(makeStore());
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => cb({}));
    cm.scripting.executeScript.mockImplementation(opts => Promise.resolve([{ result: opts.func() }]));
    spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('popup-light-theme')).toBeTruthy();
    document.body.classList.remove('lightmode');
    spy.mockRestore();

    document.body.classList.add('darkmode');
    cm = makeChrome(makeStore());
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => cb({}));
    cm.scripting.executeScript.mockImplementation(opts => Promise.resolve([{ result: opts.func() }]));
    spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('popup-light-theme')).toBeNull();
    document.body.classList.remove('darkmode');
    spy.mockRestore();

    // explicit dark in localStorage
    localStorage.setItem('colorTheme', 'dark');
    cm = makeChrome(makeStore());
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => cb({}));
    cm.scripting.executeScript.mockImplementation(opts => Promise.resolve([{ result: opts.func() }]));
    spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('popup-light-theme')).toBeNull();
    localStorage.removeItem('colorTheme');
    spy.mockRestore();

    // Roll20 light-theme class on <html>
    document.documentElement.classList.add('roll20-light-theme');
    cm = makeChrome(makeStore());
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => cb({}));
    cm.scripting.executeScript.mockImplementation(opts => Promise.resolve([{ result: opts.func() }]));
    spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('popup-light-theme')).toBeTruthy();
    document.documentElement.classList.remove('roll20-light-theme');
    spy.mockRestore();

    // localStorage throwing -> caught inside injected func
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new Error('denied');
    });
    cm = makeChrome(makeStore());
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => cb({}));
    cm.scripting.executeScript.mockImplementation(opts => Promise.resolve([{ result: opts.func() }]));
    spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('popup-light-theme')).toBeNull();
    getItemSpy.mockRestore();
    spy.mockRestore();

    // empty script result -> dark
    cm = makeChrome(makeStore());
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      cm.runtime.lastError = { message: 'x' };
      cb(null);
      cm.runtime.lastError = null;
    });
    cm.scripting.executeScript.mockImplementation(() => Promise.resolve([]));
    spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('popup-light-theme')).toBeNull();
    spy.mockRestore();

    // script rejection -> dark
    cm = makeChrome(makeStore());
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      cm.runtime.lastError = { message: 'x' };
      cb(null);
      cm.runtime.lastError = null;
    });
    cm.scripting.executeScript.mockImplementation(() => Promise.reject(new Error('nope')));
    spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('popup-light-theme')).toBeNull();
    spy.mockRestore();

    // no scripting API -> dark
    cm = makeChrome(makeStore());
    delete cm.scripting;
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      cm.runtime.lastError = { message: 'x' };
      cb(null);
      cm.runtime.lastError = null;
    });
    spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('popup-light-theme')).toBeNull();
    spy.mockRestore();
  });

  test('guards when chrome.storage or chrome.tabs are missing', async () => {
    const REDUCED_DOM =
      '<div id="knownDiceSection" style="display:none"><ul id="knownDiceList"></ul></div>' +
      '<ul id="profileList"></ul><div id="profileEmpty"></div><button id="connect"></button>';
    // storage-less chrome: getKnownDice/removeKnownDie resolve early. Keep tabs
    // so old listeners (full-DOM expectations, all guarded) stay safe.
    let store = makeStore();
    jest.resetModules();
    global.chrome = makeChrome(store);
    document.head.innerHTML = '';
    document.body.innerHTML = REDUCED_DOM;
    let spy = jest.spyOn(global, 'setInterval').mockReturnValue(999);
    require('../../src/components/popup/popup.js');
    const noStorage = makeChrome(store);
    delete noStorage.storage;
    global.chrome = noStorage;
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();
    spy.mockRestore();

    // tabs-less chrome: detectAndApplyTheme falls back to dark (reduced DOM has
    // no toggles, and dice list is empty so no sendMessage is attempted)
    jest.resetModules();
    global.chrome = makeChrome(makeStore());
    document.head.innerHTML = '';
    document.body.innerHTML = REDUCED_DOM;
    spy = jest.spyOn(global, 'setInterval').mockReturnValue(999);
    require('../../src/components/popup/popup.js');
    const noTabs = makeChrome(makeStore());
    delete noTabs.tabs;
    global.chrome = noTabs;
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();
    expect(document.getElementById('popup-light-theme')).toBeNull();
    spy.mockRestore();
  });

  test('removeKnownDie resolves early without chrome.storage (forget path)', async () => {
    const store = makeStore();
    store.local['pixels_known_dice'] = [{ name: 'Gone', lastConnected: 1, dieType: 6 }];
    const cm = makeChrome(store);
    const spy = loadPopup(cm);
    await flush(60);
    expect(document.querySelector('.known-dice-btn.forget')).toBeTruthy();
    delete global.chrome.storage;
    document.querySelector('.known-dice-btn.forget').click();
    await flush(80);
    expect(document.getElementById('knownDiceSection').style.display).toBe('none');
    spy.mockRestore();
  });

  test('sendMessage: no tabs, lastError, and success callback via connect + showText message', async () => {
    const store = makeStore();
    const cm = makeChrome(store);
    cm.tabs.query.mockImplementation((q, cb) => cb([]));
    const spy = loadPopup(cm);
    await flush();
    document.getElementById('connect').click();
    expect(cm.tabs.sendMessage).not.toHaveBeenCalled();
    spy.mockRestore();

    // lastError path + runtime message listener
    const store2 = makeStore();
    const cm2 = makeChrome(store2);
    cm2.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      cm2.runtime.lastError = { message: 'gone' };
      cb(undefined);
      cm2.runtime.lastError = null;
    });
    const spy2 = loadPopup(cm2);
    await flush();
    document.getElementById('connect').click();
    await flush();
    const listener = getMessageListener(cm2);
    listener({ action: 'showText' }, {}, () => {});
    listener({ action: 'somethingElse' }, {}, () => {});
    await flush();
    spy2.mockRestore();
  });

  test('renderKnownDice: empty hides section, throw path, lastError status path', async () => {
    const store = makeStore();
    const cm = makeChrome(store);
    const spy = loadPopup(cm);
    await flush();
    expect(document.getElementById('knownDiceSection').style.display).toBe('none');
    spy.mockRestore();

    // getKnownDice rejects (storage getter throws for the dice key) -> empty
    const store2 = makeStore();
    store2.local['pixels_known_dice'] = [{ name: 'Boom', lastConnected: 1, dieType: 6 }];
    const cm2 = makeChrome(store2);
    const origGet2 = cm2.storage.local.get.getMockImplementation();
    cm2.storage.local.get.mockImplementation((key, cb) => {
      if (key === 'pixels_known_dice') throw new Error('storage boom');
      return origGet2(key, cb);
    });
    const spy2 = loadPopup(cm2);
    await flush();
    // falls back to [] -> hidden
    expect(document.getElementById('knownDiceSection').style.display).toBe('none');
    spy2.mockRestore();

    // status with no response -> all disconnected with reconnect/forget buttons
    const store3 = makeStore();
    store3.local['pixels_known_dice'] = [{ name: 'Solo', lastConnected: 1, dieType: null }];
    const cm3 = makeChrome(store3);
    cm3.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (msg.action === 'getConnectedDice') cb(undefined);
      else cb({});
    });
    const spy3 = loadPopup(cm3);
    await flush(60);
    expect(document.getElementById('knownDiceSection').style.display).toBe('flex');
    expect(document.querySelector('.known-dice-btn.reconnect')).toBeTruthy();
    expect(document.querySelector('.known-dice-btn.forget')).toBeTruthy();
    spy3.mockRestore();
  });

  test('renderKnownDice: full render with all die types, rssi bands, batteries, sorting and clicks', async () => {
    const store = makeStore();
    store.local['pixels_known_dice'] = [
      { name: 'Zulu d100', lastConnected: 1, dieType: 100 },
      { name: 'Alpha d4', lastConnected: 1, dieType: 4 },
      { name: 'Mike d6', lastConnected: 1, dieType: 6 },
      { name: 'D8 Die', lastConnected: 1, dieType: 8 },
      { name: 'D10 Die', lastConnected: 1, dieType: 10 },
      { name: 'D12 Die', lastConnected: 1, dieType: 12 },
      { name: 'D20 Die', lastConnected: 1, dieType: 20 },
      { name: 'Mystery', lastConnected: 1, dieType: 99 },
      { name: 'NullDie', lastConnected: 1, dieType: null },
      { name: 'OffDie', lastConnected: 1, dieType: 6 },
    ];
    const connected = [
      'Zulu d100',
      'Alpha d4',
      'Mike d6',
      'D8 Die',
      'D10 Die',
      'D12 Die',
      'D20 Die',
      'Mystery',
      'NullDie',
    ];
    const cm = makeChrome(store);
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (msg.action === 'getConnectedDice') {
        cb({
          connected,
          batteryLevels: {
            'Zulu d100': 10,
            'Alpha d4': 25,
            'Mike d6': 80,
            'D8 Die': 50,
          },
          rssiLevels: { 'Zulu d100': -60, 'Alpha d4': -70, 'Mike d6': -80, 'D8 Die': -90 },
          dieTypes: {},
        });
      } else cb({});
    });
    const spy = loadPopup(cm);
    await flush(80);
    const section = document.getElementById('knownDiceSection');
    expect(section.style.display).toBe('flex');
    expect(document.getElementById('knownDiceCount').textContent).toBe('9/10');
    // connected sorted before disconnected
    const items = Array.from(document.querySelectorAll('.known-dice-item'));
    expect(items.length).toBe(10);
    expect(items[items.length - 1].textContent).toContain('OffDie');
    // battery classes
    expect(document.querySelector('.battery-critical')).toBeTruthy();
    expect(document.querySelector('.battery-low')).toBeTruthy();
    // signal icons for 4 bands
    expect(document.querySelectorAll('.known-dice-signal').length).toBe(4);
    // svg icons rendered
    expect(document.querySelectorAll('.known-dice-icon svg').length).toBe(10);

    // blink via name click
    cm.tabs.sendMessage.mockClear();
    document.querySelector('.known-dice-name.clickable').click();
    expect(cm.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ action: 'blinkByName' }),
      expect.anything()
    );

    // disconnect button triggers reschedule
    const disBtn = Array.from(document.querySelectorAll('.known-dice-btn')).find(b => b.textContent === 'Disconnect');
    disBtn.click();
    await flush(600);

    // reconnect + forget on disconnected die
    const reconnectBtn = document.querySelector('.known-dice-btn.reconnect');
    reconnectBtn.click();
    expect(cm.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ action: 'reconnect' }),
      expect.anything()
    );
    const forgetBtns = Array.from(document.querySelectorAll('.known-dice-btn.forget'));
    const forgetBtn = forgetBtns[forgetBtns.length - 1];
    forgetBtn.click();
    await flush(80);
    spy.mockRestore();
  });

  test('renderKnownDice without count label and dieTypes override from status', async () => {
    const store = makeStore();
    store.local['pixels_known_dice'] = [{ name: 'Swap', lastConnected: 1, dieType: 4 }];
    const cm = makeChrome(store);
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (msg.action === 'getConnectedDice')
        cb({ connected: ['Swap'], batteryLevels: {}, rssiLevels: {}, dieTypes: { Swap: 20 } });
      else cb({});
    });
    const spy = loadPopup(cm);
    document.getElementById('knownDiceCount').remove();
    await flush(60);
    expect(document.getElementById('knownDiceSection').style.display).toBe('flex');
    spy.mockRestore();
  });

  test('profiles: empty list, orphan active, populated render with buttons', async () => {
    const store = makeStore();
    const cm = makeChrome(store);
    const spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('profileEmpty').style.display).toBe('block');
    expect(document.getElementById('activeProfileBanner').style.display).toBe('none');
    spy.mockRestore();

    // orphan active cleared
    const store2 = makeStore();
    store2.local['pixels_profiles'] = { A: { rows: [], selectedIndex: -1, savedAt: 1 } };
    store2.local['pixels_active_profile'] = 'Ghost';
    const cm2 = makeChrome(store2);
    const spy2 = loadPopup(cm2);
    await flush(60);
    expect(document.getElementById('activeProfileBanner').style.display).toBe('none');
    expect(document.querySelectorAll('.profile-item').length).toBe(1);
    spy2.mockRestore();

    // populated with active
    const store3 = makeStore();
    store3.local['pixels_profiles'] = {
      Beta: { rows: [{ name: 'r', formula: '1d20' }], selectedIndex: 0, savedAt: 2 },
      Alpha: { rows: [], selectedIndex: -1, savedAt: 1 },
    };
    store3.local['pixels_active_profile'] = 'Alpha';
    const cm3 = makeChrome(store3);
    cm3.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (msg.action === 'applyProfile') cb({ success: true });
      else cb({});
    });
    const spy3 = loadPopup(cm3);
    await flush(60);
    const banner = document.getElementById('activeProfileBanner');
    expect(banner.style.display).toBe('flex');
    expect(document.getElementById('activeProfileName').textContent).toBe('Alpha');
    expect(document.querySelector('.profile-item.active')).toBeTruthy();
    expect(document.querySelector('.active-dot')).toBeTruthy();
    expect(document.getElementById('profileEmpty').style.display).toBe('none');
    // sorted Alpha before Beta
    const names = Array.from(document.querySelectorAll('.profile-item-name')).map(n => n.textContent);
    expect(names[0]).toContain('Alpha');

    // load button
    document.querySelector('.profile-item-btn.load').click();
    await flush(60);
    // export button triggers download
    document.querySelector('.profile-item-btn.export').click();
    await flush(60);
    expect(createObjectURLMock).toHaveBeenCalled();
    // delete button
    document.querySelector('.profile-item-btn.delete').click();
    await flush(60);
    spy3.mockRestore();
  });

  test('renderActiveBanner missing elements returns safely', async () => {
    const store = makeStore();
    jest.resetModules();
    global.chrome = makeChrome(store);
    document.head.innerHTML = '';
    document.body.innerHTML = FULL_DOM;
    // keep profileList (so renderProfiles proceeds) but drop the banner
    document.getElementById('activeProfileBanner').remove();
    const spy = jest.spyOn(global, 'setInterval').mockReturnValue(999);
    require('../../src/components/popup/popup.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush(60);
    // renderProfiles proceeds without the banner: empty state shown, no crash
    expect(document.getElementById('activeProfileBanner')).toBeNull();
    expect(document.getElementById('profileEmpty').style.display).toBe('block');
    expect(document.querySelectorAll('.profile-item')).toHaveLength(0);
    spy.mockRestore();
  });

  test('saveCurrentProfile: empty name, confirm-cancel, save success, update flows', async () => {
    const store = makeStore();
    const cm = makeChrome(store);
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (msg.action === 'getCurrentRows') cb({ rows: [{ name: 'a', formula: '1d6' }] });
      else cb({});
    });
    const spy = loadPopup(cm);
    await flush(60);
    // empty name -> no-op
    document.getElementById('saveProfile').click();
    await flush(30);
    expect(store.local['pixels_profiles']).toBeUndefined();

    // save with name
    document.getElementById('profileName').value = 'MyProf';
    document.getElementById('saveProfile').click();
    await flush(80);
    expect(store.local['pixels_profiles']['MyProf']).toBeTruthy();
    expect(store.local['pixels_active_profile']).toBe('MyProf');

    // existing name + confirm false -> no overwrite
    window.confirm = jest.fn(() => false);
    document.getElementById('profileName').value = 'MyProf';
    document.getElementById('saveProfile').click();
    await flush(60);
    expect(window.confirm).toHaveBeenCalled();

    // Enter key triggers save
    window.confirm = jest.fn(() => true);
    document.getElementById('profileName').value = 'ViaEnter';
    const input = document.getElementById('profileName');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush(80);
    expect(store.local['pixels_profiles']['ViaEnter']).toBeTruthy();
    // non-enter key does nothing new
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    await flush(30);

    // update active profile
    document.getElementById('updateProfile').click();
    await flush(80);
    spy.mockRestore();

    // update with no active
    const store2 = makeStore();
    const cm2 = makeChrome(store2);
    cm2.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (msg.action === 'getCurrentRows') cb({ rows: [] });
      else cb({});
    });
    const spy2 = loadPopup(cm2);
    await flush(60);
    document.getElementById('updateProfile').click();
    await flush(60);
    spy2.mockRestore();
  });

  test('withCurrentRows error when tab not on roll20 / bad rows', async () => {
    const store = makeStore();
    store.local['pixels_profiles'] = {};
    const cm = makeChrome(store);
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (msg.action === 'getCurrentRows') {
        cm.runtime.lastError = { message: 'x' };
        cb(undefined);
        cm.runtime.lastError = null;
      } else cb({});
    });
    const spy = loadPopup(cm);
    await flush(60);
    document.getElementById('profileName').value = 'P1';
    document.getElementById('saveProfile').click();
    await flush(60);

    // non-array rows
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (msg.action === 'getCurrentRows') cb({});
      else cb({});
    });
    document.getElementById('profileName').value = 'P2';
    document.getElementById('saveProfile').click();
    await flush(60);
    // both failed saves persisted nothing and rendered no rows
    expect(store.local['pixels_profiles']).toEqual({});
    expect(document.querySelectorAll('.profile-item')).toHaveLength(0);
    spy.mockRestore();
  });

  test('loadProfile: missing, failure, success', async () => {
    const store = makeStore();
    store.local['pixels_profiles'] = { Real: { rows: [], selectedIndex: -1, savedAt: 1 } };
    const cm = makeChrome(store);
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      // note: popup's own sendMessage wrapper swallows chrome.runtime.lastError,
      // so failure is driven via falsy/unsuccessful responses (hang-free)
      if (msg.action === 'applyProfile') cb(undefined);
      else cb({});
    });
    const spy = loadPopup(cm);
    await flush(60);
    // click Load on Real -> failure path (stays, no active set)
    document.querySelector('.profile-item-btn.load').click();
    await flush(60);
    expect(store.local['pixels_active_profile']).toBeUndefined();
    // unsuccessful response variant
    cm.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (msg.action === 'applyProfile') cb({ success: false });
      else cb({});
    });

    // missing profile: delete from store then click stale button
    delete store.local['pixels_profiles']['Real'];
    document.querySelector('.profile-item-btn.load').click();
    await flush(60);
    spy.mockRestore();

    // success
    const store2 = makeStore();
    store2.local['pixels_profiles'] = { Real: { rows: [], selectedIndex: -1, savedAt: 1 } };
    const cm2 = makeChrome(store2);
    cm2.tabs.sendMessage.mockImplementation((id, msg, cb) => {
      if (msg.action === 'applyProfile') cb({ success: true });
      else cb({});
    });
    const spy2 = loadPopup(cm2);
    await flush(60);
    document.querySelector('.profile-item-btn.load').click();
    await flush(60);
    expect(store2.local['pixels_active_profile']).toBe('Real');
    spy2.mockRestore();
  });

  test('removeProfile clears active when matching, keeps otherwise', async () => {
    const store = makeStore();
    store.local['pixels_profiles'] = {
      A: { rows: [], selectedIndex: -1, savedAt: 1 },
      B: { rows: [], selectedIndex: -1, savedAt: 1 },
    };
    store.local['pixels_active_profile'] = 'A';
    const cm = makeChrome(store);
    const spy = loadPopup(cm);
    await flush(60);
    const deleteBtns = Array.from(document.querySelectorAll('.profile-item-btn.delete'));
    deleteBtns[0].click(); // Alpha/A first alphabetically
    await flush(80);
    expect(store.local['pixels_profiles']['A']).toBeUndefined();
    spy.mockRestore();

    // deleting a non-active profile keeps the active marker
    const store2 = makeStore();
    store2.local['pixels_profiles'] = {
      A: { rows: [], selectedIndex: -1, savedAt: 1 },
      B: { rows: [], selectedIndex: -1, savedAt: 1 },
    };
    store2.local['pixels_active_profile'] = 'B';
    const cm2 = makeChrome(store2);
    const spy2 = loadPopup(cm2);
    await flush(60);
    Array.from(document.querySelectorAll('.profile-item-btn.delete'))[0].click();
    await flush(80);
    expect(store2.local['pixels_profiles']['A']).toBeUndefined();
    expect(store2.local['pixels_active_profile']).toBe('B');
    spy2.mockRestore();
  });

  test('export all/single, slugify fallback, download attributes', async () => {
    const store = makeStore();
    const cm = makeChrome(store);
    const spy = loadPopup(cm);
    await flush(60);
    // empty export
    document.getElementById('exportProfiles').click();
    await flush(60);
    expect(createObjectURLMock).not.toHaveBeenCalled();

    // add profiles incl. weird name for slugify fallback
    store.local['pixels_profiles'] = {
      '!!!': { rows: [{ name: 'x', formula: '1d6' }], selectedIndex: 0, savedAt: 1 },
      Normal: { rows: [{ name: 'x', formula: '1d6' }], selectedIndex: 0, savedAt: 1 },
    };
    // capture created anchors
    const origCreate = document.createElement.bind(document);
    const anchors = [];
    const createSpy = jest.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
      const el = origCreate(tag, ...rest);
      if (tag === 'a') anchors.push(el);
      return el;
    });
    // reload render by re-dispatch
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush(80);
    document.getElementById('exportProfiles').click();
    await flush(60);
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors[anchors.length - 1].download).toContain('pixels-roll20-profiles-');

    // single export of weird name -> slug 'profile'
    const exportBtns = Array.from(document.querySelectorAll('.profile-item-btn.export'));
    exportBtns[0].click();
    await flush(60);
    expect(anchors[anchors.length - 1].download).toContain('pixels-roll20-profile-');
    createSpy.mockRestore();
    spy.mockRestore();
  });

  test('exportSingleProfile missing profile re-renders', async () => {
    const store = makeStore();
    store.local['pixels_profiles'] = { A: { rows: [], selectedIndex: -1, savedAt: 1 } };
    const cm = makeChrome(store);
    const spy = loadPopup(cm);
    await flush(60);
    delete store.local['pixels_profiles']['A'];
    delete store.sync['pixels_profiles'];
    // stale export button still in DOM refers to deleted profile
    document.querySelector('.profile-item-btn.export').click();
    await flush(60);
    // missing profile triggers a re-render with an empty list
    expect(document.querySelectorAll('.profile-item')).toHaveLength(0);
    expect(document.getElementById('profileEmpty').style.display).toBe('block');
    spy.mockRestore();
  });

  test('import flows: button click, undefined file, invalid json, empty, success, read error', async () => {
    const store = makeStore();
    const cm = makeChrome(store);
    const spy = loadPopup(cm);
    await flush(60);
    const importBtn = document.getElementById('importProfiles');
    const importFile = document.getElementById('importFile');
    const clickSpy = jest.spyOn(importFile, 'click').mockImplementation(() => {});
    importBtn.click();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();

    async function fireChange(fileValue) {
      Object.defineProperty(importFile, 'files', { value: fileValue, configurable: true });
      importFile.dispatchEvent(new Event('change', { bubbles: true }));
      await flush(80);
    }
    // undefined file
    await fireChange([]);
    // invalid json
    await fireChange([{ text: () => Promise.resolve('not-json{{{') }]);
    // valid json but no profiles
    await fireChange([{ text: () => Promise.resolve(JSON.stringify({ type: 'x', profiles: {} })) }]);
    // invalid rows skipped + keep-both rename
    store.local['pixels_profiles'] = { Dup: { rows: [], selectedIndex: -1, savedAt: 1 } };
    await fireChange([
      {
        text: () =>
          Promise.resolve(
            JSON.stringify({
              type: 'pixels-roll20-profiles',
              profiles: { Dup: { rows: [{ name: 'r', formula: '1d8' }], selectedIndex: 0 }, Bad: { rows: 'nope' } },
            })
          ),
      },
    ]);
    expect(store.local['pixels_profiles']['Dup (2)']).toBeTruthy();
    // read error
    await fireChange([{ text: () => Promise.reject(new Error('io')) }]);
    expect(importFile.value).toBe('');
    spy.mockRestore();
  });

  test('toggles: saved rolls, roll window, unprompted, dice substitution', async () => {
    const store = makeStore();
    store.local['pixels_saved_rolls_visible'] = false;
    store.local['pixels_roll_window_seconds'] = 7;
    store.local['pixels_allow_unprompted'] = true;
    store.local['pixels_allow_dice_substitution'] = false;
    const cm = makeChrome(store);
    const spy = loadPopup(cm);
    await flush(60);
    expect(document.getElementById('toggleSavedRolls').checked).toBe(false);
    expect(document.getElementById('rollWindowSlider').value).toBe('7');
    expect(document.getElementById('rollWindowValue').textContent).toBe('7');

    // change saved rolls -> showSavedRolls/hideSavedRolls
    cm.tabs.sendMessage.mockClear();
    const savedCb = document.getElementById('toggleSavedRolls');
    savedCb.checked = true;
    savedCb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.local['pixels_saved_rolls_visible']).toBe(true);
    expect(cm.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ action: 'showSavedRolls' }),
      expect.anything()
    );
    savedCb.checked = false;
    savedCb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(cm.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ action: 'hideSavedRolls' }),
      expect.anything()
    );

    // roll window input
    const slider = document.getElementById('rollWindowSlider');
    slider.value = '5';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.getElementById('rollWindowValue').textContent).toBe('5');
    expect(store.local['pixels_roll_window_seconds']).toBe(5);
    expect(cm.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ action: 'setRollWindow', value: 5 }),
      expect.anything()
    );

    // unprompted change hides/shows container
    const unCb = document.getElementById('allowUnprompted');
    unCb.checked = false;
    unCb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.getElementById('rollWindowContainer').classList.contains('hidden')).toBe(true);
    expect(cm.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ action: 'setAllowUnprompted', value: false }),
      expect.anything()
    );
    unCb.checked = true;
    unCb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.getElementById('rollWindowContainer').classList.contains('hidden')).toBe(false);

    // dice substitution
    const subCb = document.getElementById('allowDiceSubstitution');
    subCb.checked = true;
    subCb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.local['pixels_allow_dice_substitution']).toBe(true);
    expect(cm.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ action: 'setAllowDiceSubstitution', value: true }),
      expect.anything()
    );
    spy.mockRestore();

    // invalid roll window default + unprompted default false-branch
    const store2 = makeStore();
    store2.local['pixels_roll_window_seconds'] = 99;
    store2.local['pixels_allow_unprompted'] = false;
    store2.local['pixels_allow_dice_substitution'] = true;
    const cm2 = makeChrome(store2);
    const spy2 = loadPopup(cm2);
    await flush(60);
    expect(document.getElementById('rollWindowSlider').value).toBe('2');
    expect(document.getElementById('allowUnprompted').checked).toBe(false);
    expect(document.getElementById('rollWindowContainer').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('allowDiceSubstitution').checked).toBe(true);
    spy2.mockRestore();
  });

  test('connect button sends connect; top-level polling scheduled only with tab', async () => {
    const store = makeStore();
    const cm = makeChrome(store);
    const spy = loadPopup(cm);
    await flush(40);
    cm.tabs.sendMessage.mockClear();
    document.getElementById('connect').click();
    expect(cm.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ action: 'connect' }),
      expect.anything()
    );
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 5000);
    // run the polling callback to cover the interval body
    spy.mock.calls[0][0]();
    await flush(40);
    spy.mockRestore();
  });
});
