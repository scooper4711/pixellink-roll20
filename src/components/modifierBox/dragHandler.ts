'use strict';

//
// Drag Handler Module - Handles drag functionality for the modifier box
//

interface DragOffset {
  x: number;
  y: number;
  initialWidth: number;
  initialHeight: number;
}

interface OriginalDimensions {
  width: number;
  height: number | null;
}

interface DragSession {
  box: HTMLElement;
  isDragging: boolean;
  isResizing: boolean;
  offset: DragOffset;
  original: OriginalDimensions;
  onMove: (e: MouseEvent) => void;
  onUp: () => void;
}

function createDragSession(box: HTMLElement): DragSession {
  return {
    box,
    isDragging: false,
    isResizing: false,
    offset: { x: 0, y: 0, initialWidth: 0, initialHeight: 0 },
    original: { width: 400, height: null },
    onMove: () => {},
    onUp: () => {},
  };
}

function createResizeHandleElement(): HTMLElement {
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'pixels-resize-handle';
  resizeHandle.style.cssText = `
            position: absolute !important;
            bottom: 0 !important;
            right: 0 !important;
            width: 20px !important;
            height: 20px !important;
            cursor: se-resize !important;
            background: linear-gradient(-45deg, transparent 25%, #666 35%, transparent 45%, #666 55%, transparent 65%, #666 75%, transparent 85%) !important;
            border-bottom-right-radius: 8px !important;
            z-index: 10 !important;
        `;
  return resizeHandle;
}

function restoreOriginalSize(box: HTMLElement, original: OriginalDimensions, e: MouseEvent): void {
  box.style.setProperty('width', `${original.width}px`, 'important');
  if (original.height) {
    box.style.setProperty('height', `${original.height}px`, 'important');
  } else {
    box.style.setProperty('height', 'auto', 'important');
  }
  e.preventDefault();
  e.stopPropagation();
}

function applyInitialLayout(box: HTMLElement, original: OriginalDimensions): void {
  box.style.position = 'fixed';
  box.style.setProperty('width', `${original.width}px`, 'important');
  if (!box.style.left || box.style.left === 'auto') {
    box.style.left = '20px';
  }
  if (!box.style.top || box.style.top === 'auto') {
    box.style.top = '20px';
  }
  box.style.right = 'auto';
  box.style.bottom = 'auto';
}

function scheduleHeightCapture(box: HTMLElement, original: OriginalDimensions): void {
  setTimeout(() => {
    if (!original.height) {
      const rect = box.getBoundingClientRect();
      original.height = rect.height;
    }
  }, 100);
}

function shouldIgnoreHeaderTarget(target: HTMLElement, resizeHandle: HTMLElement): boolean {
  if (target.tagName === 'BUTTON') {
    return true;
  }
  if (
    target.classList.contains('pixels-close') ||
    target.classList.contains('pixels-minimize') ||
    target.classList.contains('add-modifier-btn')
  ) {
    return true;
  }
  if (target === resizeHandle || target.closest('button')) {
    return true;
  }
  return false;
}

function startHeaderDrag(session: DragSession, e: MouseEvent): void {
  session.isDragging = true;
  const rect = session.box.getBoundingClientRect();
  session.offset.x = e.clientX - rect.left;
  session.offset.y = e.clientY - rect.top;
}

function startResize(session: DragSession, e: MouseEvent): void {
  session.isResizing = true;
  const rect = session.box.getBoundingClientRect();
  session.offset.x = e.clientX;
  session.offset.y = e.clientY;
  session.offset.initialWidth = rect.width;
  session.offset.initialHeight = rect.height;
}

function handleDragMove(session: DragSession, e: MouseEvent): void {
  const newLeft = e.clientX - session.offset.x;
  const newTop = e.clientY - session.offset.y;
  const maxLeft = window.innerWidth - 100;
  const maxTop = window.innerHeight - 50;
  session.box.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
  session.box.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
}

function applyConstrainedSize(session: DragSession, newWidth: number, newHeight: number): void {
  const minWidth = 250;
  const minHeight = 120;
  const maxWidth = Math.min(800, window.innerWidth * 0.8);
  const maxHeight = Math.min(600, window.innerHeight * 0.8);
  const constrainedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
  const constrainedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
  session.box.style.setProperty('width', `${constrainedWidth}px`, 'important');
  session.box.style.setProperty('height', `${constrainedHeight}px`, 'important');
}

function keepBoxOnScreen(session: DragSession): void {
  const rect = session.box.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    session.box.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    session.box.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
}

function handleResizeMove(session: DragSession, e: MouseEvent): void {
  const deltaX = e.clientX - session.offset.x;
  const deltaY = e.clientY - session.offset.y;
  const newWidth = Math.max(session.offset.initialWidth + deltaX, 0);
  const newHeight = Math.max(session.offset.initialHeight + deltaY, 0);
  applyConstrainedSize(session, newWidth, newHeight);
  keepBoxOnScreen(session);
}

function handleSessionMouseMove(session: DragSession, e: MouseEvent): void {
  if (session.isDragging) {
    handleDragMove(session, e);
  } else if (session.isResizing) {
    handleResizeMove(session, e);
  }
}

function endSession(session: DragSession): void {
  session.isDragging = false;
  session.isResizing = false;
  document.removeEventListener('mousemove', session.onMove);
  document.removeEventListener('mouseup', session.onUp);
}

function bindHeaderDrag(header: HTMLElement, resizeHandle: HTMLElement, session: DragSession): void {
  header.addEventListener('mousedown', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (shouldIgnoreHeaderTarget(target, resizeHandle)) {
      return;
    }
    startHeaderDrag(session, e);
    document.addEventListener('mousemove', session.onMove);
    document.addEventListener('mouseup', session.onUp);
    e.preventDefault();
    e.stopPropagation();
  });
}

function bindResizeDrag(resizeHandle: HTMLElement, session: DragSession): void {
  resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
    startResize(session, e);
    document.addEventListener('mousemove', session.onMove);
    document.addEventListener('mouseup', session.onUp);
    e.preventDefault();
    e.stopPropagation();
  });
}

function setupDragFunctionality(modifierBox: HTMLElement): void {
  if (!modifierBox) {
    console.error('setupDragFunctionality: modifierBox is required');
    return;
  }
  const header = modifierBox.querySelector('.pixels-header') as HTMLElement | null;
  if (!header) {
    console.error('setupDragFunctionality: header not found');
    return;
  }
  const session = createDragSession(modifierBox);
  session.onMove = (e: MouseEvent) => handleSessionMouseMove(session, e);
  session.onUp = () => endSession(session);
  const resizeHandle = createResizeHandleElement();
  modifierBox.appendChild(resizeHandle);
  resizeHandle.addEventListener('dblclick', (e: MouseEvent) => {
    restoreOriginalSize(modifierBox, session.original, e);
  });
  applyInitialLayout(modifierBox, session.original);
  scheduleHeightCapture(modifierBox, session.original);
  bindHeaderDrag(header, resizeHandle, session);
  bindResizeDrag(resizeHandle, session);
}

// Export function
export { setupDragFunctionality };

// Default export for convenience
export default {
  setupDragFunctionality,
};

// Legacy global exports for compatibility (temporary)
if (typeof window !== 'undefined') {
  window.ModifierBoxDragHandler = {
    setupDragFunctionality,
  };
}
