export const STORAGE_KEY = "cfpm4";


export const TONE_PALETTE = ["lavender", "lime", "peach", "sky", "rose", "olive"];

export const ACCENT_PALETTES = [
  ["#C9C5F0", "#5A52B8", "#E5E3F8"],
  ["#DDEF8B", "#586E1B", "#EEF5C0"],
  ["#F5C9A8", "#9C5421", "#FBE3D0"],
  ["#BBDDEA", "#2A6E8C", "#D9ECF3"],
];

export const ACCENT_INK = {
  "#C9C5F0": "#2E2780",
  "#DDEF8B": "#2E3B0D",
  "#F5C9A8": "#5C2F12",
  "#BBDDEA": "#143E51",
};

export const TWEAK_DEFAULTS = {
  accent: ["#F5C9A8", "#9C5421", "#FBE3D0"],
  density: "compact",
  ambient: true,
  showAvatar: true,
};

export const NAV = [
  { k: "dashboard", icon: "layout-dashboard", label: "總覽" },
  { k: "gantt", icon: "align-left", label: "甘特圖" },
  { k: "project", icon: "folders", label: "專案" },
  { k: "kol", icon: "letter-k", label: "KOL" },
  { k: "settings", icon: "settings", label: "設定" },
];

export const D_SETTINGS = {
  hoursPerDay: 8,
};

// 每位使用者各自的 UI 偏好(貓)單獨存一個 key,與 workspace 共用的 cfpm4(專案+排程設定)分開。
export const PREFERENCE_KEY = "preference";

// 目前選到的工作區(多工作區切換用),純本機 UI 狀態,不上雲。
export const ACTIVE_WORKSPACE_KEY = "active_workspace";

export const DEFAULT_PREFERENCES = {
  catEnabled: true,
  catCount: 20,
};

export const DEFAULT_WORKSPACE_SETTINGS = {
  hoursPerDay: D_SETTINGS.hoursPerDay,
};

// 成員加入工作區時(含 onboarding 的 owner)直接種進 workspace_members.settings 的預設。
// 每人一進來就有明確的每日工時,不再靠讀取端的 fallback 補;休假一開始為空。
export const DEFAULT_MEMBER_SETTINGS = {
  daily_hours: D_SETTINGS.hoursPerDay,
  days_off: [],
};
