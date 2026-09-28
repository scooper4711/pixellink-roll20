/**
 * popup.ts
 *
 * Extension popup entry point: wires UI controls, status polling, theme
 * detection, known-dice and profile rendering. Feature logic lives in the
 * sibling modules (popupMessaging, popupTheme, knownDice, profiles).
 */

'use strict';

import { sendMessage } from './popupMessaging';
import { detectAndApplyTheme } from './popupTheme';
import { renderKnownDice } from './knownDice';
import {
  saveCurrentProfile,
  updateActiveProfile,
  exportProfilesToFile,
  importProfilesFromFile,
  renderProfiles,
} from './profiles';

// Listen on messages from injected JS
chrome.runtime.onMessage.addListener(
  (
    request: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    _sendResponse: (response?: unknown) => void
  ) => {
    if (request.action === 'showText') {
      renderKnownDice();
    }
  }
);

// Initialize popup - content scripts are automatically injected by manifest
chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
  if (tabs[0]?.id) {
    // Request initial status from the content script
    sendMessage({ action: 'getStatus' });

    // Poll status every 5 seconds while popup is open to catch silent state changes
    setInterval(() => {
      sendMessage({ action: 'getStatus' });
      renderKnownDice();
    }, 5000);
  }
});

// Initialize theme detection when popup loads
document.addEventListener('DOMContentLoaded', () => {
  setupPopupIcon();
  setupConnectButton();
  setupSavedRollsToggle();
  setupUnpromptedControls();
  setupDiceSubstitutionToggle();
  setupProfilesUI();
  renderProfiles();
  renderKnownDice();

  detectAndApplyTheme();
});

function setupPopupIcon(): void {
  const iconElement = document.querySelector('.popup-icon') as HTMLImageElement | null;
  if (iconElement && typeof chrome !== 'undefined' && chrome.runtime) {
    iconElement.src = chrome.runtime.getURL('assets/images/logo-128.png');
  }
}

function setupConnectButton(): void {
  // Setup button event handlers directly to avoid tree-shaking
  const connectBtn = document.getElementById('connect');

  if (connectBtn) {
    connectBtn.onclick = (): void => {
      sendMessage({ action: 'connect' });
    };
  }
}

function setupSavedRollsToggle(): void {
  // Saved rolls panel toggle
  const toggleSavedRolls = document.getElementById('toggleSavedRolls') as HTMLInputElement | null;
  if (!toggleSavedRolls) {
    return;
  }
  // Load saved state
  chrome.storage.local.get('pixels_saved_rolls_visible', (result: Record<string, unknown>) => {
    toggleSavedRolls.checked = result.pixels_saved_rolls_visible !== false;
  });

  toggleSavedRolls.addEventListener('change', () => {
    const visible = toggleSavedRolls.checked;
    chrome.storage.local.set({ pixels_saved_rolls_visible: visible });
    sendMessage({
      action: visible ? 'showSavedRolls' : 'hideSavedRolls',
    });
  });
}

// Helper to show/hide the roll window slider based on unprompted state
function setRollWindowVisibility(container: HTMLElement | null, allowed: boolean): void {
  if (!container) {
    return;
  }
  if (allowed) {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

function setupRollWindowSlider(rollWindowSlider: HTMLInputElement | null, rollWindowValue: HTMLElement | null): void {
  if (!rollWindowSlider || !rollWindowValue) {
    return;
  }
  chrome.storage.local.get('pixels_roll_window_seconds', (result: Record<string, unknown>) => {
    const saved = result.pixels_roll_window_seconds;
    if (typeof saved === 'number' && saved >= 1 && saved <= 10) {
      rollWindowSlider.value = String(saved);
      rollWindowValue.textContent = String(saved);
    }
  });

  rollWindowSlider.addEventListener('input', () => {
    const seconds = Number.parseInt(rollWindowSlider.value, 10);
    rollWindowValue.textContent = String(seconds);
    chrome.storage.local.set({ pixels_roll_window_seconds: seconds });
    sendMessage({ action: 'setRollWindow', value: seconds });
  });
}

function setupUnpromptedControls(): void {
  // Unprompted rolls toggle (independent of saved rolls visibility)
  const allowUnpromptedCb = document.getElementById('allowUnprompted') as HTMLInputElement | null;
  const rollWindowContainer = document.getElementById('rollWindowContainer') as HTMLElement | null;
  const rollWindowSlider = document.getElementById('rollWindowSlider') as HTMLInputElement | null;
  const rollWindowValue = document.getElementById('rollWindowValue') as HTMLElement | null;

  setupRollWindowSlider(rollWindowSlider, rollWindowValue);

  if (!allowUnpromptedCb) {
    return;
  }
  // Load saved state
  chrome.storage.local.get('pixels_allow_unprompted', (result: Record<string, unknown>) => {
    const allowed = result.pixels_allow_unprompted !== false; // default true
    allowUnpromptedCb.checked = allowed;
    sendMessage({ action: 'setAllowUnprompted', value: allowed });
    setRollWindowVisibility(rollWindowContainer, allowed);
  });

  allowUnpromptedCb.addEventListener('change', () => {
    const allowed = allowUnpromptedCb.checked;
    chrome.storage.local.set({ pixels_allow_unprompted: allowed });
    sendMessage({ action: 'setAllowUnprompted', value: allowed });
    setRollWindowVisibility(rollWindowContainer, allowed);
  });
}

function setupDiceSubstitutionToggle(): void {
  // Dice substitution toggle
  const diceSubCb = document.getElementById('allowDiceSubstitution') as HTMLInputElement | null;
  if (!diceSubCb) {
    return;
  }
  chrome.storage.local.get('pixels_allow_dice_substitution', (result: Record<string, unknown>) => {
    const enabled = result.pixels_allow_dice_substitution === true;
    diceSubCb.checked = enabled;
    sendMessage({ action: 'setAllowDiceSubstitution', value: enabled });
  });

  diceSubCb.addEventListener('change', () => {
    const enabled = diceSubCb.checked;
    chrome.storage.local.set({ pixels_allow_dice_substitution: enabled });
    sendMessage({ action: 'setAllowDiceSubstitution', value: enabled });
  });
}

function setupImportControl(importBtn: HTMLElement | null, importFile: HTMLInputElement | null): void {
  if (!importBtn || !importFile) {
    return;
  }
  importBtn.onclick = (): void => {
    importFile.click();
  };
  importFile.addEventListener('change', () => {
    importProfilesFromFile(importFile.files?.[0]);
    importFile.value = ''; // allow re-importing the same file
  });
}

function setupProfilesUI(): void {
  // Profiles UI
  const saveProfileBtn = document.getElementById('saveProfile');
  if (saveProfileBtn) {
    saveProfileBtn.onclick = saveCurrentProfile;
  }
  const profileNameInput = document.getElementById('profileName');
  if (profileNameInput) {
    profileNameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        saveCurrentProfile();
      }
    });
  }
  const updateProfileBtn = document.getElementById('updateProfile');
  if (updateProfileBtn) {
    updateProfileBtn.onclick = updateActiveProfile;
  }
  const exportBtn = document.getElementById('exportProfiles');
  if (exportBtn) {
    exportBtn.onclick = exportProfilesToFile;
  }
  const importBtn = document.getElementById('importProfiles');
  const importFile = document.getElementById('importFile') as HTMLInputElement | null;
  setupImportControl(importBtn, importFile);
}
