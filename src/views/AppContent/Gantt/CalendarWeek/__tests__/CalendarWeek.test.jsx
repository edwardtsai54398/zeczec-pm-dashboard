import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { addD, fmtF } from '../../../../../lib/dateUtils.js';
import { sunday } from '../../utils.js';
import styles from '../CalendarWeek.module.css';

// CalendarWeek 自己從 context 取排程/設定(比照 Gantt 測試),
// 測試把 WorkspaceContext / AuthContext 換成可控假實作。
const mockWorkspace = vi.hoisted(() => ({ projects: [], sch: {}, settings: {}, applyTaskDateChange: () => {} }));
const mockAuth = vi.hoisted(() => ({ role: 'owner' }));

vi.mock('../../../../../context/WorkspaceContext.jsx', () => ({
  useWorkspace: () => mockWorkspace,
}));

vi.mock('../../../../../context/AuthContext.jsx', () => ({
  useAuthContext: () => mockAuth,
}));

import CalendarWeek from '../index.jsx';

// CSS Module 的 class 在測試會被 hash,故用 styles 物件組出實際選擇器。
const dot = (...keys) => '.' + keys.map((key) => styles[key]).join('.');

// 行事曆固定顯示「本週」(週日起),測試資料的日期一律相對本週產生。
const weekSunday = sunday(new Date());
const dayKey = (index) => fmtF(addD(weekSunday, index));

function makeProject(id, name, opts = {}) {
  return { id, name, tone: opts.tone || 'lavender', ...opts };
}

// days: { 'YYYY-MM-DD': { h, o } } — 排程器輸出的每日分配明細
function makeTask(id, name, startKey, endKey, hours, days = {}) {
  return { id, n: name, start: startKey, end: endKey, hours, days };
}

function renderCalendar({ projects = [], data = {}, settings = { hoursPerDay: 8 }, onToggleMode = () => {} } = {}) {
  mockWorkspace.projects = projects;
  mockWorkspace.sch = data;
  mockWorkspace.settings = settings;
  return render(<CalendarWeek selectedProjects={projects} onToggleMode={onToggleMode} />);
}

// ============================================================
// 1. 週格線與表頭
// ============================================================

describe('週格線與表頭', () => {
  const projects = [makeProject('P1', '專案A')];
  const data = { P1: {} };

  it('渲染 7 個日欄與 7 個日期頭', () => {
    const { container } = renderCalendar({ projects, data });
    expect(container.querySelectorAll(dot('dayCol')).length).toBe(7);
    expect(container.querySelectorAll(dot('dayHead')).length).toBe(7);
  });

  it('第 1 欄(週日)與第 7 欄(週六)帶 weekend class', () => {
    const { container } = renderCalendar({ projects, data });
    const columns = container.querySelectorAll(dot('dayCol'));
    const weekendClass = styles.weekend;
    expect(columns[0].classList.contains(weekendClass)).toBe(true);
    expect(columns[6].classList.contains(weekendClass)).toBe(true);
    expect(columns[2].classList.contains(weekendClass)).toBe(false);
  });

  it('今天的日期頭帶 today class', () => {
    const { container } = renderCalendar({ projects, data });
    expect(container.querySelector(dot('dayHead', 'today'))).toBeTruthy();
  });

  it('hoursPerDay 決定格線高度:10 小時 → 700px', () => {
    const { container } = renderCalendar({ projects, data, settings: { hoursPerDay: 10 } });
    const bodyGrid = container.querySelector(dot('bodyGrid'));
    expect(bodyGrid.style.height).toBe('700px');
  });
});

// ============================================================
// 2. 任務區塊(依 days 每日分配定位)
// ============================================================

describe('任務區塊', () => {
  const projects = [makeProject('P1', '專案A', { tone: 'lime' })];

  it('依 days 明細定位:top = o×70+1,height = h×70−2', () => {
    const data = {
      P1: {
        T1: makeTask('T1', '設計稿', dayKey(1), dayKey(2), 11, {
          [dayKey(1)]: { h: 8, o: 0 },
          [dayKey(2)]: { h: 3, o: 2 },
        }),
      },
    };
    const { container } = renderCalendar({ projects, data });
    const blocks = container.querySelectorAll(dot('block'));
    expect(blocks.length).toBe(2);
    const secondDayBlock = [...blocks].find(element => element.style.top === '141px');
    expect(secondDayBlock).toBeTruthy();
    expect(secondDayBlock.style.height).toBe('208px');
  });

  it('同一天多個區塊依 offset 排序(DOM 順序 = 視覺順序)', () => {
    const data = {
      P1: {
        T1: makeTask('T1', '後做的', dayKey(1), dayKey(1), 3, { [dayKey(1)]: { h: 3, o: 5 } }),
        T2: makeTask('T2', '先做的', dayKey(1), dayKey(1), 5, { [dayKey(1)]: { h: 5, o: 0 } }),
      },
    };
    const { container } = renderCalendar({ projects, data });
    const blocks = container.querySelectorAll(dot('block'));
    expect(blocks.length).toBe(2);
    expect(blocks[0].textContent).toContain('先做的');
    expect(blocks[1].textContent).toContain('後做的');
  });

  it('週外的 days 明細不渲染', () => {
    const data = {
      P1: {
        T1: makeTask('T1', '下週任務', dayKey(10), dayKey(10), 8, { [dayKey(10)]: { h: 8, o: 0 } }),
      },
    };
    const { container } = renderCalendar({ projects, data });
    expect(container.querySelectorAll(dot('block')).length).toBe(0);
  });

  it('區塊顯示任務名與當日工時,並帶專案 tone class', () => {
    const data = {
      P1: { T1: makeTask('T1', '設計稿', dayKey(1), dayKey(1), 8, { [dayKey(1)]: { h: 8, o: 0 } }) },
    };
    const { container } = renderCalendar({ projects, data });
    const block = container.querySelector(dot('block', 'lime'));
    expect(block).toBeTruthy();
    expect(block.textContent).toContain('設計稿');
    expect(block.textContent).toContain('8h');
  });

  it('hover 區塊顯示 tooltip,含「本日 Xh」', () => {
    const data = {
      P1: {
        T1: makeTask('T1', '設計稿', dayKey(1), dayKey(2), 11, {
          [dayKey(1)]: { h: 8, o: 0 },
          [dayKey(2)]: { h: 3, o: 0 },
        }),
      },
    };
    const { container } = renderCalendar({ projects, data });
    const block = [...container.querySelectorAll(dot('block'))].find(element => element.style.height === '208px');
    fireEvent.mouseEnter(block);
    const tooltip = container.querySelector(dot('tooltip'));
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toContain('設計稿');
    expect(tooltip.textContent).toContain('本日 3h');
    expect(tooltip.textContent).toContain('共 11h');
    fireEvent.mouseLeave(block);
    expect(container.querySelector(dot('tooltip'))).toBeFalsy();
  });
});

// ============================================================
// 3. 0 工時任務(整天列)
// ============================================================

describe('0 工時任務(整天列)', () => {
  const projects = [makeProject('P1', '專案A')];

  it('0 工時任務渲染為整天列 chip,不佔小時格', () => {
    const data = {
      P1: { T1: makeTask('T1', '正式發文', dayKey(3), dayKey(3), 0, { [dayKey(3)]: { h: 0, o: 0 } }) },
    };
    const { container } = renderCalendar({ projects, data });
    expect(container.querySelector(dot('allDayRow'))).toBeTruthy();
    const chip = container.querySelector(dot('chip'));
    expect(chip.textContent).toBe('正式發文');
    expect(container.querySelectorAll(dot('block')).length).toBe(0);
  });

  it('沒有 0 工時任務時不渲染整天列', () => {
    const data = {
      P1: { T1: makeTask('T1', '設計稿', dayKey(1), dayKey(1), 8, { [dayKey(1)]: { h: 8, o: 0 } }) },
    };
    const { container } = renderCalendar({ projects, data });
    expect(container.querySelector(dot('allDayRow'))).toBeFalsy();
  });
});

// ============================================================
// 4. 里程碑與期間帶
// ============================================================

describe('里程碑與期間帶', () => {
  it('campaignStart 在本週時渲染里程碑', () => {
    const projects = [makeProject('P1', '專案A', { campaignStart: dayKey(3) })];
    const { container } = renderCalendar({ projects, data: { P1: {} } });
    const milestones = container.querySelectorAll(dot('milestone'));
    expect(milestones.length).toBe(1);
    expect(milestones[0].textContent).toContain('上線日');
  });

  it('campaignStart 在週外時不渲染里程碑', () => {
    const projects = [makeProject('P1', '專案A', { campaignStart: dayKey(9) })];
    const { container } = renderCalendar({ projects, data: { P1: {} } });
    expect(container.querySelectorAll(dot('milestone')).length).toBe(0);
  });

  it('期間與本週重疊時渲染期間帶(裁切到週界)', () => {
    const projects = [makeProject('P1', '專案A', { surveyStart: dayKey(-3), surveyEnd: dayKey(2) })];
    const { container } = renderCalendar({ projects, data: { P1: {} } });
    const bar = container.querySelector(dot('periodBar'));
    expect(bar).toBeTruthy();
    // 起點在週外 → 裁到週日(left 0%),迄點 dayKey(2) → 覆蓋 3/7 欄寬
    expect(bar.style.left).toBe('0%');
    expect(parseFloat(bar.style.width)).toBeCloseTo((3 / 7) * 100, 1);
  });

  it('期間完全在週外時不渲染期間帶', () => {
    const projects = [makeProject('P1', '專案A', { surveyStart: dayKey(10), surveyEnd: dayKey(14) })];
    const { container } = renderCalendar({ projects, data: { P1: {} } });
    expect(container.querySelector(dot('periodRow'))).toBeFalsy();
  });
});

// ============================================================
// 5. 導覽與模式切換
// ============================================================

describe('導覽與模式切換', () => {
  const projects = [makeProject('P1', '專案A')];
  const data = { P1: {} };

  it('下一週按鈕讓表頭日期 +7', () => {
    const { container } = renderCalendar({ projects, data });
    const firstDayNum = () => container.querySelectorAll(dot('dayNum'))[0].textContent;
    const before = firstDayNum();
    const nextBtn = screen.getAllByRole('button').find(btn => btn.querySelector('.ti-chevron-right'));
    fireEvent.click(nextBtn);
    expect(firstDayNum()).toBe(String(addD(weekSunday, 7).getDate()));
    expect(firstDayNum()).not.toBe(before);
  });

  it('「回到今天」回到本週(週日為首欄)', () => {
    const { container } = renderCalendar({ projects, data });
    const nextBtn = screen.getAllByRole('button').find(btn => btn.querySelector('.ti-chevron-right'));
    fireEvent.click(nextBtn);
    fireEvent.click(screen.getByText('回到今天'));
    const firstDayNum = container.querySelectorAll(dot('dayNum'))[0].textContent;
    expect(firstDayNum).toBe(String(weekSunday.getDate()));
  });

  it('點「甘特圖模式」呼叫 onToggleMode', () => {
    const onToggleMode = vi.fn();
    renderCalendar({ projects, data, onToggleMode });
    fireEvent.click(screen.getByText('甘特圖模式'));
    expect(onToggleMode).toHaveBeenCalledOnce();
  });
});
