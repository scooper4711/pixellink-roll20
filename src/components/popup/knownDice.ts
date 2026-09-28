'use strict';

import { sendMessage } from './popupMessaging';
import type { MessageResponse } from './popupMessaging';

interface KnownDie {
  name: string;
  systemId?: string;
  lastConnected: number;
  dieType: number | null;
}

const KNOWN_DICE_KEY = 'pixels_known_dice';

function getKnownDice(): Promise<KnownDie[]> {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve([]);
      return;
    }
    chrome.storage.local.get(KNOWN_DICE_KEY, (result: { [key: string]: KnownDie[] }) => {
      resolve(result[KNOWN_DICE_KEY] || []);
    });
  });
}

function removeKnownDie(name: string): Promise<void> {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve();
      return;
    }
    chrome.storage.local.get(KNOWN_DICE_KEY, (result: { [key: string]: KnownDie[] }) => {
      const dice = (result[KNOWN_DICE_KEY] || []).filter((d: KnownDie) => d.name !== name);
      chrome.storage.local.set({ [KNOWN_DICE_KEY]: dice }, resolve);
    });
  });
}

interface DiceStatusResponse {
  connected: string[];
  batteryLevels: Record<string, number>;
  rssiLevels: Record<string, number>;
  dieTypes: Record<string, number>;
}

// --- Known Dice ---------------------------------------------------------------

/**
 * Returns an inline SVG element for the given die type.
 * Uses Font Awesome Free dice-d6 and dice-d20 paths where available,
 * and simple geometric shapes for others.
 * Icons: CC BY 4.0 (Font Awesome Free 6.7.2 by @fontawesome)
 */
function appendD8Icon(svg: SVGSVGElement, svgNS: string): void {
  // d8: octahedron faces from game-icons.net (by Delapouite, CC BY 3.0)
  const outline = document.createElementNS(svgNS, 'path');
  outline.setAttribute(
    'd',
    'M256 37.143L77.896 343.853h356.208z M230.154 49.79L72 164.233v157.91z M281.844 49.79L440 322.144V164.232z M88.7 359.852L256 480.912l167.3-121.06z'
  );
  outline.setAttribute('fill', 'currentColor');
  svg.appendChild(outline);

  const edges = document.createElementNS(svgNS, 'path');
  edges.setAttribute(
    'd',
    'M230.154 49.79L256 37.143 281.844 49.79 M77.896 343.853L88.7 359.852 M434.104 343.853L423.3 359.852'
  );
  edges.setAttribute('fill', 'none');
  edges.setAttribute('stroke', 'var(--dice-icon-edge, #000)');
  edges.setAttribute('stroke-width', '12');
  edges.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(edges);
}

function appendD12Icon(svg: SVGSVGElement, svgNS: string): void {
  // d12: dodecahedron - 6 pentagon faces from game-icons.net (by Skoll, CC BY 3.0)
  const faces = document.createElementNS(svgNS, 'path');
  faces.setAttribute(
    'd',
    'M450.169 181.354L379.685 84.29 265.629 47.325 265.629 139.977 362.013 210.008z M246.55 139.977L246.55 47.325 132.494 84.29 62.01 181.354 150.166 209.972z M198.59 333.591L313.588 333.591 349.098 224.221 256.089 156.623 163.08 224.222z M196.468 352.67L142.034 427.71 256.089 464.675 370.145 427.71 315.711 352.67z M367.843 228.109L331.033 341.389 385.516 416.382 456 319.366 456 199.503z M144.156 228.109L56 199.491 56 319.425 126.484 416.441 180.966 341.449z'
  );
  faces.setAttribute('fill', 'currentColor');
  svg.appendChild(faces);

  const edges = document.createElementNS(svgNS, 'path');
  edges.setAttribute(
    'd',
    'M265.629 139.977L256.089 156.623 M246.55 139.977L256.089 156.623 M362.013 210.008L349.098 224.221 M150.166 209.972L163.08 224.222 M198.59 333.591L196.468 352.67 M313.588 333.591L315.711 352.67 M349.098 224.221L367.843 228.109 M163.08 224.222L144.156 228.109 M331.033 341.389L313.588 333.591 M180.966 341.449L198.59 333.591'
  );
  edges.setAttribute('fill', 'none');
  edges.setAttribute('stroke', 'var(--dice-icon-edge, #000)');
  edges.setAttribute('stroke-width', '8');
  edges.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(edges);
}

function createDieIcon(dieType: number | null): SVGSVGElement {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', getViewBox(dieType));
  svg.setAttribute('fill', 'currentColor');
  svg.style.width = '16px';
  svg.style.height = '16px';

  if (dieType === 8) {
    appendD8Icon(svg, svgNS);
  } else if (dieType === 12) {
    appendD12Icon(svg, svgNS);
  } else {
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', getDiePath(dieType));
    svg.appendChild(path);
  }
  return svg;
}

function getViewBox(dieType: number | null): string {
  switch (dieType) {
    case 6:
      return '0 0 448 512';
    case 20:
      return '0 0 512 512';
    default:
      return '0 0 512 512';
  }
}

function getDiePath(dieType: number | null): string {
  switch (dieType) {
    // d4: Pixels d4 shape (rounded cube with squat pyramids top/bottom)
    case 4:
      return 'M136 160H376V352H136z M136 145L256 65 376 145z M136 367L256 447 376 367z';
    // d6: Font Awesome Free dice-d6
    case 6:
      return 'M201 10.3c14.3-7.8 31.6-7.8 46 0L422.3 106c5.1 2.8 8.3 8.2 8.3 14s-3.2 11.2-8.3 14L231.7 238c-4.8 2.6-10.5 2.6-15.3 0L25.7 134c-5.1-2.8-8.3-8.2-8.3-14s3.2-11.2 8.3-14L201 10.3zM23.7 170l176 96c5.1 2.8 8.3 8.2 8.3 14l0 216c0 5.6-3 10.9-7.8 13.8s-10.9 3-15.8 .3L25 423.1C9.6 414.7 0 398.6 0 381L0 184c0-5.6 3-10.9 7.8-13.8s10.9-3 15.8-.3zm400.7 0c5-2.7 11-2.6 15.8 .3s7.8 8.1 7.8 13.8l0 197c0 17.6-9.6 33.7-25 42.1L263.7 510c-5 2.7-11 2.6-15.8-.3s-7.8-8.1-7.8-13.8l0-216c0-5.9 3.2-11.2 8.3-14l176-96z';
    // d8: handled specially in createDieIcon
    case 8:
      return 'M256 37.143L77.896 343.853h356.208z';
    // d10: game-icons.net d10 outline (by Skoll, CC BY 3.0), side triangles adjusted
    case 10:
      return 'M375.483 251.243L265.503 302.381 265.716 485.762 477.01 266.346 390.017 244.536z M121.603 244.334L36.893 266.097 246.474 486 246.474 302.38 136.528 251.243z M255.987 26L137.456 231.026 255.988 286.076 374.592 231.026z M265.397 30L470 256 390 230z M245.847 30L40 256 120 234.771z';
    // d12: handled specially in createDieIcon
    case 12:
      return 'M256 32L76 152l0 208 180 120 180-120 0-208L256 32z';
    // d20: Font Awesome Free dice-d20
    case 20:
      return 'M48.7 125.8l53.2 31.9c7.8 4.7 17.8 2 22.2-5.9L201.6 12.1c3-5.4-.9-12.1-7.1-12.1c-1.6 0-3.2 .5-4.6 1.4L47.9 98.8c-9.6 6.6-9.2 20.9 .8 26.9zM16 171.7l0 123.5c0 8 10.4 11 14.7 4.4l60-92c5-7.6 2.6-17.8-5.2-22.5L40.2 158C29.6 151.6 16 159.3 16 171.7zM310.4 12.1l77.6 139.6c4.4 7.9 14.5 10.6 22.2 5.9l53.2-31.9c10-6 10.4-20.3 .8-26.9L322.1 1.4c-1.4-.9-3-1.4-4.6-1.4c-6.2 0-10.1 6.7-7.1 12.1zM496 171.7c0-12.4-13.6-20.1-24.2-13.7l-45.3 27.2c-7.8 4.7-10.1 14.9-5.2 22.5l60 92c4.3 6.7 14.7 3.6 14.7-4.4l0-123.5zm-49.3 246L286.1 436.6c-8.1 .9-14.1 7.8-14.1 15.9l0 52.8c0 3.7 3 6.8 6.8 6.8c.8 0 1.6-.1 2.4-.4l172.7-64c6.1-2.2 10.1-8 10.1-14.5c0-9.3-8.1-16.5-17.3-15.4zM233.2 512c3.7 0 6.8-3 6.8-6.8l0-52.6c0-8.1-6.1-14.9-14.1-15.9l-160.6-19c-9.2-1.1-17.3 6.1-17.3 15.4c0 6.5 4 12.3 10.1 14.5l172.7 64c.8 .3 1.6 .4 2.4 .4zM41.7 382.9l170.9 20.2c7.8 .9 13.4-7.5 9.5-14.3l-85.7-150c-5.9-10.4-20.7-10.8-27.3-.8L30.2 358.2c-6.5 9.9-.3 23.3 11.5 24.7zm439.6-24.8L402.9 238.1c-6.5-10-21.4-9.6-27.3 .8L290.2 388.5c-3.9 6.8 1.6 15.2 9.5 14.3l170.1-20c11.8-1.4 18-14.7 11.5-24.6zm-216.9 11l78.4-137.2c6.1-10.7-1.6-23.9-13.9-23.9l-145.7 0c-12.3 0-20 13.3-13.9 23.9l78.4 137.2c3.7 6.4 13 6.4 16.7 0zM174.4 176l163.2 0c12.2 0 19.9-13.1 14-23.8l-80-144c-2.8-5.1-8.2-8.2-14-8.2l-3.2 0c-5.8 0-11.2 3.2-14 8.2l-80 144c-5.9 10.7 1.8 23.8 14 23.8z';
    // d100/d%: percent symbol (Font Awesome Free)
    case 100:
      return 'M374.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-320 320c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l320-320zM128 128A64 64 0 1 0 0 128a64 64 0 1 0 128 0zM384 384a64 64 0 1 0-128 0 64 64 0 1 0 128 0z';
    // fallback: generic die (d6)
    default:
      return 'M201 10.3c14.3-7.8 31.6-7.8 46 0L422.3 106c5.1 2.8 8.3 8.2 8.3 14s-3.2 11.2-8.3 14L231.7 238c-4.8 2.6-10.5 2.6-15.3 0L25.7 134c-5.1-2.8-8.3-8.2-8.3-14s3.2-11.2 8.3-14L201 10.3zM23.7 170l176 96c5.1 2.8 8.3 8.2 8.3 14l0 216c0 5.6-3 10.9-7.8 13.8s-10.9 3-15.8 .3L25 423.1C9.6 414.7 0 398.6 0 381L0 184c0-5.6 3-10.9 7.8-13.8s10.9-3 15.8-.3zm400.7 0c5-2.7 11-2.6 15.8 .3s7.8 8.1 7.8 13.8l0 197c0 17.6-9.6 33.7-25 42.1L263.7 510c-5 2.7-11 2.6-15.8-.3s-7.8-8.1-7.8-13.8l0-216c0-5.9 3.2-11.2 8.3-14l176-96z';
  }
}

/**
 * Creates a signal strength SVG icon with 4 bars colored by RSSI level.
 * Thresholds: ≥ -65 = 4 bars, -65 to -75 = 3 bars, -75 to -85 = 2 bars, < -85 = 1 bar.
 */
function createSignalIcon(rssi: number): SVGSVGElement {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');
  svg.style.width = '14px';
  svg.style.height = '14px';

  let bars: number;
  let color: string;
  if (rssi >= -65) {
    bars = 4;
    color = '#4ade80';
  } else if (rssi >= -75) {
    bars = 3;
    color = '#4ade80';
  } else if (rssi >= -85) {
    bars = 2;
    color = '#fbbf24';
  } else {
    bars = 1;
    color = '#f87171';
  }

  const barWidths = [
    { x: 1, y: 12, width: 2, height: 3 },
    { x: 5, y: 9, width: 2, height: 6 },
    { x: 9, y: 5, width: 2, height: 10 },
    { x: 13, y: 1, width: 2, height: 14 },
  ];

  barWidths.forEach((bar, index) => {
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', String(bar.x));
    rect.setAttribute('y', String(bar.y));
    rect.setAttribute('width', String(bar.width));
    rect.setAttribute('height', String(bar.height));
    rect.setAttribute('rx', '0.5');
    rect.setAttribute('fill', index < bars ? color : '#555555');
    svg.appendChild(rect);
  });

  return svg;
}

function fetchDiceStatus(): Promise<DiceStatusResponse> {
  return new Promise<DiceStatusResponse>(resolve => {
    sendMessage({ action: 'getConnectedDice' }, (response: MessageResponse | undefined) => {
      if (chrome.runtime.lastError || !response) {
        resolve({
          connected: [],
          batteryLevels: {},
          rssiLevels: {},
          dieTypes: {},
        });
      } else {
        resolve({
          connected: response.connected || [],
          batteryLevels: response.batteryLevels || {},
          rssiLevels: response.rssiLevels || {},
          dieTypes: response.dieTypes || {},
        });
      }
    });
  });
}

function updateDiceCountLabel(diceStatus: DiceStatusResponse, total: number): void {
  const countLabel = document.getElementById('knownDiceCount');
  if (countLabel) {
    countLabel.textContent = `${diceStatus.connected.length}/${total}`;
  }
}

const DIE_TYPE_ORDER: Record<number, number> = {
  4: 0,
  6: 1,
  8: 2,
  10: 3,
  100: 3,
  12: 4,
  20: 5,
};

function compareKnownDice(a: KnownDie, b: KnownDie, diceStatus: DiceStatusResponse): number {
  const aConnected = diceStatus.connected.includes(a.name);
  const bConnected = diceStatus.connected.includes(b.name);
  if (aConnected !== bConnected) return aConnected ? -1 : 1;
  const aType = diceStatus.dieTypes[a.name] || a.dieType || null;
  const bType = diceStatus.dieTypes[b.name] || b.dieType || null;
  const aOrder = aType !== null ? (DIE_TYPE_ORDER[aType] ?? 99) : 99;
  const bOrder = bType !== null ? (DIE_TYPE_ORDER[bType] ?? 99) : 99;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.name.localeCompare(b.name);
}

function sortKnownDice(dice: KnownDie[], diceStatus: DiceStatusResponse): void {
  // Sort: connected first, then by die type, then alphabetical by name
  dice.sort((a: KnownDie, b: KnownDie) => compareKnownDice(a, b, diceStatus));
}

function buildBatterySpan(battery: number): HTMLSpanElement {
  const batterySpan = document.createElement('span');
  batterySpan.className = 'known-dice-battery';
  if (battery <= 15) {
    batterySpan.classList.add('battery-critical');
    batterySpan.textContent = `🪫${battery}%`;
  } else if (battery <= 30) {
    batterySpan.classList.add('battery-low');
    batterySpan.textContent = `🔋${battery}%`;
  } else {
    batterySpan.textContent = `🔋${battery}%`;
  }
  batterySpan.title = `Battery: ${battery}%`;
  return batterySpan;
}

function appendDiceRowButtons(li: HTMLLIElement, die: KnownDie, isConnected: boolean): void {
  if (isConnected) {
    const disconnectBtn = document.createElement('button');
    disconnectBtn.className = 'known-dice-btn forget';
    disconnectBtn.textContent = 'Disconnect';
    disconnectBtn.onclick = (): void => {
      sendMessage({ action: 'disconnectByName', name: die.name });
      setTimeout(() => renderKnownDice(), 500);
    };
    li.appendChild(disconnectBtn);
    return;
  }

  const reconnectBtn = document.createElement('button');
  reconnectBtn.className = 'known-dice-btn reconnect';
  reconnectBtn.textContent = 'Reconnect';
  reconnectBtn.onclick = (): void => sendMessage({ action: 'reconnect', name: die.name });

  const forgetBtn = document.createElement('button');
  forgetBtn.className = 'known-dice-btn forget';
  forgetBtn.textContent = 'Forget';
  forgetBtn.onclick = (): void => {
    sendMessage({ action: 'forgetByName', name: die.name });
    removeKnownDie(die.name).then(() => renderKnownDice());
  };

  li.appendChild(reconnectBtn);
  li.appendChild(forgetBtn);
}

function appendSignalSpan(li: HTMLLIElement, die: KnownDie, diceStatus: DiceStatusResponse): void {
  if (diceStatus.rssiLevels[die.name] === undefined) {
    return;
  }
  const rssi = diceStatus.rssiLevels[die.name];
  const signalSpan = document.createElement('span');
  signalSpan.className = 'known-dice-signal';
  signalSpan.title = `Signal: ${rssi} dBm`;
  signalSpan.appendChild(createSignalIcon(rssi));
  li.appendChild(signalSpan);
}

function buildKnownDiceRow(die: KnownDie, diceStatus: DiceStatusResponse): HTMLLIElement {
  const isConnected = diceStatus.connected.includes(die.name);
  const battery = diceStatus.batteryLevels[die.name];
  const dieType = diceStatus.dieTypes[die.name] || die.dieType || null;

  const li = document.createElement('li');
  li.className = isConnected ? 'known-dice-item connected' : 'known-dice-item';

  const dieIcon = document.createElement('span');
  dieIcon.className = isConnected ? 'known-dice-icon connected' : 'known-dice-icon';
  dieIcon.appendChild(createDieIcon(dieType));
  dieIcon.title = isConnected ? 'Connected' : 'Disconnected';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'known-dice-name';
  nameSpan.textContent = die.name;

  if (isConnected) {
    nameSpan.classList.add('clickable');
    nameSpan.title = 'Click to blink this die';
    nameSpan.onclick = (): void => {
      sendMessage({ action: 'blinkByName', name: die.name });
    };
  }

  li.appendChild(dieIcon);
  li.appendChild(nameSpan);
  if (isConnected) {
    appendSignalSpan(li, die, diceStatus);
  }
  if (isConnected && battery !== undefined) {
    li.appendChild(buildBatterySpan(battery));
  }

  appendDiceRowButtons(li, die, isConnected);
  return li;
}

async function loadKnownDiceList(): Promise<KnownDie[]> {
  try {
    return await getKnownDice();
  } catch {
    return [];
  }
}

export async function renderKnownDice(): Promise<void> {
  const section = document.getElementById('knownDiceSection');
  const list = document.getElementById('knownDiceList');
  if (!section || !list) {
    return;
  }

  const dice = await loadKnownDiceList();
  if (dice.length === 0) {
    section.style.display = 'none';
    return;
  }

  // Query which dice are currently connected (with battery info)
  const diceStatus = await fetchDiceStatus();

  section.style.display = 'flex';
  list.innerHTML = '';

  updateDiceCountLabel(diceStatus, dice.length);
  sortKnownDice(dice, diceStatus);

  dice.forEach((die: KnownDie) => {
    list.appendChild(buildKnownDiceRow(die, diceStatus));
  });
}
