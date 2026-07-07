import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { addD, fmtF } from '../../../../../lib/dateUtils.js';
import { sunday } from '../../utils.js';
import styles from '../CalendarWeek.module.css';

// CalendarWeek 自己從 context 取排程,並自持成員清單/顯示開關;
// 測試把 WorkspaceContext / AuthContext / useWorkspaceMembers 換成可控假實作。
const mockWorkspace = vi.hoisted(() => ({ projects: [], sch: {}, applyTaskDateChange: () => {} }));
const mockAuth = vi.hoisted(() => ({ role: 'owner', workspaceId: 'W1', session: { user: { id: 'U_owner' } } }));
const mockMembers = vi.hoisted(() => ({ value: [] }));

vi.mock('../../../../../context/WorkspaceContext.jsx', () => ({
  useWorkspace: () => mockWorkspace,
}));

vi.mock('../../../../../context/AuthContext.jsx', () => ({
  useAuthContext: () => mockAuth,
}));

vi.mock('../../../../../hooks/useWorkspaceMembers.js', () => ({
  useWorkspaceMembers: () => ({ members: mockMembers.value, loading: false, error: '', refetch: () => {} }),
}));

import CalendarWeek from '../index.jsx';

// CSS Module 的 class 在測試會被 hash,故用 styles 物件組出實際選擇器。
const dot = (...keys) => '.' + keys.map((key) => styles[key]).join('.');

// 行事曆固定顯示「本週」(週日起),測試資料的日期一律相對本週產生。
const weekSunday = sunday(new Date());
const dayKey = (index) => fmtF(addD(weekSunday, index));

// 顯示偏好存 localStorage(依 workspace 分 key)。只移除本測試用到的那個 key
// (比照 useCloudWorkspaceState 測試,不動其他 app 資料),確保每個測試走「預設只顯示自己」。
const VISIBLE_KEY = 'calendar_visible_members_W1';
beforeEach(() => { localStorage.removeItem(VISIBLE_KEY); });

function makeProject(id, name, opts = {}) {
  return { id, name, tone: opts.tone || 'lavender', ...opts };
}

// days: { 'YYYY-MM-DD': { h, o } } — 排程器輸出的每日分配明細;opts 可帶 assignee 等。
function makeTask(id, name, startKey, endKey, hours, days = {}, opts = {}) {
  return { id, n: name, start: startKey, end: endKey, hours, days, ...opts };
}

function renderCalendar({ projects = [], data = {}, members = [], currentUserId = 'U_owner', onToggleMode = () => {} } = {}) {
  mockWorkspace.projects = projects;
  mockWorkspace.sch = data;
  mockMembers.value = members;
  mockAuth.session = { user: { id: currentUserId } };
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

  it('格線高度固定為 16 列 × HOUR_H(52)= 832px,不再隨 hoursPerDay', () => {
    const { container } = renderCalendar({ projects, data });
    const bodyGrid = container.querySelector(dot('bodyGrid'));
    expect(bodyGrid.style.height).toBe('832px');
  });
});

// ============================================================
// 2. 時間軸(寫死 8 點–午夜,排程 10 點起)
// ============================================================

describe('時間軸與 10 點起排', () => {
  const projects = [makeProject('P1', '專案A')];

  it('gutter 渲染 8→23 點共 16 個時刻標籤,含「上午8點」「中午12點」', () => {
    const { container } = renderCalendar({ projects, data: { P1: {} } });
    const labels = container.querySelectorAll(dot('hourLabel'));
    expect(labels.length).toBe(16);
    expect(labels[0].textContent).toBe('上午8點');
    expect([...labels].some(label => label.textContent === '中午12點')).toBe(true);
  });

  it('o=0 的任務畫在 10:00(START_ROWS=2 → top = (2+0)×52+1 = 105px)', () => {
    const data = {
      P1: { T1: makeTask('T1', '早班', dayKey(1), dayKey(1), 4, { [dayKey(1)]: { h: 4, o: 0 } }) },
    };
    const { container } = renderCalendar({ projects, data });
    const block = container.querySelector(dot('block'));
    expect(block.style.top).toBe('105px');
  });
});

// ============================================================
// 3. 任務區塊(依 days 每日分配定位)
// ============================================================

describe('任務區塊', () => {
  const projects = [makeProject('P1', '專案A', { tone: 'lime' })];

  it('依 days 明細定位:top =(2+o)×52+1,height = h×52−2', () => {
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
    const secondDayBlock = [...blocks].find(element => element.style.top === '209px');
    expect(secondDayBlock).toBeTruthy();
    expect(secondDayBlock.style.height).toBe('154px');
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
    const block = [...container.querySelectorAll(dot('block'))].find(element => element.style.height === '154px');
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
// 4. 成員篩選(預設只顯示自己 + 錯開)
// ============================================================

describe('成員篩選', () => {
  const projects = [makeProject('P1', '專案A')];
  const members = [
    { user_id: 'U_owner', role: 'owner', display_name: '我' },
    { user_id: 'U_b', role: 'member', display_name: '小明' },
  ];
  // owner 的任務不寫 assignee(讀作 owner);小明的任務 assignee = U_b。兩者同一天同時段。
  const data = {
    P1: {
      T_owner: makeTask('T_owner', '我的任務', dayKey(1), dayKey(1), 4, { [dayKey(1)]: { h: 4, o: 0 } }),
      T_b: makeTask('T_b', '小明任務', dayKey(1), dayKey(1), 4, { [dayKey(1)]: { h: 4, o: 0 } }, { assignee: 'U_b' }),
    },
  };

  it('每位成員渲染一顆 chip', () => {
    const { container } = renderCalendar({ projects, data, members });
    expect(container.querySelectorAll(dot('memberChip')).length).toBe(2);
  });

  it('預設只渲染自己(owner)的任務', () => {
    const { container } = renderCalendar({ projects, data, members, currentUserId: 'U_owner' });
    const blocks = container.querySelectorAll(dot('block'));
    expect(blocks.length).toBe(1);
    expect(blocks[0].textContent).toContain('我的任務');
  });

  it('勾選其他成員後其任務出現,並寫入 localStorage', () => {
    const { container } = renderCalendar({ projects, data, members, currentUserId: 'U_owner' });
    const chip = [...container.querySelectorAll(dot('memberChip'))].find(c => c.textContent.includes('小明'));
    fireEvent.click(chip);
    expect(container.querySelectorAll(dot('block')).length).toBe(2);
    const stored = JSON.parse(localStorage.getItem(VISIBLE_KEY));
    expect(stored).toContain('U_b');
  });

  it('兩成員同一天同時段重疊 → 各自縮寬錯開(cols=2,寬度含 50%)', () => {
    // 兩人都打開(略過「預設只自己」),驗證重疊時 layoutDayColumns 分兩欄。
    localStorage.setItem(VISIBLE_KEY, JSON.stringify(['U_owner', 'U_b']));
    const { container } = renderCalendar({ projects, data, members });
    const blocks = container.querySelectorAll(dot('block'));
    expect(blocks.length).toBe(2);
    blocks.forEach(block => expect(block.style.width).toContain('50%'));
    // 兩塊各佔一欄:left 其中一塊是 50%
    const lefts = [...blocks].map(block => block.style.left);
    expect(lefts.some(left => left.includes('50%'))).toBe(true);
  });

  it('每個區塊帶成員色條(memberStripe)', () => {
    const { container } = renderCalendar({ projects, data, members, currentUserId: 'U_owner' });
    const block = container.querySelector(dot('block'));
    expect(block.querySelector(dot('memberStripe'))).toBeTruthy();
  });
});

// ============================================================
// 5. 0 工時任務(整天列)
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
// 6. 里程碑與期間帶
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
// 7. 導覽與模式切換
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
