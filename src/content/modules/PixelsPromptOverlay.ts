/**
 * PixelsPromptOverlay.ts
 *
 * "Roll Your Dice" prompt overlay UI for the /pixels chat command flow.
 * Owns the overlay element; prompt lifecycle stays in PixelsCommand.
 */

'use strict';

import { getFormulaDisplay } from './FormulaEvaluator';
import type { PromptData } from './FormulaEvaluator';

// --- Overlay UI ---

let overlayElement: HTMLElement | null = null;

function createOverlayElement(onCancel: () => void): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'pixels-command-overlay';
  overlay.innerHTML = `
    <div class="pixels-cmd-header">
      <span class="pixels-cmd-title">Roll Your Dice</span>
      <button class="pixels-cmd-cancel" title="Cancel">✕</button>
    </div>
    <div class="pixels-cmd-formula"></div>
    <div class="pixels-cmd-slots"></div>
    <div class="pixels-cmd-hint">Roll the highlighted dice to fill each slot</div>
  `;
  overlay.querySelector('.pixels-cmd-cancel')!.addEventListener('click', onCancel);
  document.body.appendChild(overlay);
  injectOverlayStyles();
  return overlay;
}

export function showPromptOverlay(prompt: PromptData, onCancel: () => void): void {
  overlayElement ??= createOverlayElement(onCancel);
  overlayElement.style.display = 'block';

  const titleEl = overlayElement.querySelector('.pixels-cmd-title')!;
  titleEl.textContent = prompt.whisper ? 'Roll Your Dice (GM Only)' : 'Roll Your Dice';

  const formulaEl = overlayElement.querySelector('.pixels-cmd-formula')!;
  formulaEl.textContent = getFormulaDisplay(prompt.formula);

  updateOverlaySlots(prompt);
}

export function updateOverlaySlots(prompt: PromptData): void {
  if (!overlayElement) {
    return;
  }
  const slotsEl = overlayElement.querySelector('.pixels-cmd-slots')!;
  slotsEl.innerHTML = '';

  for (const slot of prompt.slots) {
    const slotDiv = document.createElement('div');
    const baseClass = 'pixels-cmd-slot';

    let stateClass: string;
    if (slot.value !== null) {
      stateClass = 'filled';
    } else if (slot.isReroll) {
      stateClass = 'reroll';
    } else if (slot.isExplosion) {
      stateClass = 'explosion';
    } else {
      stateClass = 'waiting';
    }

    slotDiv.className = `${baseClass} ${stateClass}`;

    const typeLabel = slot.type === 'fate' ? 'dF' : `d${slot.type}`;
    let decorator = '';
    if (slot.isExplosion) {
      decorator = '💥';
    }
    if (slot.isReroll) {
      decorator = '🔄';
    }

    if (slot.value !== null) {
      slotDiv.innerHTML =
        `<span class="slot-value">${slot.value}</span>` + `<span class="slot-type">${typeLabel}${decorator}</span>`;
    } else {
      slotDiv.innerHTML =
        `<span class="slot-placeholder">${decorator || '?'}</span>` + `<span class="slot-type">${typeLabel}</span>`;
    }

    slotsEl.appendChild(slotDiv);
  }
}

export function shakeOverlay(): void {
  if (!overlayElement) {
    return;
  }
  overlayElement.classList.remove('shake');
  // Force reflow so the shake animation restarts
  overlayElement.getBoundingClientRect();
  overlayElement.classList.add('shake');
}

export function hideOverlay(): void {
  if (overlayElement) {
    overlayElement.style.display = 'none';
    overlayElement.classList.remove('shake');
  }
}

function injectOverlayStyles(): void {
  if (document.getElementById('pixels-cmd-styles')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'pixels-cmd-styles';
  style.textContent = `
    #pixels-command-overlay { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000001; background: #2b2b2b; border: 2px solid #4a9eff; border-radius: 12px; padding: 20px; min-width: 280px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: Arial, sans-serif; color: #ffffff; display: none; }
    #pixels-command-overlay.shake { animation: pixels-shake 0.3s ease; }
    @keyframes pixels-shake { 0%, 100% { transform: translate(-50%, -50%); } 25% { transform: translate(calc(-50% - 8px), -50%); } 75% { transform: translate(calc(-50% + 8px), -50%); } }
    .pixels-cmd-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .pixels-cmd-title { font-size: 16px; font-weight: bold; }
    .pixels-cmd-cancel { background: none; border: 1px solid #666; border-radius: 4px; color: #ccc; font-size: 16px; cursor: pointer; padding: 2px 8px; }
    .pixels-cmd-cancel:hover { background: #5a2a2a; border-color: #f87171; color: #f87171; }
    .pixels-cmd-formula { text-align: center; font-size: 18px; font-weight: bold; color: #4a9eff; margin-bottom: 16px; }
    .pixels-cmd-slots { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 12px; }
    .pixels-cmd-slot { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 56px; height: 64px; border-radius: 8px; border: 2px solid #555; background: #1a1a1a; }
    .pixels-cmd-slot.waiting { border-color: #4a9eff; animation: pixels-pulse 1.5s infinite; }
    .pixels-cmd-slot.filled { border-color: #4ade80; background: #1a2e1a; }
    .pixels-cmd-slot.explosion { border-color: #f59e0b; animation: pixels-pulse-explosion 1.5s infinite; }
    .pixels-cmd-slot.reroll { border-color: #a855f7; animation: pixels-pulse-reroll 1.5s infinite; }
    @keyframes pixels-pulse { 0%, 100% { border-color: #4a9eff; } 50% { border-color: #2a6ecf; } }
    @keyframes pixels-pulse-explosion { 0%, 100% { border-color: #f59e0b; } 50% { border-color: #d97706; } }
    @keyframes pixels-pulse-reroll { 0%, 100% { border-color: #a855f7; } 50% { border-color: #7c3aed; } }
    .slot-placeholder { font-size: 24px; color: #666; }
    .slot-value { font-size: 22px; font-weight: bold; color: #4ade80; }
    .slot-type { font-size: 11px; color: #999; margin-top: 2px; }
    .pixels-cmd-hint { text-align: center; font-size: 12px; color: #888; }
  `;
  document.head.appendChild(style);
}
