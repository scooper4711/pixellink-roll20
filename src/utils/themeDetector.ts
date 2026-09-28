// Theme detection utility for Roll20
// This file contains functions to detect Roll20's current theme and monitor changes

'use strict';

// Parse color string to RGB values
export const parseColor = (colorStr: string | null): RGBColor | null => {
  if (!colorStr) {
    return null;
  }

  // Handle rgb() format
  const rgbMatch = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(colorStr);
  if (rgbMatch) {
    return {
      r: Number.parseInt(rgbMatch[1]),
      g: Number.parseInt(rgbMatch[2]),
      b: Number.parseInt(rgbMatch[3]),
    };
  }

  // Handle rgba() format
  const rgbaMatch = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/.exec(colorStr);
  if (rgbaMatch) {
    return {
      r: Number.parseInt(rgbaMatch[1]),
      g: Number.parseInt(rgbaMatch[2]),
      b: Number.parseInt(rgbaMatch[3]),
    };
  }

  // Handle hex format
  const hexMatch = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorStr);
  if (hexMatch) {
    return {
      r: Number.parseInt(hexMatch[1], 16),
      g: Number.parseInt(hexMatch[2], 16),
      b: Number.parseInt(hexMatch[3], 16),
    };
  }

  return null;
};

// Read Roll20's colorTheme setting from localStorage, if valid.
function themeFromStorage(): string | null {
  let roll20Theme: string | null;
  try {
    roll20Theme = localStorage.getItem('colorTheme');
  } catch (error) {
    console.warn('Could not access Roll20 localStorage colorTheme:', error);
    return null;
  }
  if (roll20Theme === 'dark' || roll20Theme === 'light') {
    return roll20Theme;
  }
  return null;
}

// Check Roll20's theme classes and data attributes on body/html.
function themeFromDomClasses(): string | null {
  const body = document.body;
  const html = document.documentElement;

  if (body.classList.contains('darkmode') || html.classList.contains('darkmode')) {
    return 'dark';
  }
  if (body.classList.contains('lightmode') || html.classList.contains('lightmode')) {
    return 'light';
  }

  return body.dataset.theme || html.dataset.theme || null;
}

function brightnessTheme(rgb: RGBColor): 'dark' | 'light' {
  const brightness = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
  return brightness < 128 ? 'dark' : 'light';
}

// Analyze CSS colors (custom properties, then chat container) to infer the theme.
function themeFromCssColors(): string | null {
  const computedStyle = getComputedStyle(document.documentElement);
  const bgColor =
    computedStyle.getPropertyValue('--background-color') ||
    computedStyle.getPropertyValue('--main-bg') ||
    computedStyle.backgroundColor;

  const bgRgb = bgColor ? parseColor(bgColor) : null;
  if (bgRgb) {
    return brightnessTheme(bgRgb);
  }

  const chatContainer = document.querySelector('.textchatcontainer, #textchat');
  const chatBg = chatContainer ? getComputedStyle(chatContainer).backgroundColor : null;
  const chatRgb = chatBg ? parseColor(chatBg) : null;
  return chatRgb ? brightnessTheme(chatRgb) : null;
}

// Detect current Roll20 theme
export const detectTheme = (): string => {
  return themeFromStorage() ?? themeFromDomClasses() ?? themeFromCssColors() ?? 'dark';
};

// Get Roll20 theme colors
export const getThemeColors = (): ThemeColors => {
  const theme = detectTheme();

  // Define static, clean theme colors
  const colors: ThemeColors =
    theme === 'dark'
      ? {
          theme: 'dark',
          primary: '#4CAF50',
          background: '#2b2b2b',
          surface: '#1e1e1e',
          border: '#444444',
          text: '#ffffff',
          textSecondary: '#cccccc',
          input: '#333333',
          inputBorder: '#555555',
          button: '#404040',
          buttonHover: '#505050',
        }
      : {
          theme: 'light',
          primary: '#4CAF50',
          background: '#ffffff',
          surface: '#f8f9fa',
          border: '#dee2e6',
          text: '#212529',
          textSecondary: '#6c757d',
          input: '#ffffff',
          inputBorder: '#ced4da',
          button: 'rgb(248, 249, 250)',
          buttonHover: '#e9ecef',
        };

  return colors;
};

type ThemeChangeCallback = (theme: string, colors: ThemeColors) => void;

// Monitor theme changes
export const onThemeChange = (callback: ThemeChangeCallback): MutationObserver => {
  let currentTheme = detectTheme();

  // Monitor localStorage changes for Roll20's colorTheme
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function (key: string, value: string) {
    if (key === 'colorTheme' && (value === 'dark' || value === 'light')) {
      const newTheme = value;
      if (newTheme !== currentTheme) {
        currentTheme = newTheme;
        callback(newTheme, getThemeColors());
      }
    }
    return originalSetItem.apply(this, [key, value]);
  };

  // Listen for storage events (changes from other tabs/windows)
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === 'colorTheme' && (e.newValue === 'dark' || e.newValue === 'light')) {
      const newTheme = e.newValue;
      if (newTheme !== currentTheme) {
        currentTheme = newTheme;
        callback(newTheme, getThemeColors());
      }
    }
  });

  // Create mutation observer to watch for theme changes (fallback)
  const observer = new MutationObserver(() => {
    const newTheme = detectTheme();
    if (newTheme !== currentTheme) {
      currentTheme = newTheme;
      callback(newTheme, getThemeColors());
    }
  });

  // Watch for class changes on body and html
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  });

  // Also watch for style changes in head
  const head = document.head;
  if (head) {
    observer.observe(head, {
      childList: true,
      subtree: true,
    });
  }

  return observer;
};

// Default export with all functions
const ThemeDetector = {
  detectTheme,
  parseColor,
  getThemeColors,
  onThemeChange,
};

export default ThemeDetector;

// Legacy global exports for backward compatibility (temporary)
if (typeof window !== 'undefined') {
  window.ThemeDetector = ThemeDetector;
}

console.warn('ThemeDetector module initialized');
