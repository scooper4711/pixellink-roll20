/**
 * PixelsQueryModal.ts
 *
 * Roll-query (?{...}) parsing and the Roll Parameters modal UI used by the
 * /pixels chat command flow. Stateless apart from the modal element itself;
 * resolution results are delivered through callbacks.
 */

'use strict';

const ROLL_QUERY_PATTERN = /\?\{([^}]+)\}/g;

// --- Roll Query Resolution ---

interface QueryToken {
  label: string;
  defaultValue: string;
  options: string[] | null;
}

interface ExtractedQuery extends QueryToken {
  fullMatch: string;
}

function parseQueryToken(token: string): QueryToken {
  const parts = token.split('|');
  const label = parts[0].trim();

  if (parts.length <= 1) {
    return { label, defaultValue: '', options: null };
  }
  if (parts.length === 2) {
    return { label, defaultValue: parts[1].trim(), options: null };
  }
  const options = parts.slice(1).map(p => p.trim());
  return { label, defaultValue: options[0], options };
}

export function containsRollQueries(formula: string): boolean {
  return ROLL_QUERY_PATTERN.test(formula);
}

function extractRollQueries(formula: string): ExtractedQuery[] {
  const queries: ExtractedQuery[] = [];
  ROLL_QUERY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ROLL_QUERY_PATTERN.exec(formula)) !== null) {
    const parsed = parseQueryToken(match[1]);
    queries.push({ ...parsed, fullMatch: match[0] });
  }
  return queries;
}

export function resolveRollQueries(
  formula: string,
  onResolved: (resolved: string) => void,
  onCancelled: () => void
): void {
  const queries = extractRollQueries(formula);
  if (queries.length === 0) {
    onResolved(formula);
    return;
  }
  showQueryModal(
    queries,
    values => {
      let resolved = formula;
      for (let i = 0; i < queries.length; i++) {
        resolved = resolved.replace(queries[i].fullMatch, values[i]);
      }
      onResolved(resolved);
    },
    onCancelled
  );
}

// --- Roll Query Modal UI ---

let queryModalElement: HTMLElement | null = null;

function createQueryModal(): HTMLElement {
  const modal = document.createElement('div');
  modal.id = 'pixels-query-modal';
  modal.innerHTML = `
    <div class="pixels-query-header">
      <span class="pixels-query-title">Roll Parameters</span>
      <button class="pixels-query-cancel" title="Cancel">✕</button>
    </div>
    <div class="pixels-query-fields"></div>
    <div class="pixels-query-actions">
      <button class="pixels-query-submit">Roll</button>
    </div>
  `;
  document.body.appendChild(modal);
  injectQueryModalStyles();
  return modal;
}

function buildQuerySelect(query: ExtractedQuery, index: number): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'pixels-query-select';
  select.id = `pixels-query-input-${index}`;
  select.dataset.index = String(index);
  for (const opt of query.options ?? []) {
    const optEl = document.createElement('option');
    optEl.value = opt;
    optEl.textContent = opt;
    select.appendChild(optEl);
  }
  return select;
}

function buildQueryInput(query: ExtractedQuery, index: number): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'pixels-query-input';
  input.id = `pixels-query-input-${index}`;
  input.type = 'text';
  input.value = query.defaultValue;
  input.dataset.index = String(index);
  return input;
}

function buildQueryField(query: ExtractedQuery, index: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'pixels-query-row';

  const label = document.createElement('label');
  label.className = 'pixels-query-label';
  label.textContent = query.label;
  label.setAttribute('for', `pixels-query-input-${index}`);
  row.appendChild(label);

  row.appendChild(query.options ? buildQuerySelect(query, index) : buildQueryInput(query, index));
  return row;
}

function replaceWithClone<T extends Node>(node: T): T {
  const clone = node.cloneNode(true) as T;
  node.parentNode!.replaceChild(clone, node);
  return clone;
}

function collectQueryValues(modal: HTMLElement, count: number): string[] {
  const values: string[] = [];
  for (let i = 0; i < count; i++) {
    const el = modal.querySelector(`#pixels-query-input-${i}`) as HTMLInputElement | HTMLSelectElement;
    values.push(el.value);
  }
  return values;
}

function submitQueryValues(queries: ExtractedQuery[], onSubmit: (values: string[]) => void): void {
  const values = collectQueryValues(queryModalElement!, queries.length);
  hideQueryModal();
  onSubmit(values);
}

function showQueryModal(queries: ExtractedQuery[], onSubmit: (values: string[]) => void, onCancel: () => void): void {
  queryModalElement ??= createQueryModal();
  queryModalElement.style.display = 'block';

  const fieldsEl = queryModalElement.querySelector('.pixels-query-fields')!;
  fieldsEl.innerHTML = '';

  for (let i = 0; i < queries.length; i++) {
    fieldsEl.appendChild(buildQueryField(queries[i], i));
  }

  // Wire up event handlers (replace old ones via cloneNode)
  const newCancelBtn = replaceWithClone(queryModalElement.querySelector('.pixels-query-cancel')!);
  const newSubmitBtn = replaceWithClone(queryModalElement.querySelector('.pixels-query-submit')!);

  newCancelBtn.addEventListener('click', () => {
    hideQueryModal();
    if (onCancel) {
      onCancel();
    }
  });
  newSubmitBtn.addEventListener('click', () => {
    submitQueryValues(queries, onSubmit);
  });

  fieldsEl.addEventListener('keydown', (event: Event) => {
    if ((event as KeyboardEvent).key === 'Enter') {
      event.preventDefault();
      submitQueryValues(queries, onSubmit);
    }
  });

  const firstInput = fieldsEl.querySelector('input, select') as HTMLElement | null;
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 0);
  }
}

function hideQueryModal(): void {
  if (queryModalElement) {
    queryModalElement.style.display = 'none';
  }
}

function injectQueryModalStyles(): void {
  if (document.getElementById('pixels-query-styles')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'pixels-query-styles';
  style.textContent = `
    #pixels-query-modal {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 1000002; background: #2b2b2b; border: 2px solid #4a9eff;
      border-radius: 12px; padding: 20px; min-width: 280px; max-width: 400px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: Arial, sans-serif;
      color: #ffffff; display: none;
    }
    .pixels-query-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .pixels-query-title { font-size: 16px; font-weight: bold; }
    .pixels-query-cancel { background: none; border: 1px solid #666; border-radius: 4px; color: #ccc; font-size: 16px; cursor: pointer; padding: 2px 8px; }
    .pixels-query-cancel:hover { background: #5a2a2a; border-color: #f87171; color: #f87171; }
    .pixels-query-fields { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
    .pixels-query-row { display: flex; flex-direction: column; gap: 4px; }
    .pixels-query-label { font-size: 13px; color: #ccc; }
    .pixels-query-input, .pixels-query-select { background: #1a1a1a; border: 1px solid #555; border-radius: 6px; color: #fff; font-size: 14px; padding: 8px 10px; outline: none; }
    .pixels-query-input:focus, .pixels-query-select:focus { border-color: #4a9eff; }
    .pixels-query-actions { display: flex; justify-content: flex-end; }
    .pixels-query-submit { background: #4a9eff; border: none; border-radius: 6px; color: #fff; font-size: 14px; font-weight: bold; padding: 8px 20px; cursor: pointer; }
    .pixels-query-submit:hover { background: #3b82f6; }
  `;
  document.head.appendChild(style);
}
