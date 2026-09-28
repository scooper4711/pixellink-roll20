/**
 * roll20.ts - Main Pixels Roll20 Extension Content Script
 *
 * Coordinates all extension functionality and handles initialization.
 * This is the main entry point that loads and coordinates all other modules.
 */

import {
  initialize as initializePixelsBridge,
  connectToPixel,
  connectToPixelByName,
  disconnectAllPixels,
  getPixels,
  findPixelByName,
  diceManager,
} from './modules/PixelsBridge';
import { setupChatInterception } from './modules/PixelsCommand';
import { sendTextToExtension, sendStatusToExtension, setupMessageListener } from '../core/extensionMessaging';

if (window.roll20PixelsLoaded === undefined) {
  const _roll20PixelsLoaded = true;

  // Global settings
  window.pixelsAllowUnprompted = true;
  window.pixelsAllowDiceSubstitution = false;

  // Load saved unprompted setting
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get('pixels_allow_unprompted', result => {
      window.pixelsAllowUnprompted = result.pixels_allow_unprompted !== false;
    });
    chrome.storage.local.get('pixels_allow_dice_substitution', result => {
      window.pixelsAllowDiceSubstitution = result.pixels_allow_dice_substitution === true;
    });
  }

  // Initialize modules and set up message handling
  function initializeExtension(): void {
    const log = window.log || console.log;

    log('Starting Pixels Roll20 extension');

    function handleSetRollWindow(msg: Record<string, unknown>): void {
      if (window.RollBatcher && typeof msg.value === 'number') {
        window.RollBatcher.setWindowMs((msg.value as number) * 1000);
        try {
          localStorage.setItem('pixels_roll_window_seconds', String(msg.value));
        } catch {
          // localStorage unavailable
        }
      }
    }

    function handleGetCurrentRows(sendResponse: (response: unknown) => void): void {
      let rowsData: RowData | null = null;
      const box = window.ModifierBox?.getElement?.();
      if (box && window.ModifierBoxRowManager?.serializeRows) {
        rowsData = window.ModifierBoxRowManager.serializeRows(box);
      }
      if (!rowsData?.rows?.length) {
        try {
          const stored = localStorage.getItem('pixels_saved_rolls') || localStorage.getItem('pixels_modifier_rows');
          if (stored) {
            const parsed = JSON.parse(stored) as RowData;
            rowsData = {
              rows: parsed.rows || [],
              version: parsed.version || 1,
            };
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          log(`Could not read stored rows: ${message}`);
        }
      }
      sendResponse(rowsData || { rows: [], version: 2 });
    }

    function handleApplyProfile(msg: Record<string, unknown>, sendResponse: (response: unknown) => void): boolean {
      (async () => {
        try {
          if (window.ModifierBox?.show) {
            await window.ModifierBox.show();
          }
          const box = window.ModifierBox?.getElement?.();
          const ok =
            box && window.ModifierBoxRowManager?.applyProfileRows
              ? window.ModifierBoxRowManager.applyProfileRows(box, msg.profile as RowData)
              : false;
          sendResponse({ success: Boolean(ok) });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          log(`Error applying profile: ${message}`);
          sendResponse({ success: false, error: message });
        }
      })();
      return true;
    }

    function handleConnect(): void {
      (async () => {
        try {
          await connectToPixel();
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          log(`Error connecting to Pixel: ${message}`);
          if (typeof window.sendTextToExtension === 'function') {
            window.sendTextToExtension(`Failed to connect: ${message}`);
          }
        }
      })();
    }

    function handleReconnect(msg: Record<string, unknown>): void {
      (async () => {
        try {
          await connectToPixelByName(msg.name as string);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          log(`Error reconnecting to ${msg.name}: ${message}`);
          if (typeof window.sendTextToExtension === 'function') {
            window.sendTextToExtension(`Failed to reconnect to ${msg.name}: ${message}`);
          }
        }
      })();
    }

    function handleDisconnectByName(msg: Record<string, unknown>): void {
      const pixel = findPixelByName(msg.name as string);
      if (pixel) {
        pixel.disconnect().catch((err: Error) => log(`Disconnect failed for ${msg.name}: ${err.message}`));
      }
    }

    function handleBlinkByName(msg: Record<string, unknown>): void {
      const pixelToBlink = findPixelByName(msg.name as string);
      if (pixelToBlink?.isConnected) {
        pixelToBlink
          .blink({ r: 0xcc, g: 0x66, b: 0x00 })
          .catch((err: Error) => log(`Blink failed for ${msg.name}: ${err.message}`));
      }
    }

    function handleForgetByName(msg: Record<string, unknown>): void {
      const pixelToForget = findPixelByName(msg.name as string);
      if (pixelToForget) {
        diceManager
          .forget(pixelToForget.systemId)
          .catch((err: Error) => log(`Could not forget ${msg.name}: ${err.message}`));
      }
    }

    function handleGetConnectedDice(sendResponse: (response: unknown) => void): boolean {
      const connectedPixels = getPixels().filter(p => p.isConnected);
      const connected = connectedPixels.map(p => p.name);
      const batteryLevels: Record<string, number> = {};
      const dieTypes: Record<string, number> = {};
      const rssiLevels: Record<string, number> = {};
      connectedPixels.forEach(p => {
        if (p.batteryLevel !== null) {
          batteryLevels[p.name] = p.batteryLevel;
        }
        if (p.dieType !== null) {
          dieTypes[p.name] = p.dieType;
        }
        if (p.rssi !== null) {
          rssiLevels[p.name] = p.rssi;
        }
      });
      sendResponse({
        connected,
        batteryLevels,
        dieTypes,
        rssiLevels,
      });
      return true;
    }

    function handleGetTheme(sendResponse: (response: unknown) => void): boolean {
      const theme = window.ThemeDetector ? window.ThemeDetector.detectTheme() : 'dark';
      sendResponse({ theme: theme });
      return true;
    }

    initializePixelsBridge();
    setupChatInterception();

    window.connectToPixel = connectToPixel;
    window.connectToPixelByName = connectToPixelByName;
    window.disconnectAllPixels = disconnectAllPixels;
    window.getPixels = getPixels;
    window.sendTextToExtension = sendTextToExtension;
    window.sendStatusToExtension = sendStatusToExtension;

    setupMessageListener();

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      try {
        chrome.runtime.onMessage.addListener(
          (
            msg: Record<string, unknown> | null,
            _sender: chrome.runtime.MessageSender,
            sendResponse: (response: unknown) => void
          ) => {
            if (!msg || typeof msg !== 'object') {
              log(`Received invalid message: ${JSON.stringify(msg)}`);
              return;
            }

            switch (msg.action) {
              case 'getStatus':
                window.sendStatusToExtension().catch((error: unknown) => {
                  const message = error instanceof Error ? error.message : String(error);
                  log(`Error sending status to extension: ${message}`);
                });
                break;

              case 'showSavedRolls':
                window.showModifierBox();
                break;

              case 'hideSavedRolls':
                window.hideModifierBox();
                break;

              case 'setAllowUnprompted':
                window.pixelsAllowUnprompted = msg.value !== false;
                break;

              case 'setAllowDiceSubstitution':
                window.pixelsAllowDiceSubstitution = msg.value === true;
                break;

              case 'setRollWindow':
                handleSetRollWindow(msg);
                break;

              case 'getCurrentRows':
                handleGetCurrentRows(sendResponse);
                break;

              case 'applyProfile':
                return handleApplyProfile(msg, sendResponse);

              case 'connect':
                handleConnect();
                break;

              case 'reconnect':
                handleReconnect(msg);
                break;

              case 'disconnect':
                disconnectAllPixels();
                break;

              case 'disconnectByName':
                handleDisconnectByName(msg);
                break;

              case 'blinkByName':
                handleBlinkByName(msg);
                break;

              case 'forgetByName':
                handleForgetByName(msg);
                break;

              case 'getConnectedDice':
                return handleGetConnectedDice(sendResponse);

              case 'getTheme':
                return handleGetTheme(sendResponse);

              default:
                log(`Unknown action received: ${msg.action}`);
            }
          }
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log('Could not set up extension message listener:', message);
      }
    }
  }

  // Initialize after all modules are loaded
  function startExtension(): void {
    initializeExtension();

    window.sendStatusToExtension().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      window.log(`Error sending initial status to extension: ${message}`);
    });

    setTimeout(() => {
      try {
        if (window.isRoll20PopupWindow()) {
          window.log('Skipping saved rolls panel in popup window');
          return;
        }
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get('pixels_saved_rolls_visible', result => {
            if (result.pixels_saved_rolls_visible !== false) {
              window.showModifierBox();
            }
          });
        } else {
          window.showModifierBox();
        }
      } catch (error: unknown) {
        window.log(`Error showing saved rolls panel: ${error}`);
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startExtension);
  } else {
    setTimeout(startExtension, 100);
  }
}
