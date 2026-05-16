export const TONES = {
  lavender: { bg: "var(--t-lavender)", ink: "var(--t-lavender-ink)" },
  lime:     { bg: "var(--t-lime)",     ink: "var(--t-lime-ink)" },
  peach:    { bg: "var(--t-peach)",    ink: "var(--t-peach-ink)" },
  rose:     { bg: "var(--t-rose)",     ink: "var(--t-rose-ink)" },
  sky:      { bg: "var(--t-sky)",      ink: "var(--t-sky-ink)" },
  olive:    { bg: "var(--t-olive)",    ink: "var(--t-olive-ink)" },
  charcoal: { bg: "var(--t-charcoal)", ink: "var(--t-charcoal-ink)" },
};

const COLOR_TO_TONE = {
  "#7F77DD": "lavender",
  "#1D9E75": "lime",
  "#D85A30": "peach",
  "#378ADD": "sky",
  "#D4537E": "rose",
};

export function getTone(p) {
  if (!p) return TONES.lavender;
  if (p.tone && TONES[p.tone]) return TONES[p.tone];
  if (p.color && COLOR_TO_TONE[p.color]) return TONES[COLOR_TO_TONE[p.color]];
  return TONES.lavender;
}

export const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

export const greetingFor = (h) =>
  h < 5 ? "深夜好" : h < 12 ? "早安" : h < 14 ? "午安" : h < 18 ? "下午好" : "晚安";
