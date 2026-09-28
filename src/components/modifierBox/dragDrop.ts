/**
 * Drag and Drop functionality for modifier rows
 */

import { getThemeColors } from '../../utils/themeDetector';

// Functional helpers
const createElement = (tagName: string, className: string = ''): HTMLElement => {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  return element;
};

const setStyle = (styles: Record<string, string>, element: HTMLElement): HTMLElement => {
  Object.entries(styles).forEach(([prop, value]) => {
    element.style.setProperty(prop, value, 'important');
  });
  return element;
};

const addClass = (className: string, element: HTMLElement): HTMLElement => {
  element.classList.add(className);
  return element;
};

const removeClass = (className: string, element: HTMLElement): HTMLElement => {
  element.classList.remove(className);
  return element;
};

const findClosest = (selector: string, element: Element): Element | null => element.closest(selector);

// Mutable per-instance drag state (replaces the old mega-closure locals)
interface RowDragState {
  container: Element | null;
  draggedElement: HTMLElement | null;
  placeholder: HTMLElement | null;
  dragHandle: HTMLElement | null;
  startX: number;
  startY: number;
  isDragging: boolean;
}

function createDragState(): RowDragState {
  return {
    container: null,
    draggedElement: null,
    placeholder: null,
    dragHandle: null,
    startX: 0,
    startY: 0,
    isDragging: false,
  };
}

function resolvePrimaryColor(): string {
  if (getThemeColors && typeof getThemeColors === 'function') {
    const colors = getThemeColors();
    if (colors?.primary) {
      return colors.primary;
    }
  }
  return '#4caf50'; // Default fallback
}

function updatePlaceholderThemeElement(placeholderElement: HTMLElement | null): void {
  if (!placeholderElement) return;
  const primaryColor = resolvePrimaryColor();
  const gradient = `linear-gradient(90deg, transparent 0%, ${primaryColor} 20%, ${primaryColor} 80%, transparent 100%)`;
  setStyle({ background: gradient }, placeholderElement);
}

function createPlaceholderElement(): HTMLElement {
  const element = createElement('div', 'modifier-row-placeholder');
  updatePlaceholderThemeElement(element);
  return element;
}

function startDrag(state: RowDragState): void {
  if (!state.draggedElement) return;

  state.isDragging = true;

  // Add visual feedback using functional approach
  addClass('dragging', state.draggedElement);
  setStyle(
    {
      opacity: '0.7',
      transform: 'rotate(2deg)',
      zIndex: '10000',
    },
    state.draggedElement
  );
}

function insertPlaceholderAtEnd(state: RowDragState, rows: NodeListOf<Element>, placeholder: HTMLElement): void {
  const lastRow = Array.from(rows)
    .filter(row => row !== state.draggedElement)
    .pop();
  if (lastRow) {
    lastRow.parentNode!.insertBefore(placeholder, lastRow.nextSibling);
  } else {
    // If no other rows, insert at the beginning
    state.container!.appendChild(placeholder);
  }
}

function updateDragPosition(state: RowDragState, rowSelector: string, e: MouseEvent): void {
  const { draggedElement, container, placeholder } = state;
  if (!draggedElement || !container || !placeholder) return;

  const afterElement = getDragAfterElement(container, rowSelector, e.clientY);
  const rows = container.querySelectorAll(rowSelector);

  // Remove existing placeholder
  placeholder.remove();

  // Update placeholder theme before showing it
  updatePlaceholderThemeElement(placeholder);

  if (afterElement === undefined) {
    insertPlaceholderAtEnd(state, rows, placeholder);
  } else if (afterElement !== draggedElement) {
    // Insert before the afterElement
    afterElement.parentNode!.insertBefore(placeholder, afterElement);
  }
}

function cleanupDrag(state: RowDragState): void {
  if (state.draggedElement) {
    setStyle(
      {
        opacity: '',
        transform: '',
        zIndex: '',
      },
      state.draggedElement
    );
    removeClass('dragging', state.draggedElement);
    state.draggedElement = null;
  }

  state.placeholder?.remove();

  state.dragHandle = null;
  state.container = null;
  state.isDragging = false;
  state.startX = 0;
  state.startY = 0;

  // Reset cursor
  document.body.style.cursor = '';
}

function reindexAfterDrop(state: RowDragState, rowManagerInstance: ModifierBoxRowManagerModule): void {
  if (rowManagerInstance && typeof rowManagerInstance.reindexRows === 'function') {
    const modifierBox = findClosest('#pixels-modifier-box', state.container!) as HTMLElement | null;
    if (modifierBox) {
      rowManagerInstance.reindexRows(modifierBox);

      // Save the new order to localStorage after reindexing
      if (typeof rowManagerInstance.saveModifierRows === 'function') {
        rowManagerInstance.saveModifierRows(modifierBox);
      }
    }
  }
}

function completeDrag(state: RowDragState, rowManagerInstance: ModifierBoxRowManagerModule): void {
  if (!state.draggedElement || !state.placeholder?.parentNode) {
    cleanupDrag(state);
    return;
  }

  // Insert the dragged element where the placeholder is
  state.placeholder.parentNode.insertBefore(state.draggedElement, state.placeholder);

  // Remove placeholder
  state.placeholder.remove();

  // Reindex all rows to maintain correct radio button values
  reindexAfterDrop(state, rowManagerInstance);

  cleanupDrag(state);
}

function getDragAfterElement(containerElement: Element, rowSelector: string, y: number): Element | undefined {
  const draggableElements = [...containerElement.querySelectorAll(`${rowSelector}:not(.dragging)`)];

  return draggableElements.reduce(
    (currentClosest: { offset: number; element: Element | undefined }, child: Element) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > currentClosest.offset) {
        return { offset: offset, element: child };
      } else {
        return currentClosest;
      }
    },
    {
      offset: Number.NEGATIVE_INFINITY,
      element: undefined as Element | undefined,
    }
  ).element;
}

function preventSelect(state: RowDragState, e: Event): void {
  if (state.draggedElement) {
    e.preventDefault();
  }
}

function handleMouseDown(state: RowDragState, containerSelector: string, rowSelector: string, e: MouseEvent): void {
  const target = e.target as Element;
  const handle = findClosest('.drag-handle', target);
  if (!handle) return;

  const row = findClosest(rowSelector, handle) as HTMLElement | null;
  if (!row) return;

  e.preventDefault(); // Prevent text selection

  state.draggedElement = row;
  state.container = findClosest(containerSelector, row);
  state.dragHandle = handle as HTMLElement;

  // Store initial mouse position
  state.startX = e.clientX;
  state.startY = e.clientY;
  state.isDragging = false;

  // Change cursor
  document.body.style.cursor = 'grabbing';
}

function passedDragThreshold(state: RowDragState, e: MouseEvent): boolean {
  const deltaX = Math.abs(e.clientX - state.startX);
  const deltaY = Math.abs(e.clientY - state.startY);
  return deltaX > 5 || deltaY > 5;
}

function handleMouseMove(state: RowDragState, rowSelector: string, e: MouseEvent): void {
  if (!state.draggedElement) return;

  // Start dragging only after moving a few pixels (prevent accidental drags)
  if (!state.isDragging && passedDragThreshold(state, e)) {
    startDrag(state);
  }

  if (state.isDragging) {
    e.preventDefault();
    updateDragPosition(state, rowSelector, e);
  }
}

function handleMouseUp(state: RowDragState, rowManagerInstance: ModifierBoxRowManagerModule): void {
  if (!state.draggedElement) return;

  document.body.style.cursor = '';

  if (state.isDragging) {
    completeDrag(state, rowManagerInstance);
  } else {
    // Just cleanup if we didn't actually drag
    cleanupDrag(state);
  }
}

// Factory function to create drag and drop functionality
export const createRowDragDrop: RowDragDropFactory = (
  containerSelector: string,
  rowSelector: string,
  rowManagerInstance: ModifierBoxRowManagerModule
): RowDragDropInstance => {
  const state = createDragState();

  // Initialize
  state.placeholder = createPlaceholderElement();

  // Use mouse-based drag and drop for better reliability
  document.addEventListener('mousedown', e => handleMouseDown(state, containerSelector, rowSelector, e));
  document.addEventListener('mousemove', e => handleMouseMove(state, rowSelector, e));
  document.addEventListener('mouseup', () => handleMouseUp(state, rowManagerInstance));

  // Prevent text selection during drag
  document.addEventListener('selectstart', e => preventSelect(state, e));

  // Public API
  return {
    updatePlaceholderTheme: () => updatePlaceholderThemeElement(state.placeholder),
    cleanup: () => cleanupDrag(state),
  };
};

// Utility functions for drag handles
export const addDragHandle = (row: HTMLElement): void => {
  // Check if drag handle already exists
  if (row.querySelector('.drag-handle')) {
    return;
  }

  const dragHandle = createElement('div', 'drag-handle');
  dragHandle.title = 'Drag to reorder';
  dragHandle.innerHTML = '⋮⋮';

  // Insert at the beginning of the row
  row.insertBefore(dragHandle, row.firstChild);
};

export const removeDragHandle = (row: HTMLElement): void => {
  const dragHandle = row.querySelector('.drag-handle');
  if (dragHandle) {
    dragHandle.remove();
  }
};

// Export for backwards compatibility
export const RowDragDrop = createRowDragDrop;

// Export for use in other modules (legacy support)
if (typeof window !== 'undefined') {
  window.RowDragDrop = createRowDragDrop;
  window.addDragHandle = addDragHandle;
  window.removeDragHandle = removeDragHandle;
}
