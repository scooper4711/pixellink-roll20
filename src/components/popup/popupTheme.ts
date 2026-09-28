'use strict';

import type { MessageResponse } from './popupMessaging';

// Simple theme detection and CSS loading
export function detectAndApplyTheme(): void {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
      const tabId = tabs[0]?.id;
      if (tabId !== undefined) {
        const tab = tabs[0];

        if (!(tab.url?.includes('roll20.net') || tab.url?.includes('app.roll20.net'))) {
          applyTheme('dark');
          return;
        }

        chrome.tabs.sendMessage(tabId, { action: 'getTheme' }, (response: MessageResponse | undefined) => {
          if (chrome.runtime.lastError) {
            executeThemeDetectionScript(tabId);
          } else if (response?.theme) {
            applyTheme(response.theme);
          } else {
            executeThemeDetectionScript(tabId);
          }
        });
      } else {
        applyTheme('dark');
      }
    });
  } else {
    applyTheme('dark');
  }
}

function executeThemeDetectionScript(tabId: number): void {
  if (chrome.scripting) {
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: (): string => {
          try {
            const roll20Theme = localStorage.getItem('colorTheme');
            if (roll20Theme === 'light') {
              return 'light';
            } else if (roll20Theme === 'dark') {
              return 'dark';
            }
          } catch (e) {
            console.warn('Direct script: Error accessing localStorage:', e);
          }

          const body = document.body;
          const html = document.documentElement;

          if (body.classList.contains('lightmode') || html.classList.contains('lightmode')) {
            return 'light';
          }

          if (body.classList.contains('roll20-light-theme') || html.classList.contains('roll20-light-theme')) {
            return 'light';
          }

          // Check for Roll20's actual theme classes
          if (body.classList.contains('darkmode') || html.classList.contains('darkmode')) {
            return 'dark';
          }

          // Log what we actually found
          console.warn('Direct script: No theme detected, defaulting to dark');
          console.warn('Direct script: All localStorage keys:', Object.keys(localStorage));

          // Default to dark theme
          return 'dark';
        },
      })
      .then((results: chrome.scripting.InjectionResult[]) => {
        if (results?.[0]?.result) {
          applyTheme(results[0].result as string);
        } else {
          applyTheme('dark');
        }
      })
      .catch((_error: unknown) => {
        applyTheme('dark');
      });
  } else {
    applyTheme('dark');
  }
}

function applyTheme(theme: string): void {
  const existingLightTheme = document.getElementById('popup-light-theme');
  if (existingLightTheme) {
    existingLightTheme.remove();
  }

  // Apply light theme if detected
  if (theme === 'light') {
    const lightThemeLink = document.createElement('link');
    lightThemeLink.id = 'popup-light-theme';
    lightThemeLink.rel = 'stylesheet';
    lightThemeLink.href = 'popup-light.css';

    lightThemeLink.onload = (): void => {
      document.body.style.border = '2px solid #007bff';
      setTimeout(() => {
        document.body.style.border = '';
      }, 2000);
    };

    lightThemeLink.onerror = (): void => {};

    document.head.appendChild(lightThemeLink);
  } else {
    // Add a visual indicator that dark theme is applied
    document.body.style.border = '2px solid #ff0000';
    setTimeout(() => {
      document.body.style.border = '';
    }, 2000);
  }
}
