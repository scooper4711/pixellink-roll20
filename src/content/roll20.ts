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

  // Lazy logger: prefers the shared window.log hook, falls back to console.warn.
  function logExtensionMessage(message: string): void {
    const logger = window.log || console.warn;
    logger(message);
  }

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

  function readStoredRowsFromStorage(): RowData | null {
    try {
      const stored = localStorage.getItem('pixels_saved_rolls') || localStorage.getItem('pixels_modifier_rows');
      if (!stored) {
        return null;
      }
      const parsed = JSON.parse(stored) as RowData;
      return {
        rows: parsed.rows || [],
        version: parsed.version || 1,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logExtensionMessage(`Could not read stored rows: ${message}`);
      return null;
    }
  }

  function handleGetCurrentRows(sendResponse: (response: unknown) => void): void {
    let rowsData: RowData | null = null;
    const box = window.ModifierBox?.getElement?.();
    if (box && window.ModifierBoxRowManager?.serializeRows) {
      rowsData = window.ModifierBoxRowManager.serializeRows(box);
    }
    if (!rowsData?.rows?.length) {
      rowsData = readStoredRowsFromStorage();
    }
    sendResponse(rowsData || { rows: [], version: 2 });
  }

  async function applyProfileAsync(
    msg: Record<string, unknown>,
    sendResponse: (response: unknown) => void
  ): Promise<void> {
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
      logExtensionMessage(`Error applying profile: ${message}`);
      sendResponse({ success: false, error: message });
    }
  }

  function handleApplyProfile(msg: Record<string, unknown>, sendResponse: (response: unknown) => void): boolean {
    (async () => {
      await applyProfileAsync(msg, sendResponse);
    })();
    return true;
  }

  function handleConnect(): void {
    (async () => {
      try {
        await connectToPixel();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logExtensionMessage(`Error connecting to Pixel: ${message}`);
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
        logExtensionMessage(`Error reconnecting to ${msg.name}: ${message}`);
        if (typeof window.sendTextToExtension === 'function') {
          window.sendTextToExtension(`Failed to reconnect to ${msg.name}: ${message}`);
        }
      }
    })();
  }

  function handleDisconnectByName(msg: Record<string, unknown>): void {
    const pixel = findPixelByName(msg.name as string);
    if (pixel) {
      pixel
        .disconnect()
        .catch((err: Error) => logExtensionMessage(`Disconnect failed for ${msg.name}: ${err.message}`));
    }
  }

  function handleBlinkByName(msg: Record<string, unknown>): void {
    const pixelToBlink = findPixelByName(msg.name as string);
    if (pixelToBlink?.isConnected) {
      pixelToBlink
        .blink({ r: 0xcc, g: 0x66, b: 0x00 })
        .catch((err: Error) => logExtensionMessage(`Blink failed for ${msg.name}: ${err.message}`));
    }
  }

  function handleForgetByName(msg: Record<string, unknown>): void {
    const pixelToForget = findPixelByName(msg.name as string);
    if (pixelToForget) {
      diceManager
        .forget(pixelToForget.systemId)
        .catch((err: Error) => logExtensionMessage(`Could not forget ${msg.name}: ${err.message}`));
    }
  }

  function collectPixelLevels(
    connectedPixels: ReturnType<typeof getPixels>,
    pick: (p: ReturnType<typeof getPixels>[number]) => number | null
  ): Record<string, number> {
    const levels: Record<string, number> = {};
    connectedPixels.forEach(p => {
      const level = pick(p);
      if (level !== null) {
        levels[p.name] = level;
      }
    });
    return levels;
  }

  function handleGetConnectedDice(sendResponse: (response: unknown) => void): boolean {
    const connectedPixels = getPixels().filter(p => p.isConnected);
    sendResponse({
      connected: connectedPixels.map(p => p.name),
      batteryLevels: collectPixelLevels(connectedPixels, p => p.batteryLevel),
      dieTypes: collectPixelLevels(connectedPixels, p => p.dieType),
      rssiLevels: collectPixelLevels(connectedPixels, p => p.rssi),
    });
    return true;
  }

  function handleGetTheme(sendResponse: (response: unknown) => void): boolean {
    const theme = window.ThemeDetector ? window.ThemeDetector.detectTheme() : 'dark';
    sendResponse({ theme: theme });
    return true;
  }

  function handleGetStatus(): undefined {
    window.sendStatusToExtension().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logExtensionMessage(`Error sending status to extension: ${message}`);
    });
    return undefined;
  }

  type ContentMessageHandler = (
    msg: Record<string, unknown>,
    sendResponse: (response: unknown) => void
  ) => boolean | undefined;

  const contentMessageHandlers: Record<string, ContentMessageHandler> = {
    getStatus: () => handleGetStatus(),
    showSavedRolls: () => {
      window.showModifierBox();
      return undefined;
    },
    hideSavedRolls: () => {
      window.hideModifierBox();
      return undefined;
    },
    setAllowUnprompted: msg => {
      window.pixelsAllowUnprompted = msg.value !== false;
      return undefined;
    },
    setAllowDiceSubstitution: msg => {
      window.pixelsAllowDiceSubstitution = msg.value === true;
      return undefined;
    },
    setRollWindow: msg => {
      handleSetRollWindow(msg);
      return undefined;
    },
    getCurrentRows: (_msg, sendResponse) => {
      handleGetCurrentRows(sendResponse);
      return undefined;
    },
    applyProfile: (msg, sendResponse) => handleApplyProfile(msg, sendResponse),
    connect: () => {
      handleConnect();
      return undefined;
    },
    reconnect: msg => {
      handleReconnect(msg);
      return undefined;
    },
    disconnect: () => {
      disconnectAllPixels();
      return undefined;
    },
    disconnectByName: msg => {
      handleDisconnectByName(msg);
      return undefined;
    },
    blinkByName: msg => {
      handleBlinkByName(msg);
      return undefined;
    },
    forgetByName: msg => {
      handleForgetByName(msg);
      return undefined;
    },
    getConnectedDice: (_msg, sendResponse) => handleGetConnectedDice(sendResponse),
    getTheme: (_msg, sendResponse) => handleGetTheme(sendResponse),
  };

  function dispatchContentMessage(
    msg: Record<string, unknown>,
    sendResponse: (response: unknown) => void
  ): boolean | undefined {
    const action = typeof msg.action === 'string' ? msg.action : '';
    const handler = contentMessageHandlers[action];
    if (!handler) {
      logExtensionMessage(`Unknown action received: ${String(msg.action)}`);
      return undefined;
    }
    return handler(msg, sendResponse);
  }

  function attachContentMessageListener(): void {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
      return;
    }
    try {
      chrome.runtime.onMessage.addListener(
        (
          msg: Record<string, unknown> | null,
          _sender: chrome.runtime.MessageSender,
          sendResponse: (response: unknown) => void
        ) => {
          if (!msg || typeof msg !== 'object') {
            logExtensionMessage(`Received invalid message: ${JSON.stringify(msg)}`);
            return undefined;
          }
          return dispatchContentMessage(msg, sendResponse);
        }
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Could not set up extension message listener:', message);
    }
  }

  // Initialize modules and set up message handling
  function initializeExtension(): void {
    logExtensionMessage('Starting Pixels Roll20 extension');

    initializePixelsBridge();
    setupChatInterception();

    window.connectToPixel = connectToPixel;
    window.connectToPixelByName = connectToPixelByName;
    window.disconnectAllPixels = disconnectAllPixels;
    window.getPixels = getPixels;
    window.sendTextToExtension = sendTextToExtension;
    window.sendStatusToExtension = sendStatusToExtension;

    setupMessageListener();
    attachContentMessageListener();
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
