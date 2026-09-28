'use strict';

export interface MessageResponse {
  success?: boolean;
  theme?: string;
  connected?: string[];
  batteryLevels?: Record<string, number>;
  rssiLevels?: Record<string, number>;
  dieTypes?: Record<string, number>;
  rows?: RowEntry[];
}

export type SendMessageCallback = (response: MessageResponse | undefined) => void;

export function showText(_message?: string): void {
  // Status messages are now handled by the Known Dice count label
}

// Send message to injected JS
export function sendMessage(data: Record<string, unknown>, responseCallback?: SendMessageCallback): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, data, (response: MessageResponse | undefined) => {
        if (chrome.runtime.lastError) {
          // Content script not available (tab not on Roll20, page not loaded, etc.)
          return;
        }
        if (responseCallback) {
          responseCallback(response);
        }
      });
    }
  });
}
