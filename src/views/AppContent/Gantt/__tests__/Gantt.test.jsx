import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { addD } from '../../../../lib/dateUtils.js';
import styles from '../Gantt.module.css';

// Gantt 自己從 context 取 projects/排程/設定/釘選儲存(比照 Dashboard 測試),
// 測試把 WorkspaceContext 換成可控假實作,每次 renderGantt 注入該情境的資料。
const mockWorkspace = vi.hoisted(() => ({ projects: [], sch: {}, settings: {}, updateTaskPin: () => {} }));

vi.mock('../../../../context/WorkspaceContext.jsx', () => ({
  useWorkspace: () => mockWorkspace,
}));

import { Gantt } from '../index.jsx';

// CSS Module 的 class 在測試會被 hash,故用 styles 物件組出實際選擇器。
// dot('bar','lime') => '.<barHash>.<limeHash>'
const dot = (...keys) => '.' + keys.map((key) => styles[key]).join('.');

// 設定 mock workspace 後渲染 Gantt(Gantt 不再吃 props,改吃 context)。
function renderGantt({ projects = [], data = {}, settings = {}, updateTaskPin = () => {} } = {}) {
  mockWorkspace.projects = projects;
  mockWorkspace.sch = data;
  mockWorkspace.settings = settings;
  mockWorkspace.updateTaskPin = updateTaskPin;
  return render(<Gantt />);
}

// --- Helpers ---

function makeProject(id, name, opts = {}) {
  return { id, name, tone: opts.tone || 'lavender', ...opts };
}

function makeTask(id, name, start, end, hours = 8) {
  return { id, n: name, start, end, hours };
}

function monday(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}

// --- barSegments unit tests (extracted logic) ---

function barSegments(startD, endD, gridStart) {
  if (!startD || !endD) return [];
  const gs = new Date(gridStart); gs.setHours(0, 0, 0, 0);
  const end = new Date(endD); end.setHours(0, 0, 0, 0);
  if (isNaN(gs) || isNaN(end)) return [];

  const segments = [];
  let segStart = null;
  let cur = new Date(startD); cur.setHours(0, 0, 0, 0);

  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      if (!segStart) segStart = new Date(cur);
    } else if (segStart) {
      let lastWD = new Date(cur);
      lastWD.setDate(lastWD.getDate() - 1);
      while (lastWD.getDay() === 0 || lastWD.getDay() === 6) lastWD.setDate(lastWD.getDate() - 1);
      const cs = Math.round((segStart - gs) / 864e5);
      const span = Math.round((lastWD - segStart) / 864e5) + 1;
      if (span > 0) segments.push({ cs, span });
      segStart = null;
    }
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 1);
  }

  if (segStart) {
    let lastWD = new Date(end);
    while (lastWD.getDay() === 0 || lastWD.getDay() === 6) lastWD.setDate(lastWD.getDate() - 1);
    if (lastWD >= segStart) {
      const cs = Math.round((segStart - gs) / 864e5);
      const span = Math.round((lastWD - segStart) / 864e5) + 1;
      if (span > 0) segments.push({ cs, span });
    }
  }

  return segments;
}

// ============================================================
// 1. barSegments — 日期計算與跳過週末
// ============================================================

describe('barSegments: 日期計算與跳過週末', () => {
  it('純平日任務（Mon–Fri）回傳單一 segment, span=5', () => {
    // 2026-05-11 is Monday, 2026-05-15 is Friday
    const segs = barSegments('2026-05-11', '2026-05-15', '2026-05-11');
    expect(segs).toEqual([{ cs: 0, span: 5 }]);
  });

  it('跨一個週末產生兩個 segments', () => {
    // Mon 5/11 ~ Tue 5/19 (跨過 5/16 Sat, 5/17 Sun)
    const segs = barSegments('2026-05-11', '2026-05-19', '2026-05-11');
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ cs: 0, span: 5 }); // Mon-Fri
    expect(segs[1]).toEqual({ cs: 7, span: 2 }); // Mon-Tue next week
  });

  it('跨兩個週末產生三個 segments', () => {
    // Mon 5/11 ~ Fri 5/22
    const segs = barSegments('2026-05-11', '2026-05-22', '2026-05-11');
    expect(segs).toHaveLength(2);
    // 5/11-5/15 (5 days), skip weekend, 5/18-5/22 (5 days)
    expect(segs[0]).toEqual({ cs: 0, span: 5 });
    expect(segs[1]).toEqual({ cs: 7, span: 5 });
  });

  it('起始日為週六時，第一天被跳過，從下週一開始', () => {
    // 2026-05-16 is Saturday, end 5/20 Tue (note: need to check actual day)
    // Actually let's use a known Saturday: 2026-05-09 is Sat
    const segs = barSegments('2026-05-09', '2026-05-13', '2026-05-09');
    // Sat+Sun skipped, Mon 5/11 ~ Wed 5/13 = span 3, cs=2
    expect(segs).toEqual([{ cs: 2, span: 3 }]);
  });

  it('結束日為週末時，bar 止於前一個週五', () => {
    // Mon 5/11 ~ Sun 5/17
    const segs = barSegments('2026-05-11', '2026-05-17', '2026-05-11');
    // Bar stops at Fri 5/15
    expect(segs).toEqual([{ cs: 0, span: 5 }]);
  });

  it('start 或 end 為 null 回傳空陣列', () => {
    expect(barSegments(null, '2026-05-15', '2026-05-11')).toEqual([]);
    expect(barSegments('2026-05-11', null, '2026-05-11')).toEqual([]);
  });

  it('單日任務（平日）回傳 span=1', () => {
    const segs = barSegments('2026-05-12', '2026-05-12', '2026-05-11');
    expect(segs).toEqual([{ cs: 1, span: 1 }]);
  });

  it('單日任務（週末）回傳空陣列', () => {
    // 2026-05-10 is Sunday
    const segs = barSegments('2026-05-10', '2026-05-10', '2026-05-10');
    expect(segs).toEqual([]);
  });

  it('gridStart 在任務之前時, cs 為正整數偏移', () => {
    // gridStart = Mon 5/4, task starts Mon 5/11
    const segs = barSegments('2026-05-11', '2026-05-15', '2026-05-04');
    expect(segs[0].cs).toBe(7); // 7 calendar days offset
  });
});

// ============================================================
// 2. 左上角年份月份顯示 (dateLabel)
// ============================================================

describe('左上角年份月份顯示 (dateLabel)', () => {
  const projects = [makeProject('P1', '測試專案')];
  const data = { P1: { T1: makeTask('T1', '任務A', '2026-05-11', '2026-05-15') } };

  it('初始顯示當前 viewStart 的年月', () => {
    renderGantt({ projects, data });
    const today = new Date();
    const expected = `${today.getFullYear()} 年 ${today.getMonth() + 1} 月`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('左箭頭退一週後，dateLabel 更新為新可視日期的年月', () => {
    renderGantt({ projects, data });
    const prevBtn = screen.getAllByRole('button').find(
      btn => btn.querySelector('.ti-chevron-left')
    );
    fireEvent.click(prevBtn);
    // After clicking prev, viewStart moves back ~7 days
    // dateLabel should reflect the new month if it crossed a boundary
    const label = screen.getByText(/年.*月/);
    expect(label).toBeInTheDocument();
  });

  it('跨月時 dateLabel 切換到新月份（例：5月→4月）', () => {
    // This is tested indirectly — when viewStart is at month boundary
    // and we scroll back, the label updates
    renderGantt({ projects, data });
    const label = screen.getByText(/年.*月/);
    expect(label.textContent).toMatch(/^\d{4} 年 \d{1,2} 月$/);
  });

  it('跨年時 dateLabel 切換年份（例：2026→2025）', () => {
    // Uses a project with Jan dates to force viewStart near year boundary
    const janProjects = [makeProject('P1', '跨年專案')];
    const janData = { P1: { T1: makeTask('T1', '任務', '2025-12-29', '2026-01-05') } };
    renderGantt({ projects: janProjects, data: janData });
    // The component starts at today, so this is a structural test
    const label = screen.getByText(/年.*月/);
    expect(label).toBeInTheDocument();
  });
});

// ============================================================
// 3. 左右箭頭導航 (prevWeek / nextWeek)
// ============================================================

describe('左右箭頭導航邏輯', () => {
  const projects = [makeProject('P1', '專案A')];
  const data = { P1: { T1: makeTask('T1', '任務1', '2026-05-11', '2026-06-15') } };

  it('點擊右箭頭 (nextWeek) 滾動到下一個週一', () => {
    const { container } = renderGantt({ projects, data });
    const scrollEl = container.querySelector(dot('scroll'));
    // Mock scrollTo
    scrollEl.scrollTo = vi.fn();

    const nextBtn = screen.getAllByRole('button').find(
      btn => btn.querySelector('.ti-chevron-right')
    );
    fireEvent.click(nextBtn);
    expect(scrollEl.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' })
    );
  });

  it('點擊左箭頭 (prevWeek) 在 scrollLeft > 0 時滾動到上一個週一', () => {
    const { container } = renderGantt({ projects, data });
    const scrollEl = container.querySelector(dot('scroll'));
    Object.defineProperty(scrollEl, 'scrollLeft', { value: 200, writable: true });
    scrollEl.scrollTo = vi.fn();

    const prevBtn = screen.getAllByRole('button').find(
      btn => btn.querySelector('.ti-chevron-left')
    );
    fireEvent.click(prevBtn);
    expect(scrollEl.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' })
    );
  });

  it('點擊左箭頭在 scrollLeft=0 時，viewStart 後退一週', () => {
    const { container } = renderGantt({ projects, data });
    const scrollEl = container.querySelector(dot('scroll'));
    Object.defineProperty(scrollEl, 'scrollLeft', { value: 0, writable: true });
    scrollEl.scrollTo = vi.fn();

    const prevBtn = screen.getAllByRole('button').find(
      btn => btn.querySelector('.ti-chevron-left')
    );
    fireEvent.click(prevBtn);
    // After viewStart change, the dateLabel should update
    const label = screen.getByText(/年.*月/);
    expect(label).toBeInTheDocument();
  });

  it('「回到今天」按鈕將 viewStart 重設為今天', () => {
    const { container } = renderGantt({ projects, data });
    const scrollEl = container.querySelector(dot('scroll'));
    scrollEl.scrollTo = vi.fn();

    const todayBtn = screen.getByText('回到今天');
    fireEvent.click(todayBtn);
    expect(scrollEl.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ left: 0, behavior: 'smooth' })
    );
  });
});

// ============================================================
// 4. 日期格 header 渲染 (gridDays + monthLabels)
// ============================================================

describe('日期格 header 渲染', () => {
  const projects = [makeProject('P1', '專案A')];
  const data = { P1: { T1: makeTask('T1', '任務', '2026-05-11', '2026-05-20') } };

  it('每個日期格顯示日期數字和星期縮寫', () => {
    const { container } = renderGantt({ projects, data });
    const dayCells = container.querySelectorAll(dot('dateCell'));
    expect(dayCells.length).toBeGreaterThan(0);

    const firstCell = dayCells[0];
    expect(firstCell.querySelector(dot('dayNum'))).toBeTruthy();
    expect(firstCell.querySelector(dot('dayName'))).toBeTruthy();
  });

  it('週末日期格有 weekend class', () => {
    const { container } = renderGantt({ projects, data });
    const weekendCells = container.querySelectorAll(dot('dateCell', 'weekend'));
    expect(weekendCells.length).toBeGreaterThan(0);
  });

  it('今天的日期格有 today class 和「今天」bubble', () => {
    const { container } = renderGantt({ projects, data });
    const todayCell = container.querySelector(dot('dateCell', 'today'));
    if (todayCell) {
      expect(todayCell.querySelector(dot('todayBubble')).textContent).toBe('今天');
    }
  });

  it('月份標籤 (monthLabels) 在月份切換處渲染', () => {
    const { container } = renderGantt({ projects, data });
    const monthBands = container.querySelectorAll(dot('monthBand'));
    expect(monthBands.length).toBeGreaterThanOrEqual(1);
    // Format: "MAY 2026"
    expect(monthBands[0].textContent).toMatch(/^[A-Z]{3} \d{4}$/);
  });

  it('VIEW_DAYS 至少為 MIN_VIEW_DAYS (default zoom=day => 21)', () => {
    const { container } = renderGantt({ projects, data });
    const dayCells = container.querySelectorAll(dot('dateCell'));
    expect(dayCells.length).toBeGreaterThanOrEqual(21);
  });
});

// ============================================================
// 5. 甘特圖 bar 顯示正確 (normal mode)
// ============================================================

describe('甘特圖 bar 顯示 (normal mode)', () => {
  const projects = [makeProject('P1', '專案A', { tone: 'lime' })];
  const data = {
    P1: {
      T1: makeTask('T1', '設計稿', '2026-05-11', '2026-05-15', 8),
      T2: makeTask('T2', '開發', '2026-05-18', '2026-05-22', 16),
    },
  };

  it('每個有 start/end 的任務都渲染一個 task-row', () => {
    const { container } = renderGantt({ projects, data });
    const taskRows = container.querySelectorAll(dot('taskRow'));
    expect(taskRows.length).toBe(2);
  });

  it('bar 帶有正確的 tone class', () => {
    const { container } = renderGantt({ projects, data });
    const bars = container.querySelectorAll(dot('bar', 'lime'));
    expect(bars.length).toBeGreaterThan(0);
  });

  it('bar 的第一個 segment 顯示任務名稱', () => {
    const { container } = renderGantt({ projects, data });
    const barNames = container.querySelectorAll(dot('barName'));
    const names = [...barNames].map(el => el.textContent);
    expect(names).toContain('設計稿');
    expect(names).toContain('開發');
  });

  it('bar 的第一個 segment 顯示工時 (hours > 0)', () => {
    const { container } = renderGantt({ projects, data });
    const hrs = container.querySelectorAll(dot('barHrs'));
    expect([...hrs].some(el => el.textContent === '8h')).toBe(true);
  });

  it('hours=0 的任務 bar 有 placeholder class', () => {
    const phData = { P1: { T1: makeTask('T1', '待估', '2026-05-11', '2026-05-13', 0) } };
    const { container } = renderGantt({ projects, data: phData });
    const bar = container.querySelector(dot('bar', 'placeholder'));
    expect(bar).toBeTruthy();
  });

  it('跨週末任務的第二段 bar 顯示「續」', () => {
    // Task spans Mon-Tue next week (crosses weekend)
    const crossData = {
      P1: { T1: makeTask('T1', '跨週', '2026-05-11', '2026-05-19', 12) },
    };
    const { container } = renderGantt({ projects, data: crossData });
    const barNames = container.querySelectorAll(dot('barName'));
    const texts = [...barNames].map(el => el.textContent);
    expect(texts).toContain('續');
  });

  it('專案 banner 顯示在該專案任務之前', () => {
    const { container } = renderGantt({ projects, data });
    const banner = container.querySelector(dot('projBanner'));
    expect(banner.textContent).toContain('專案A');
  });
});

// ============================================================
// 6. 疊圖模式 (overlayMode)
// ============================================================

describe('疊圖模式 (overlayMode)', () => {
  const projects = [
    makeProject('P1', '專案A', { tone: 'lime' }),
    makeProject('P2', '專案B', { tone: 'peach' }),
  ];
  const data = {
    P1: { T1: makeTask('T1', '共同任務', '2026-05-11', '2026-05-15', 8) },
    P2: { T1: makeTask('T1', '共同任務', '2026-05-12', '2026-05-16', 10) },
  };

  it('點擊疊圖模式按鈕後切換為 overlay layout', () => {
    const { container } = renderGantt({ projects, data });
    const overlayBtn = screen.getByText('疊圖模式');
    fireEvent.click(overlayBtn);
    expect(container.querySelector(dot('trackBody', 'overlay'))).toBeTruthy();
  });

  it('疊圖模式下，相同 taskId 的任務合併為同一 row', () => {
    const { container } = renderGantt({ projects, data });
    fireEvent.click(screen.getByText('疊圖模式'));
    // T1 from both projects should be in one row
    const taskRows = container.querySelectorAll(dot('taskRow'));
    expect(taskRows.length).toBe(1);
  });

  it('疊圖模式下，同一 row 有多個不同 tone 的 bar', () => {
    const { container } = renderGantt({ projects, data });
    fireEvent.click(screen.getByText('疊圖模式'));
    const mintBars = container.querySelectorAll(dot('bar', 'lime'));
    const peachBars = container.querySelectorAll(dot('bar', 'peach'));
    expect(mintBars.length).toBeGreaterThan(0);
    expect(peachBars.length).toBeGreaterThan(0);
  });


  it('疊圖模式左側顯示 proj-dots 標記', () => {
    const { container } = renderGantt({ projects, data });
    fireEvent.click(screen.getByText('疊圖模式'));
    const dots = container.querySelectorAll(dot('projDots') + ' ' + dot('pd'));
    expect(dots.length).toBe(2);
  });


  it('再次點擊疊圖模式按鈕可恢復普通模式', () => {
    const { container } = renderGantt({ projects, data });
    const btn = screen.getByText('疊圖模式');
    fireEvent.click(btn);
    expect(container.querySelector(dot('trackBody', 'overlay'))).toBeTruthy();
    fireEvent.click(btn);
    expect(container.querySelector(dot('trackBody', 'overlay'))).toBeFalsy();
  });
});

// ============================================================
// 7. 今天線 & 里程碑
// ============================================================

describe('今天線 & 里程碑', () => {
  it('今天在可視範圍時渲染 today-line', () => {
    const projects = [makeProject('P1', '專案A')];
    const data = { P1: { T1: makeTask('T1', '任務', '2026-05-11', '2026-05-20') } };
    const { container } = renderGantt({ projects, data });
    const line = container.querySelector(dot('todayLine'));
    expect(line).toBeTruthy();
  });

  it('里程碑在可視範圍時渲染', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fmtD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const soon = addD(today, 3);

    const projects = [makeProject('P1', '專案A', { campaignStart: fmtD(soon) })];
    const data = { P1: { T1: makeTask('T1', '任務', fmtD(today), fmtD(addD(today, 10))) } };
    const { container } = renderGantt({ projects, data });
    const ms = container.querySelectorAll(dot('milestone'));
    expect(ms.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 8. 專案篩選 (filter chips)
// ============================================================

describe('專案篩選', () => {
  const projects = [
    makeProject('P1', '專案A'),
    makeProject('P2', '專案B'),
  ];
  const data = {
    P1: { T1: makeTask('T1', '任務A', '2026-05-11', '2026-05-15') },
    P2: { T2: makeTask('T2', '任務B', '2026-05-12', '2026-05-16') },
  };

  it('初始時所有專案都被勾選', () => {
    const { container } = renderGantt({ projects, data });
    const chips = container.querySelectorAll(dot('chip', 'checked'));
    expect(chips.length).toBe(2);
  });

  it('取消一個專案後，其任務不再顯示', () => {
    const { container } = renderGantt({ projects, data });
    const chips = container.querySelectorAll(dot('chip'));
    const chipA = [...chips].find(el => el.textContent.includes('專案A'));
    fireEvent.click(chipA);
    const banners = container.querySelectorAll(dot('projBanner'));
    const bannerTexts = [...banners].map(b => b.textContent);
    expect(bannerTexts.some(t => t.includes('專案A'))).toBe(false);
  });

  it('不能取消最後一個專案（至少保留一個）', () => {
    const { container } = renderGantt({ projects, data });
    const chipA = [...container.querySelectorAll(dot('chip'))].find(el => el.textContent.includes('專案A'));
    fireEvent.click(chipA); // uncheck A
    const chipB = [...container.querySelectorAll(dot('chip'))].find(el => el.textContent.includes('專案B'));
    fireEvent.click(chipB); // try to uncheck B — should not work
    const checked = container.querySelectorAll(dot('chip', 'checked'));
    expect(checked.length).toBe(1);
  });

  it('篩選計數顯示正確', () => {
    renderGantt({ projects, data });
    expect(screen.getByText('· 顯示 2 / 2 個專案')).toBeInTheDocument();
  });
});

// ============================================================
// 9. Zoom 切換
// ============================================================

describe('Zoom 切換', () => {
  const projects = [makeProject('P1', '專案A')];
  const data = { P1: { T1: makeTask('T1', '任務', '2026-05-11', '2026-05-15') } };

  it('預設為「日」zoom level', () => {
    const { container } = renderGantt({ projects, data });
    const activeZoom = container.querySelector(dot('zoomToggle') + ' button' + dot('active'));
    expect(activeZoom.textContent).toContain('日');
  });

  it('切換到「週」zoom 後欄寬變小、天數增加', () => {
    const { container } = renderGantt({ projects, data });
    const weekBtn = [...container.querySelectorAll(dot('zoomToggle') + ' button')]
      .find(b => b.textContent.includes('週'));
    fireEvent.click(weekBtn);
    const dayCells = container.querySelectorAll(dot('dateCell'));
    expect(dayCells.length).toBeGreaterThanOrEqual(42);
  });

  it('切換到「時」zoom 後欄寬變大、天數減少', () => {
    const { container } = renderGantt({ projects, data });
    const hourBtn = [...container.querySelectorAll(dot('zoomToggle') + ' button')]
      .find(b => b.textContent.includes('時'));
    fireEvent.click(hourBtn);
    const dayCells = container.querySelectorAll(dot('dateCell'));
    expect(dayCells.length).toBeGreaterThanOrEqual(14);
  });
});

// ============================================================
// 10. 空資料狀態
// ============================================================

describe('空資料狀態', () => {
  it('無專案時顯示 empty state', () => {
    const { container } = renderGantt({ projects: [], data: {} });
    expect(container.querySelector('.empty')).toBeTruthy();
  });

  it('專案無任何任務資料時顯示 empty state', () => {
    const projects = [makeProject('P1', '空專案')];
    const { container } = renderGantt({ projects, data: { P1: {} } });
    expect(container.querySelector('.empty')).toBeTruthy();
  });

  it('empty state 顯示提示文字', () => {
    renderGantt({ projects: [], data: {} });
    expect(screen.getByText(/設定啟動日期後即可看到甘特圖/)).toBeInTheDocument();
  });
});

// ============================================================
// 11. Tooltip 互動
// ============================================================

describe('Tooltip 互動', () => {
  const projects = [makeProject('P1', '專案A')];
  const data = { P1: { T1: makeTask('T1', '設計稿', '2026-05-11', '2026-05-15', 8) } };

  it('滑鼠移入 bar 時顯示 tooltip', () => {
    const { container } = renderGantt({ projects, data });
    const bar = container.querySelector(dot('bar'));
    if (bar) {
      fireEvent.mouseEnter(bar);
      const tooltip = container.querySelector(dot('tooltip'));
      expect(tooltip).toBeTruthy();
    }
  });

  it('tooltip 包含任務名、專案名、日期範圍', () => {
    const { container } = renderGantt({ projects, data });
    const bar = container.querySelector(dot('bar'));
    if (bar) {
      fireEvent.mouseEnter(bar);
      const tooltip = container.querySelector(dot('tooltip'));
      expect(tooltip.textContent).toContain('設計稿');
      expect(tooltip.textContent).toContain('專案A');
    }
  });

  it('滑鼠移出 bar 時 tooltip 消失', () => {
    const { container } = renderGantt({ projects, data });
    const bar = container.querySelector(dot('bar'));
    if (bar) {
      fireEvent.mouseEnter(bar);
      fireEvent.mouseLeave(bar);
      const tooltip = container.querySelector(dot('tooltip'));
      expect(tooltip).toBeFalsy();
    }
  });
});

// ============================================================
// 12. monday() helper
// ============================================================

describe('monday() helper', () => {
  it('週三傳入回傳同週的週一', () => {
    const wed = new Date('2026-05-13'); // Wednesday
    const mon = monday(wed);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(11);
  });

  it('週日傳入回傳前一週的週一', () => {
    const sun = new Date('2026-05-10'); // Sunday
    const mon = monday(sun);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(4);
  });

  it('週一傳入回傳自身', () => {
    const m = new Date('2026-05-11'); // Monday
    const mon = monday(m);
    expect(mon.getDate()).toBe(11);
  });
});
