'use strict';

import {
  getProfiles,
  saveProfile,
  deleteProfile,
  getActiveProfile,
  setActiveProfile,
  exportProfiles,
  exportProfile,
  importProfiles,
} from '../../utils/profileStorage';
import { sendMessage, showText } from './popupMessaging';
import type { MessageResponse } from './popupMessaging';

// --- Profiles ---------------------------------------------------------------

// Render the saved-profile list, the active-profile banner, and active marker.
export async function renderProfiles(): Promise<void> {
  const list = document.getElementById('profileList');
  const empty = document.getElementById('profileEmpty');
  if (!list) {
    return;
  }

  let profiles: ProfileMap = {};
  let active: string | null = null;
  try {
    [profiles, active] = await Promise.all([getProfiles(), getActiveProfile()]);
  } catch {
    profiles = {};
    active = null;
  }

  // Active profile is only meaningful while it still exists.
  if (active && !(active in profiles)) {
    active = null;
  }
  renderActiveBanner(active);

  const names = Object.keys(profiles).sort((a, b) => a.localeCompare(b));
  list.innerHTML = '';

  if (names.length === 0) {
    if (empty) {
      empty.style.display = 'block';
    }
    return;
  }
  if (empty) {
    empty.style.display = 'none';
  }

  names.forEach((name: string) => {
    list.appendChild(buildProfileRow(name, name === active));
  });
}

function buildProfileRow(name: string, isActive: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.className = isActive ? 'profile-item active' : 'profile-item';

  const label = document.createElement('span');
  label.className = 'profile-item-name';
  label.title = name;
  if (isActive) {
    const dot = document.createElement('span');
    dot.className = 'active-dot';
    dot.textContent = '●';
    label.appendChild(dot);
  }
  label.appendChild(document.createTextNode(name));

  const loadBtn = document.createElement('button');
  loadBtn.className = 'profile-item-btn load';
  loadBtn.textContent = 'Load';
  loadBtn.onclick = (): void => {
    loadProfile(name);
  };

  const exportBtn = document.createElement('button');
  exportBtn.className = 'profile-item-btn export';
  exportBtn.textContent = 'Export';
  exportBtn.title = `Export "${name}" to a file`;
  exportBtn.onclick = (): void => {
    exportSingleProfile(name);
  };

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'profile-item-btn delete';
  deleteBtn.textContent = 'Delete';
  deleteBtn.onclick = (): void => {
    removeProfile(name);
  };

  li.appendChild(label);
  li.appendChild(loadBtn);
  li.appendChild(exportBtn);
  li.appendChild(deleteBtn);
  return li;
}

// Show/hide the "Active: <name>" banner with its Update button.
function renderActiveBanner(active: string | null): void {
  const banner = document.getElementById('activeProfileBanner');
  const nameEl = document.getElementById('activeProfileName');
  if (!banner || !nameEl) {
    return;
  }
  if (active) {
    nameEl.textContent = active;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

// Fetch the current popout rows from the active Roll20 tab, then run `next`.
function withCurrentRows(next: (rows: RowData) => void): void {
  sendMessage({ action: 'getCurrentRows' }, (response: MessageResponse | undefined) => {
    if (chrome.runtime.lastError || !response || !Array.isArray((response as unknown as RowData).rows)) {
      showText('Open Roll20 to read the current popout.');
      return;
    }
    next(response as unknown as RowData);
  });
}

// Save the current popout's rows as a named profile (confirm before overwrite).
export function saveCurrentProfile(): void {
  const input = document.getElementById('profileName') as HTMLInputElement | null;
  const name = input ? input.value.trim() : '';
  if (!name) {
    showText('Enter a profile name to save.');
    return;
  }

  getProfiles().then((profiles: ProfileMap) => {
    if (name in profiles && !window.confirm(`Profile "${name}" already exists. Overwrite it?`)) {
      return;
    }
    withCurrentRows((rows: RowData) => {
      saveProfile(name, rows)
        .then(() => setActiveProfile(name))
        .then(() => {
          if (input) {
            input.value = '';
          }
          showText(`Saved profile "${name}".`);
          renderProfiles();
        })
        .catch(() => showText('Failed to save profile.'));
    });
  });
}

// Overwrite the active profile with the current popout state.
export function updateActiveProfile(): void {
  getActiveProfile().then((active: string | null) => {
    if (!active) {
      showText('No active profile to update.');
      return;
    }
    withCurrentRows((rows: RowData) => {
      saveProfile(active, rows)
        .then(() => {
          showText(`Updated profile "${active}".`);
          renderProfiles();
        })
        .catch(() => showText('Failed to update profile.'));
    });
  });
}

// Apply a saved profile to the popout and mark it active.
function loadProfile(name: string): void {
  getProfiles().then((profiles: ProfileMap) => {
    const profile = profiles[name];
    if (!profile) {
      showText('Profile not found.');
      renderProfiles();
      return;
    }
    sendMessage({ action: 'applyProfile', profile }, (resp: MessageResponse | undefined) => {
      if (chrome.runtime.lastError || !resp || !resp.success) {
        showText('Open Roll20 to load a profile.');
        return;
      }
      setActiveProfile(name).then(() => {
        showText(`Loaded profile "${name}".`);
        renderProfiles();
      });
    });
  });
}

// Delete a saved profile; clear active if it was the one removed.
function removeProfile(name: string): void {
  Promise.all([deleteProfile(name), getActiveProfile()])
    .then(([, active]: [boolean, string | null]) => {
      if (active === name) {
        return setActiveProfile('');
      }
      return undefined;
    })
    .then(() => {
      showText(`Deleted profile "${name}".`);
      renderProfiles();
    })
    .catch(() => showText('Failed to delete profile.'));
}

// Trigger a download of a bundle as a JSON file.
function downloadBundle(bundle: ProfileExportBundle, filename: string): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Make a filesystem-safe slug from a profile name.
function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(part => part.length > 0)
    .join('-');
  return slug || 'profile';
}

// Export all profiles to a downloaded JSON file.
export function exportProfilesToFile(): void {
  exportProfiles()
    .then((bundle: ProfileExportBundle) => {
      if (!bundle.profiles || Object.keys(bundle.profiles).length === 0) {
        showText('No profiles to export.');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBundle(bundle, `pixels-roll20-profiles-${stamp}.json`);
      showText('Exported all profiles.');
    })
    .catch(() => showText('Failed to export profiles.'));
}

// Export a single profile to a downloaded JSON file.
function exportSingleProfile(name: string): void {
  exportProfile(name)
    .then((bundle: ProfileExportBundle | null) => {
      if (!bundle) {
        showText('Profile not found.');
        renderProfiles();
        return;
      }
      downloadBundle(bundle, `pixels-roll20-profile-${slugify(name)}.json`);
      showText(`Exported profile "${name}".`);
    })
    .catch(() => showText('Failed to export profile.'));
}

// Import profiles from a chosen JSON file, merging (keep-both on name clash).
export function importProfilesFromFile(file: File | undefined): void {
  if (!file) {
    return;
  }
  file
    .text()
    .then((content: string) => {
      let bundle: ProfileExportBundle;
      try {
        bundle = JSON.parse(content);
      } catch {
        showText('Could not read that file (invalid JSON).');
        return;
      }
      importProfiles(bundle)
        .then((result: { imported: number; skipped: number; error?: string }) => {
          if (result.error || result.imported === 0) {
            showText('No profiles found to import.');
            return;
          }
          showText(`Imported ${result.imported} profile(s).`);
          renderProfiles();
        })
        .catch(() => showText('Failed to import profiles.'));
    })
    .catch(() => {
      showText('Could not read that file.');
    });
}
