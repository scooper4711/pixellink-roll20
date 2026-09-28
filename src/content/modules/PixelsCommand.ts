/**
 * PixelsCommand.ts
 *
 * Intercepts /pixels, /pixel, or /pix commands in the Roll20 chat input.
 * Parses a dice formula using @3d-dice/dice-roller-parser, shows a prompt
 * overlay that collects physical dice rolls by type, handles dynamic
 * explosion/reroll slots, and posts the evaluated result when complete.
 */

'use strict';

import {
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
} from './FormulaEvaluator';
import type { PromptData, Slot } from './FormulaEvaluator';
import { containsRollQueries, resolveRollQueries } from './PixelsQueryModal';
import { hideOverlay, shakeOverlay, showPromptOverlay, updateOverlaySlots } from './PixelsPromptOverlay';
import type { RollBase } from '@3d-dice/dice-roller-parser';

const COMMAND_PATTERN = /^\/pix(?:els|el)?(?:\s+(.+))?$/i;
const GM_COMMAND_PATTERN = /^\/gmpix(?:els|el)?(?:\s+(.+))?$/i;

let pendingPrompt: PromptData | null = null;

/**
 * Start a prompted roll session from a parsed formula.
 */
function startPrompt(promptData: PromptData): void {
  pendingPrompt = promptData;
  showPromptOverlay(pendingPrompt, cancelPrompt);
}

const SUBSTITUTION_MAP: Record<number, number> = { 8: 4, 12: 6, 20: 10 };

function convertSubstitutedValue(faceValue: number, largerDieType: number): number {
  const half = largerDieType / 2;
  return faceValue > half ? faceValue - half : faceValue;
}

/**
 * Attempt to fill a slot with an incoming roll. Returns true if consumed.
 */
function offerRoll(dieType: number, faceValue: number): boolean {
  if (!pendingPrompt) {
    return false;
  }

  const slot = pendingPrompt.slots.find(s => s.value === null && s.type === dieType);

  if (slot) {
    return fillSlot(slot, faceValue);
  }

  // d100 (percentile) always works as d10
  if (dieType === 100) {
    const d10Slot = pendingPrompt.slots.find(s => s.value === null && s.type === 10);
    if (d10Slot) {
      const convertedValue = faceValue === 100 ? 10 : faceValue / 10;
      return fillSlot(d10Slot, convertedValue);
    }
  }

  // Die substitution if enabled
  if (window.pixelsAllowDiceSubstitution && dieType in SUBSTITUTION_MAP) {
    const smallerType = SUBSTITUTION_MAP[dieType];
    const exactSlotExists = pendingPrompt.slots.some(s => s.value === null && s.type === dieType);
    if (!exactSlotExists) {
      const substituteSlot = pendingPrompt.slots.find(s => s.value === null && s.type === smallerType);
      if (substituteSlot) {
        const convertedValue = convertSubstitutedValue(faceValue, dieType);
        return fillSlot(substituteSlot, convertedValue);
      }
    }
  }

  shakeOverlay();
  return true;
}

function fillSlot(slot: Slot, value: number): boolean {
  slot.value = value;

  const group = pendingPrompt!.groups[slot.groupIndex];
  if (checkExplosion(value, group)) {
    addExplosionSlot(pendingPrompt!, slot.groupIndex);
  }

  if (!slot.isReroll && checkReroll(value, group)) {
    markSlotForReroll(pendingPrompt!, pendingPrompt!.slots.indexOf(slot));
    updateOverlaySlots(pendingPrompt!);
    return true;
  }

  updateOverlaySlots(pendingPrompt!);

  const allFilled = pendingPrompt!.slots.every(s => s.value !== null);
  if (allFilled) {
    completePrompt();
  }

  return true;
}

function cancelPrompt(): void {
  pendingPrompt = null;
  hideOverlay();
}

function isPromptActive(): boolean {
  return pendingPrompt !== null;
}

function completePrompt(): void {
  const postChatMessage: (msg: string) => void = window.postChatMessage || function () {};
  const sendText: (txt: string) => void = window.sendTextToExtension || function () {};

  const formulaStr = pendingPrompt!.formula;
  const isWhisper = pendingPrompt!.whisper || false;
  const evaluationOrder = buildEvaluationOrder(pendingPrompt!);
  const result = evaluateWithValues(formulaStr, evaluationOrder);

  const formulaDisplay = getFormulaDisplay(formulaStr);
  const isSuccessRoll = isSuccessCountRoll(pendingPrompt!);
  const title = pendingPrompt!.title || 'Pixels Dice';

  const message = buildChatMessage(result, formulaDisplay, isSuccessRoll, title);

  if (isWhisper) {
    postChatMessage(`/w gm ${message}`);
  } else {
    postChatMessage(message);
  }

  const total = result.value;
  const whisperLabel = isWhisper ? ' (GM whisper)' : '';
  sendText(`Prompted roll: ${formulaDisplay} = ${total}${whisperLabel}`);

  pendingPrompt = null;
  hideOverlay();
}

function buildChatMessage(
  result: RollBase,
  formulaDisplay: string,
  isSuccessRoll: boolean,
  title = 'Pixels Dice'
): string {
  const diceDisplay = buildDiceDisplay(result);

  let resultValue: string;
  if (isSuccessRoll) {
    resultValue = `${result.value} success${result.value !== 1 ? 'es' : ''}`;
  } else {
    resultValue = `[[${result.value}]]`;
  }

  return (
    `&{template:default} {{name=${title}}}` +
    ` {{Rolling=${formulaDisplay}}}` +
    ` {{Dice=${diceDisplay}}}` +
    ` {{Result=${resultValue}}}`
  );
}

function buildDiceDisplay(result: RollBase): string {
  const parts: string[] = [];
  collectDiceDisplayParts(result, parts);
  return `( ${parts.join(' + ')} )`;
}

interface DiceRollNode extends RollBase {
  rolls?: Array<{
    roll: number;
    valid: boolean;
    explode?: boolean;
    success?: boolean;
  }>;
  dice?: RollBase[];
}

function formatRollPart(roll: { roll: number; valid: boolean; explode?: boolean; success?: boolean }): string {
  if (!roll.valid) {
    return `*(${roll.roll})*`;
  }
  if (roll.explode) {
    return `**${roll.roll}!**`;
  }
  if (roll.success === true) {
    return `**${roll.roll}**`;
  }
  if (roll.success === false) {
    return `*${roll.roll}*`;
  }
  return `${roll.roll}`;
}

function collectChildDiceParts(diceNode: DiceRollNode, parts: string[]): void {
  if (diceNode.dice) {
    for (const die of diceNode.dice) {
      collectDiceDisplayParts(die, parts);
    }
  }
}

function collectDiceDisplayParts(node: RollBase | null, parts: string[]): void {
  if (!node) {
    return;
  }

  const diceNode = node as DiceRollNode;

  if (node.type === 'die' && diceNode.rolls) {
    for (const roll of diceNode.rolls) {
      parts.push(formatRollPart(roll));
    }
    return;
  }

  if (node.type === 'expressionroll' || node.type === 'diceexpressionroll' || node.type === 'grouproll') {
    collectChildDiceParts(diceNode, parts);
  }
}

// --- Chat Interception ---

let chatObserver: MutationObserver | null = null;

function teardownChatInterception(): void {
  chatObserver?.disconnect();
  chatObserver = null;
}

function setupChatInterception(): () => void {
  // Stay idempotent across re-inits (content script + tests).
  teardownChatInterception();

  const attachIfPresent = (): boolean => {
    if (typeof document === 'undefined') {
      return false;
    }
    const chatInput = document.getElementById('textchat-input');
    if (chatInput && !chatInput.dataset.pixelsIntercepted) {
      chatInput.dataset.pixelsIntercepted = 'true';
      attachChatListeners(chatInput);
      return true;
    }
    return false;
  };

  const observer = new MutationObserver(() => {
    // jsdom/Jest may tear down `document` before queued callbacks run.
    if (typeof document === 'undefined') {
      observer.disconnect();
      if (chatObserver === observer) {
        chatObserver = null;
      }
      return;
    }
    if (attachIfPresent()) {
      observer.disconnect();
      if (chatObserver === observer) {
        chatObserver = null;
      }
    }
  });
  chatObserver = observer;

  if (typeof document === 'undefined' || !document.body) {
    return teardownChatInterception;
  }
  observer.observe(document.body, { childList: true, subtree: true });

  // Chat already present: attach now and don't leave the observer running.
  if (attachIfPresent()) {
    observer.disconnect();
    chatObserver = null;
  }

  return teardownChatInterception;
}

function attachChatListeners(chatInput: HTMLElement): void {
  const textarea = chatInput.querySelector('textarea');
  const button = chatInput.querySelector('button');

  if (textarea) {
    textarea.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          if (interceptCommand(textarea)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }
      },
      true
    );
  }

  if (button) {
    button.addEventListener(
      'click',
      (event: MouseEvent) => {
        const ta = chatInput.querySelector('textarea');
        if (ta && interceptCommand(ta)) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );
  }
}

function interceptCommand(textarea: HTMLTextAreaElement): boolean {
  const text = textarea.value.trim();

  let formulaStr: string | null | undefined = null;
  let isWhisper = false;

  const gmMatch = GM_COMMAND_PATTERN.exec(text);
  if (gmMatch) {
    formulaStr = gmMatch[1];
    isWhisper = true;
  } else {
    const match = COMMAND_PATTERN.exec(text);
    if (!match) {
      return false;
    }
    formulaStr = match[1];
  }

  if (!formulaStr) {
    textarea.value = '';
    const postChat: (msg: string) => void = window.postChatMessage || function () {};
    const prefix = isWhisper ? '/gmpixels' : '/pixels';
    postChat(
      `Usage: ${prefix} 2d6+1d8+3 — prompts you to roll physical dice. ` +
        'Supports: keep/drop (4d6kh3), count successes (8d6>5), ' +
        'exploding (2d6!), roll queries (?{Modifier|0}), and more.'
    );
    return true;
  }

  textarea.value = '';

  if (containsRollQueries(formulaStr)) {
    resolveRollQueries(
      formulaStr,
      resolved => processFormula(resolved, isWhisper),
      () => {}
    );
  } else {
    processFormula(formulaStr, isWhisper);
  }

  return true;
}

function processFormula(formulaStr: string, isWhisper: boolean, title?: string): void {
  const postChat: (msg: string) => void = window.postChatMessage || function () {};

  const ast = parseFormula(formulaStr);
  if (!ast) {
    postChat(`Invalid dice formula: ${formulaStr}`);
    return;
  }

  const promptData = buildSlotsFromAst(ast, formulaStr);
  if (promptData.slots.length === 0) {
    postChat(`No dice found in formula: ${formulaStr}`);
    return;
  }

  promptData.whisper = isWhisper;
  promptData.title = title;
  startPrompt(promptData);
}

function interceptFormula(formulaStr: string, title?: string): boolean {
  if (!formulaStr?.trim()) {
    return false;
  }

  const trimmed = formulaStr.trim();

  if (containsRollQueries(trimmed)) {
    resolveRollQueries(
      trimmed,
      resolved => processFormula(resolved, false, title),
      () => {}
    );
    return true;
  }

  const postChat: (msg: string) => void = window.postChatMessage || function () {};

  const ast = parseFormula(trimmed);
  if (!ast) {
    postChat(`Invalid dice formula: ${trimmed}`);
    return false;
  }

  const promptData = buildSlotsFromAst(ast, trimmed);
  if (promptData.slots.length === 0) {
    postChat(`No dice found in formula: ${trimmed}`);
    return false;
  }

  promptData.whisper = false;
  promptData.title = title;
  startPrompt(promptData);
  return true;
}

// --- Public API ---

const PixelsCommand = {
  setupChatInterception,
  teardownChatInterception,
  offerRoll,
  isPromptActive,
  cancelPrompt,
  parseFormula,
  interceptFormula,
};

export {
  setupChatInterception,
  teardownChatInterception,
  offerRoll,
  isPromptActive,
  cancelPrompt,
  parseFormula,
  interceptFormula,
};
export default PixelsCommand;

if (typeof window !== 'undefined') {
  window.PixelsCommand = PixelsCommand;
}
