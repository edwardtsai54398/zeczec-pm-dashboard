import { DEFAULT_PREFERENCES, PREFERENCE_KEY, ACTIVE_WORKSPACE_KEY } from '../constants.js';

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

// 記住使用者上次選的工作區,重整後沿用同一個。
export function readActiveWorkspaceId() {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY) || null;
  } catch (e) {
    return null;
  }
}

export function writeActiveWorkspaceId(id) {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
  } catch (e) {}
}
