import { DEFAULT_PREFERENCES, PREFERENCE_KEY } from '../constants.js';

export function readPreference() {
  try {
    const raw = localStorage.getItem(PREFERENCE_KEY);
    return { ...DEFAULT_PREFERENCES, ...(raw ? JSON.parse(raw) : null) };
  } catch (e) {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function writePreference(pref) {
  try {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify(pref));
  } catch (e) {}
}
