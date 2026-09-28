/**
 * FormulaEvaluator Module Tests
 *
 * Tests for dice formula parsing, slot determination, explosion/reroll
 * conditions, and evaluation with predetermined physical dice values.
 */

const {
  parseFormula,
  buildSlotsFromAst,
  checkExplosion,
  checkReroll,
  addExplosionSlot,
  markSlotForReroll,
  evaluateWithValues,
  buildEvaluationOrder,
  isSuccessCountRoll,
  getFormulaDisplay,
  isValidFormula,
  normalizeOperators,
  walkForDice,
  compareValue,
  extractDieSize,
  extractCount,
  meetsExplosionTarget,
  meetsRerollTarget,
} = require('../../src/content/modules/FormulaEvaluator.js');

describe('normalizeOperators', () => {
  test('should convert >= to >', () => {
    expect(normalizeOperators('8d6>=5')).toBe('8d6>5');
  });

  test('should convert <= to <', () => {
    expect(normalizeOperators('8d6<=5')).toBe('8d6<5');
  });

  test('should leave other operators unchanged', () => {
    expect(normalizeOperators('2d6+3')).toBe('2d6+3');
    expect(normalizeOperators('8d6>5')).toBe('8d6>5');
  });
});

describe('parseFormula', () => {
  test('should return null for empty or blank input', () => {
    expect(parseFormula('')).toBeNull();
    expect(parseFormula('   ')).toBeNull();
  });

  test('should return null for invalid formulas', () => {
    expect(parseFormula('hello')).toBeNull();
    expect(parseFormula('d')).toBeNull();
  });

  test('should parse a simple die formula', () => {
    const ast = parseFormula('d20');
    expect(ast).not.toBeNull();
    expect(ast.type).toBe('die');
  });

  test('should parse a count plus modifier expression', () => {
    const ast = parseFormula('2d6+3');
    expect(ast).not.toBeNull();
    expect(ast.type).toBe('expression');
  });

  test('should trim surrounding whitespace', () => {
    const ast = parseFormula('  2d6  ');
    expect(ast).not.toBeNull();
  });
});

describe('extractDieSize', () => {
  test('should return numeric value for number nodes', () => {
    expect(extractDieSize({ type: 'number', value: 6 })).toBe(6);
  });

  test("should return 'fate' for fate nodes", () => {
    expect(extractDieSize({ type: 'fate' })).toBe('fate');
  });

  test('should return null for missing or unknown nodes', () => {
    expect(extractDieSize(undefined)).toBeNull();
    expect(extractDieSize({ type: 'expression' })).toBeNull();
  });
});

describe('extractCount', () => {
  test('should default to 1 when missing', () => {
    expect(extractCount(undefined)).toBe(1);
  });

  test('should return numeric value for number nodes', () => {
    expect(extractCount({ type: 'number', value: 4 })).toBe(4);
  });

  test('should default to 1 for non-number nodes', () => {
    expect(extractCount({ type: 'die' })).toBe(1);
  });
});

describe('compareValue', () => {
  test('should return false for null target', () => {
    expect(compareValue(5, '>', null)).toBe(false);
  });

  test('should compare with > and <', () => {
    expect(compareValue(6, '>', 5)).toBe(true);
    expect(compareValue(4, '>', 5)).toBe(false);
    expect(compareValue(4, '<', 5)).toBe(true);
    expect(compareValue(6, '<', 5)).toBe(false);
  });

  test('should compare with = >= <=', () => {
    expect(compareValue(5, '=', 5)).toBe(true);
    expect(compareValue(4, '=', 5)).toBe(false);
    expect(compareValue(5, '>=', 5)).toBe(true);
    expect(compareValue(5, '<=', 5)).toBe(true);
    expect(compareValue(6, '<=', 5)).toBe(false);
  });

  test('should fall back to equality for unknown operators', () => {
    expect(compareValue(5, '??', 5)).toBe(true);
    expect(compareValue(4, '??', 5)).toBe(false);
  });
});

describe('target value extraction (via meetsExplosionTarget)', () => {
  test('should read numeric value nodes', () => {
    const mod = { type: 'explode', target: { mod: '=', value: { type: 'number', value: 5 } } };
    expect(meetsExplosionTarget(5, 6, mod)).toBe(true);
    expect(meetsExplosionTarget(4, 6, mod)).toBe(false);
  });

  test('should read numeric expr nodes', () => {
    const mod = { type: 'explode', target: { mod: '=', expr: { type: 'number', value: 5 } } };
    expect(meetsExplosionTarget(5, 6, mod)).toBe(true);
    expect(meetsExplosionTarget(4, 6, mod)).toBe(false);
  });

  test('should not match when the target has no numeric value', () => {
    expect(meetsExplosionTarget(6, 6, { type: 'explode', target: {} })).toBe(false);
    expect(meetsExplosionTarget(6, 6, { type: 'explode', target: { value: { type: 'die' } } })).toBe(false);
  });
});

function makeGroup(overrides = {}) {
  return {
    dieSize: 6,
    count: 2,
    mods: [],
    targets: [],
    match: null,
    slotIndices: [0, 1],
    explosionMod: null,
    rerollMod: null,
    ...overrides,
  };
}

describe('meetsExplosionTarget', () => {
  test('should explode on max with no target', () => {
    expect(meetsExplosionTarget(6, 6, { type: 'explode' })).toBe(true);
    expect(meetsExplosionTarget(5, 6, { type: 'explode' })).toBe(false);
  });

  test('should compare against targeted value', () => {
    const mod = {
      type: 'explode',
      target: { mod: '>', expr: { type: 'number', value: 4 } },
    };
    expect(meetsExplosionTarget(5, 6, mod)).toBe(true);
    expect(meetsExplosionTarget(4, 6, mod)).toBe(false);
  });
});

describe('checkExplosion', () => {
  test('should return false with no explosion mod', () => {
    expect(checkExplosion(6, makeGroup())).toBe(false);
  });

  test('should explode on max roll', () => {
    const group = makeGroup({ explosionMod: { type: 'explode' } });
    expect(checkExplosion(6, group)).toBe(true);
    expect(checkExplosion(3, group)).toBe(false);
  });

  test('should stop exploding after the safety limit', () => {
    const group = makeGroup({
      explosionMod: { type: 'explode' },
      slotIndices: Array.from({ length: 22 }, (_, i) => i),
    });
    expect(checkExplosion(6, group)).toBe(false);
  });
});

describe('meetsRerollTarget', () => {
  test('should reroll on 1 with no target', () => {
    expect(meetsRerollTarget(1, 6, { type: 'reroll' })).toBe(true);
    expect(meetsRerollTarget(2, 6, { type: 'reroll' })).toBe(false);
  });

  test('should compare against targeted value', () => {
    const mod = {
      type: 'reroll',
      target: { mod: '=', expr: { type: 'number', value: 2 } },
    };
    expect(meetsRerollTarget(2, 6, mod)).toBe(true);
    expect(meetsRerollTarget(3, 6, mod)).toBe(false);
  });
});

describe('checkReroll', () => {
  test('should return false with no reroll mod', () => {
    expect(checkReroll(1, makeGroup())).toBe(false);
  });

  test('should reroll on 1', () => {
    const group = makeGroup({ rerollMod: { type: 'reroll' } });
    expect(checkReroll(1, group)).toBe(true);
    expect(checkReroll(5, group)).toBe(false);
  });
});

describe('buildSlotsFromAst', () => {
  test('should build two slots for 2d6', () => {
    const data = buildSlotsFromAst(parseFormula('2d6'), '2d6');
    expect(data.slots).toHaveLength(2);
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].dieSize).toBe(6);
    expect(data.formula).toBe('2d6');
  });

  test('should build one slot per group for mixed dice', () => {
    const data = buildSlotsFromAst(parseFormula('2d8+1d6'), '2d8+1d6');
    expect(data.groups).toHaveLength(2);
    expect(data.slots).toHaveLength(3);
    expect(data.slots[0].groupIndex).toBe(0);
    expect(data.slots[2].groupIndex).toBe(1);
  });

  test('should record explosion and reroll mods on the group', () => {
    const data = buildSlotsFromAst(parseFormula('2d6!'), '2d6!');
    expect(data.groups[0].explosionMod).not.toBeNull();
    expect(data.groups[0].explosionMod.type).toBe('explode');
  });
});

describe('walkForDice', () => {
  test('should ignore null nodes', () => {
    const slots = [];
    const groups = [];
    walkForDice(null, slots, groups);
    expect(slots).toHaveLength(0);
    expect(groups).toHaveLength(0);
  });

  test('should skip dice with zero count', () => {
    const slots = [];
    const groups = [];
    walkForDice(
      {
        type: 'die',
        die: { type: 'number', value: 6 },
        count: { type: 'number', value: 0 },
      },
      slots,
      groups
    );
    expect(slots).toHaveLength(0);
  });

  test('should skip dice with unknown size', () => {
    const slots = [];
    const groups = [];
    walkForDice({ type: 'die', count: { type: 'number', value: 2 } }, slots, groups);
    expect(slots).toHaveLength(0);
  });

  test('should walk group rolls', () => {
    const slots = [];
    const groups = [];
    walkForDice(
      {
        type: 'group',
        rolls: [{ type: 'die', die: { type: 'number', value: 8 }, count: undefined }],
      },
      slots,
      groups
    );
    expect(slots).toHaveLength(1);
  });

  test('should walk inline expressions', () => {
    const slots = [];
    const groups = [];
    walkForDice(
      {
        type: 'inline',
        expr: { type: 'die', die: { type: 'number', value: 4 }, count: undefined },
      },
      slots,
      groups
    );
    expect(slots).toHaveLength(1);
  });
});

describe('addExplosionSlot and markSlotForReroll', () => {
  test('should append an explosion slot and return its index', () => {
    const data = buildSlotsFromAst(parseFormula('2d6!'), '2d6!');
    const index = addExplosionSlot(data, 0);
    expect(index).toBe(2);
    expect(data.slots[2].isExplosion).toBe(true);
    expect(data.slots[2].value).toBeNull();
    expect(data.groups[0].slotIndices).toContain(2);
  });

  test('should clear the value and flag rerolls', () => {
    const data = buildSlotsFromAst(parseFormula('2d6'), '2d6');
    data.slots[0].value = 1;
    markSlotForReroll(data, 0);
    expect(data.slots[0].value).toBeNull();
    expect(data.slots[0].isReroll).toBe(true);
  });
});

describe('buildEvaluationOrder', () => {
  test('should list originals before explosions', () => {
    const data = buildSlotsFromAst(parseFormula('2d6!'), '2d6!');
    data.slots[0].value = 6;
    data.slots[1].value = 2;
    addExplosionSlot(data, 0);
    data.slots[2].value = 4;

    const order = buildEvaluationOrder(data);
    expect(order).toHaveLength(3);
    expect(order[0]).toEqual({ face: 6, dieSize: 6 });
    expect(order[1]).toEqual({ face: 2, dieSize: 6 });
    expect(order[2]).toEqual({ face: 4, dieSize: 6 });
  });
});

describe('isSuccessCountRoll', () => {
  test('should detect success counting formulas', () => {
    expect(isSuccessCountRoll(buildSlotsFromAst(parseFormula('8d6>5'), '8d6>5'))).toBe(true);
  });

  test('should return false for plain rolls', () => {
    expect(isSuccessCountRoll(buildSlotsFromAst(parseFormula('2d6'), '2d6'))).toBe(false);
  });
});

describe('getFormulaDisplay', () => {
  test('should trim the formula', () => {
    expect(getFormulaDisplay('  2d6+3  ')).toBe('2d6+3');
  });
});

describe('isValidFormula', () => {
  test('should accept formulas containing dice', () => {
    expect(isValidFormula('2d6+3')).toBe(true);
    expect(isValidFormula('d20')).toBe(true);
  });

  test('should reject invalid formulas and diceless expressions', () => {
    expect(isValidFormula('hello')).toBe(false);
    expect(isValidFormula('')).toBe(false);
    expect(isValidFormula('3+4')).toBe(false);
  });
});

describe('evaluateWithValues', () => {
  test('should evaluate using predetermined physical values', () => {
    const result = evaluateWithValues('2d6+3', [
      { face: 4, dieSize: 6 },
      { face: 2, dieSize: 6 },
    ]);
    expect(result.value).toBe(9);
  });

  test('should evaluate a single die', () => {
    const result = evaluateWithValues('d20', [{ face: 17, dieSize: 20 }]);
    expect(result.value).toBe(17);
  });

  test('should fall back to random values when physical values run out', () => {
    // Mock crypto so the fallback roll is deterministic (0 -> face 1).
    // Unmocked, the forked dice-roller-parser maps large random floats to
    // faces above the die size (e.g. 7 on a d6), making this test flaky.
    const spy = jest.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
      array[0] = 0;
      return array;
    });
    try {
      const result = evaluateWithValues('2d6', [{ face: 3, dieSize: 6 }]);
      expect(result.value).toBe(4);
    } finally {
      spy.mockRestore();
    }
  });
});
