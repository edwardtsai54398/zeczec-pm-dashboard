import { mkTasks } from './lib/scheduler.js';
import { BT } from './lib/tasks.js';

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
  { k: "gantt",     icon: "chart-gantt",      label: "甘特圖" },
  { k: "project",   icon: "folders",          label: "專案" },
  { k: "kol",       icon: "users",            label: "KOL" },
  { k: "settings",  icon: "settings",         label: "設定" },
];

export const D_SETTINGS = {
  hoursPerDay: 8,
  blackouts: [
    { id: "1", name: "出國",     start: "2026-06-20", end: "2026-06-26" },
    { id: "2", name: "員工旅遊", start: "2026-07-10", end: "2026-07-16" },
  ],
};

export const D_PROJECTS = [
  {
    id: "saba", name: "SABA RO 飲水機", template: "full", mode: "forward",
    startDate: "2026-05-19", surveyStart: "", surveyEnd: "",
    campaignStart: "", campaignEnd: "",
    tone: "lavender", color: "#7F77DD",
    tasks: mkTasks("full"), kols: [],
    notes: "電檢完成，可立刻啟動",
  },
  {
    id: "bleeq", name: "BleeqUP AI 眼鏡", template: "pm", mode: "backward",
    startDate: "", surveyStart: "", surveyEnd: "",
    campaignStart: "", campaignEnd: "",
    tone: "lime", color: "#1D9E75",
    tasks: mkTasks("pm").map((t) => ({ ...t, enabled: t.enabled && !(BT.find((b) => b.id === t.id) || {}).sh })),
    kols: [],
    notes: "電檢未通過。不拍攝，用原廠素材",
  },
  {
    id: "inmo", name: "INMO AI 眼鏡", template: "pm", mode: "backward",
    startDate: "", surveyStart: "", surveyEnd: "",
    campaignStart: "", campaignEnd: "",
    tone: "peach", color: "#D85A30",
    tasks: mkTasks("pm").map((t) => ({ ...t, enabled: t.enabled && !(BT.find((b) => b.id === t.id) || {}).sh })),
    kols: [],
    notes: "電檢未通過。不拍攝，用原廠素材",
  },
];
