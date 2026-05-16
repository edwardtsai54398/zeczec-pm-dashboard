export const addD = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const fmt = (d) => {
  if (!d) return "—";
  const t = d instanceof Date ? d : new Date(d);
  return isNaN(t) ? "—" : `${t.getMonth() + 1}/${t.getDate()}`;
};

export const fmtF = (d) => {
  if (!d) return "";
  const t = d instanceof Date ? d : new Date(d);
  if (isNaN(t)) return "";
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

export const pD = (s) => {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d) ? null : d;
};

export const dBt = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

export const isWE = (d) => {
  const x = new Date(d).getDay();
  return x === 0 || x === 6;
};

export const isBO = (d, bl) =>
  (bl || []).some((b) => {
    const s = pD(b.start), e = pD(b.end);
    return s && e && new Date(d) >= s && new Date(d) <= e;
  });

export const nWD = (d, bl) => {
  let c = new Date(d);
  while (isWE(c) || isBO(c, bl)) c = addD(c, 1);
  return c;
};

export const aWD = (s, n, bl) => {
  let c = new Date(s), r = n;
  while (r > 0) {
    c = addD(c, 1);
    if (!isWE(c) && !isBO(c, bl)) r--;
  }
  return c;
};

export const sWD = (e, n, bl) => {
  let c = new Date(e), r = n;
  while (r > 0) {
    c = addD(c, -1);
    if (!isWE(c) && !isBO(c, bl)) r--;
  }
  return c;
};
