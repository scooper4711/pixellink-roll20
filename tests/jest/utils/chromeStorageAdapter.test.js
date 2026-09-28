/**
 * @jest-environment jsdom
 */

const { ChromeStorageAdapter } = require('../../../src/utils/ChromeStorageAdapter.js');

const STORAGE_KEY = 'pixels_known_dice';

// In-memory chrome.storage.local mock (callback style).
function makeLocalArea(seed) {
  const store = seed ? { ...seed } : {};
  return {
    _store: store,
    get: jest.fn((key, cb) => {
      const result = {};
      if (typeof key === 'string' && key in store) {
        result[key] = store[key];
      }
      cb(result);
    }),
    set: jest.fn((obj, cb) => {
      Object.assign(store, obj);
      cb();
    }),
  };
}

const savedChrome = global.chrome;

beforeEach(() => {
  resetMocks();
  global.chrome = { ...savedChrome, storage: { local: makeLocalArea() } };
});

afterEach(() => {
  global.chrome = savedChrome;
  jest.restoreAllMocks();
});

describe('load', () => {
  test('resolves [] when chrome is undefined', async () => {
    global.chrome = undefined;
    expect(await new ChromeStorageAdapter().load()).toEqual([]);
  });

  test('resolves [] when chrome.storage is absent', async () => {
    global.chrome = { runtime: savedChrome.runtime };
    expect(await new ChromeStorageAdapter().load()).toEqual([]);
  });

  test('resolves [] when nothing was stored', async () => {
    expect(await new ChromeStorageAdapter().load()).toEqual([]);
  });

  test('maps stored dice, backfilling legacy entries without systemId', async () => {
    global.chrome.storage.local = makeLocalArea({
      [STORAGE_KEY]: [{ name: 'Red D20', systemId: 'sys-1', dieType: 20, lastConnected: 123 }, { name: 'Legacy D6' }],
    });

    const dice = await new ChromeStorageAdapter().load();

    expect(dice).toEqual([
      { name: 'Red D20', systemId: 'sys-1', dieType: 20, lastConnected: 123 },
      { name: 'Legacy D6', systemId: 'Legacy D6', dieType: null, lastConnected: 0 },
    ]);
  });

  test('defaults a null dieType entry to null and keeps falsy lastConnected as 0', async () => {
    global.chrome.storage.local = makeLocalArea({
      [STORAGE_KEY]: [{ name: 'Odd', systemId: 'sys-odd', dieType: null, lastConnected: 0 }],
    });

    const dice = await new ChromeStorageAdapter().load();
    expect(dice[0]).toEqual({ name: 'Odd', systemId: 'sys-odd', dieType: null, lastConnected: 0 });
  });
});

describe('save', () => {
  test('persists dice under the storage key (round-trips through load)', async () => {
    const adapter = new ChromeStorageAdapter();
    const dice = [{ name: 'Blue D20', systemId: 'sys-2', dieType: 20, lastConnected: 456 }];

    await adapter.save(dice);

    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: dice }, expect.any(Function));
    expect(global.chrome.storage.local._store[STORAGE_KEY]).toEqual(dice);
    expect(await adapter.load()).toEqual(dice);
  });

  test('resolves without throwing when chrome is undefined', async () => {
    global.chrome = undefined;
    await expect(
      new ChromeStorageAdapter().save([{ name: 'X', systemId: 'x', dieType: 6, lastConnected: 0 }])
    ).resolves.toBeUndefined();
  });

  test('resolves without throwing when chrome.storage is absent', async () => {
    global.chrome = { runtime: savedChrome.runtime };
    await expect(new ChromeStorageAdapter().save([])).resolves.toBeUndefined();
  });
});
