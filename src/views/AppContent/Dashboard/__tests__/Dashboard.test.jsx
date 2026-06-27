import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Dashboard 自己從 context / hook 取資料(projects/排程/里程碑 + 完成狀態),
// 測試把這些來源換成可控假實作:
// - WorkspaceContext 由每次 renderDashboard 注入該情境的 projects / 排程 / 里程碑。
// - AuthContext 給固定的 workspaceId / userId。
// - 完成狀態用一個「跨重新掛載存活」的 store 模擬雲端持久化(打勾後重整仍在),
//   讓跨卡片繼承等行為仍可驗證。雲端載入/debounce/剪枝在 useCloudWorkspaceState 自己的測試驗。
// - useNavigate 換成 noop:里程碑卡片「開啟甘特圖」只需可點,測試不實際導頁。
const mockStore = vi.hoisted(() => ({ todoDone: {}, overdueDone: {} }));
const mockWorkspace = vi.hoisted(() => ({ projects: [], sch: {}, miles: {} }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => () => {},
}));

vi.mock('../../../../context/WorkspaceContext.jsx', () => ({
  useWorkspace: () => mockWorkspace,
}));

vi.mock('../../../../context/AuthContext.jsx', () => ({
  useAuthContext: () => ({ workspaceId: 'w-test', session: { user: { id: 'u-test' } } }),
}));

vi.mock('../../../../hooks/useCloudWorkspaceState.js', async () => {
  const { useReducer, useCallback } = await import('react');
  return {
    useCloudWorkspaceState: () => {
      const [, force] = useReducer((n) => n + 1, 0);
      const toggleTodoDone = useCallback((k, until) => {
        const next = { ...mockStore.todoDone };
        if (next[k]) delete next[k]; else next[k] = until;
        mockStore.todoDone = next;
        force();
      }, []);
      const dismissOverdue = useCallback((k) => {
        if (mockStore.overdueDone[k]) return;
        mockStore.overdueDone = { ...mockStore.overdueDone, [k]: true };
        force();
      }, []);
      return {
        todoDone: mockStore.todoDone,
        overdueDone: mockStore.overdueDone,
        toggleTodoDone,
        dismissOverdue,
      };
    },
  };
});

import Dashboard from '../index.jsx';

// Fixed today: 2024-01-15 (Monday)
const TODAY = new Date('2024-01-15T10:00:00');

function makeProject(id, name = '測試專案') {
  return { id, name, tone: 'lavender' };
}

function makeTaskData(projectId, tasks) {
  const taskMap = {};
  tasks.forEach((t) => { taskMap[t.id] = t; });
  return { [projectId]: taskMap };
}

function makeTask(id, name, start, end, hours = 4) {
  return { id, n: name, start, end, hours, p: '' };
}

function renderDashboard(projects, data) {
  // 透過假的 WorkspaceContext 注入該情境資料,再 render 不帶 props 的 Dashboard。
  mockWorkspace.projects = projects;
  mockWorkspace.sch = data;
  mockWorkspace.miles = {};
  return render(<Dashboard />);
}

function getCard(title) {
  return screen.getByText(title).closest('.card');
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    mockStore.todoDone = {};
    mockStore.overdueDone = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    mockStore.todoDone = {};
    mockStore.overdueDone = {};
  });

  // ── 需求一：近七日活動只顯示今天之後、七日內的任務 ──────────────────────────

  describe('需求一：近七日活動的任務範圍', () => {
    it('顯示明天到第六天開始的任務，不含今天', () => {
      const p = makeProject('p1');
      // 今天 = 2024-01-15
      const tasks = [
        makeTask('t-today',   '今天開始', '2024-01-15', '2024-01-17'), // startIdx=0，不含
        makeTask('t-d1',      '明天開始', '2024-01-16', '2024-01-20'), // startIdx=1，含
        makeTask('t-d6',      '六天後',   '2024-01-21', '2024-01-25'), // startIdx=6，含
        makeTask('t-d7',      '七天後',   '2024-01-22', '2024-01-25'), // startIdx=7，不含
        makeTask('t-past',    '昨天結束', '2024-01-10', '2024-01-14'), // eo<0，不含
      ];
      renderDashboard([p], makeTaskData('p1', tasks));

      const card = getCard('近七日活動');
      expect(within(card).queryByText('明天開始')).toBeInTheDocument();
      expect(within(card).queryByText('六天後')).toBeInTheDocument();
      expect(within(card).queryByText('今天開始')).not.toBeInTheDocument();
      expect(within(card).queryByText('七天後')).not.toBeInTheDocument();
      expect(within(card).queryByText('昨天結束')).not.toBeInTheDocument();
    });

    it('任務結束日若早於今天則不出現在近七日活動', () => {
      const p = makeProject('p1');
      const tasks = [makeTask('t1', '過期任務', '2024-01-10', '2024-01-14')];
      renderDashboard([p], makeTaskData('p1', tasks));

      const card = getCard('近七日活動');
      expect(within(card).queryByText('過期任務')).not.toBeInTheDocument();
    });

    it('沒有即將開始的任務時顯示空狀態', () => {
      const p = makeProject('p1');
      const tasks = [makeTask('t1', '只有今天', '2024-01-15', '2024-01-15')];
      renderDashboard([p], makeTaskData('p1', tasks));

      const card = getCard('近七日活動');
      expect(within(card).getByText('未來 7 天沒有新任務')).toBeInTheDocument();
    });
  });

  // ── 需求二：近七日活動打勾後不移除，保留在列表 ───────────────────────────────

  describe('需求二：近七日活動打勾後保留在列表', () => {
    it('打勾後任務仍然出現在近七日活動中', () => {
      const p = makeProject('p1');
      const tasks = [makeTask('t1', '明天任務', '2024-01-16', '2024-01-20')];
      renderDashboard([p], makeTaskData('p1', tasks));

      const card = getCard('近七日活動');
      const row = within(card).getByText('明天任務').closest('.todo-row');
      const checkbox = row.querySelector('.todo-check');

      fireEvent.click(checkbox);

      expect(within(card).queryByText('明天任務')).toBeInTheDocument();
    });

    it('打勾後 checkbox 呈現 done 樣式', () => {
      const p = makeProject('p1');
      const tasks = [makeTask('t1', '明天任務', '2024-01-16', '2024-01-20')];
      renderDashboard([p], makeTaskData('p1', tasks));

      const card = getCard('近七日活動');
      const row = within(card).getByText('明天任務').closest('.todo-row');
      const checkbox = row.querySelector('.todo-check');

      fireEvent.click(checkbox);

      expect(checkbox).toHaveClass('done');
    });

    it('再次打勾可取消（toggle），取消後不再是 done 樣式', () => {
      const p = makeProject('p1');
      const tasks = [makeTask('t1', '明天任務', '2024-01-16', '2024-01-20')];
      renderDashboard([p], makeTaskData('p1', tasks));

      const card = getCard('近七日活動');
      const row = within(card).getByText('明天任務').closest('.todo-row');
      const checkbox = row.querySelector('.todo-check');

      fireEvent.click(checkbox); // 打勾
      fireEvent.click(checkbox); // 取消

      expect(checkbox).not.toHaveClass('done');
    });
  });

  // ── 需求三：近七日活動打勾的任務，進入今日待辦後仍呈現打勾 ────────────────────

  describe('需求三：跨卡片打勾狀態繼承', () => {
    it('近七日活動打勾的任務，日期到了後在今日待辦中也呈現打勾', () => {
      const p = makeProject('p1');
      // 任務明天開始：今天它在近七日活動
      const tasks = [makeTask('t1', '明日任務', '2024-01-16', '2024-01-17')];

      const { unmount } = renderDashboard([p], makeTaskData('p1', tasks));

      // 在近七日活動打勾
      const timelineCard = getCard('近七日活動');
      const row = within(timelineCard).getByText('明日任務').closest('.todo-row');
      fireEvent.click(row.querySelector('.todo-check'));

      unmount();

      // 時間推進到明天（任務開始日）
      vi.setSystemTime(new Date('2024-01-16T10:00:00'));

      renderDashboard([p], makeTaskData('p1', tasks));

      // 任務現在出現在今日待辦
      const todoCard = getCard('今日待辦');
      expect(within(todoCard).queryByText('明日任務')).toBeInTheDocument();

      // 應呈現打勾狀態（繼承自近七日活動的打勾）
      const todoRow = within(todoCard).getByText('明日任務').closest('.todo-row');
      expect(todoRow.querySelector('.todo-check')).toHaveClass('done');
    });

    it('近七日活動打勾的任務，在日期到了後不再出現於近七日活動', () => {
      const p = makeProject('p1');
      const tasks = [makeTask('t1', '明日任務', '2024-01-16', '2024-01-17')];

      const { unmount } = renderDashboard([p], makeTaskData('p1', tasks));

      const timelineCard = getCard('近七日活動');
      const row = within(timelineCard).getByText('明日任務').closest('.todo-row');
      fireEvent.click(row.querySelector('.todo-check'));

      unmount();

      vi.setSystemTime(new Date('2024-01-16T10:00:00'));
      renderDashboard([p], makeTaskData('p1', tasks));

      const newTimelineCard = getCard('近七日活動');
      expect(within(newTimelineCard).queryByText('明日任務')).not.toBeInTheDocument();
    });
  });

  // ── 需求四：今日待辦只顯示日期含今天的任務 ──────────────────────────────────

  describe('需求四：今日待辦的任務範圍', () => {
    it('顯示任務開始≤今天且結束≥今天的任務', () => {
      const p = makeProject('p1');
      const tasks = [
        makeTask('t-span',  '跨越今天',   '2024-01-14', '2024-01-16'), // 含今天
        makeTask('t-only',  '只有今天',   '2024-01-15', '2024-01-15'), // 正好今天
        makeTask('t-future','明天才開始', '2024-01-16', '2024-01-18'), // 未來
        makeTask('t-past',  '昨天就結束', '2024-01-10', '2024-01-14'), // 已過期
      ];
      renderDashboard([p], makeTaskData('p1', tasks));

      const card = getCard('今日待辦');
      expect(within(card).queryByText('跨越今天')).toBeInTheDocument();
      expect(within(card).queryByText('只有今天')).toBeInTheDocument();
      expect(within(card).queryByText('明天才開始')).not.toBeInTheDocument();
      expect(within(card).queryByText('昨天就結束')).not.toBeInTheDocument();
    });

    it('沒有今日任務時顯示空狀態提示', () => {
      renderDashboard([], {});

      const card = getCard('今日待辦');
      expect(within(card).getByText('今日空閒，可以喘口氣 ☕')).toBeInTheDocument();
    });
  });

  // ── 需求五：今日待辦打勾後保留，除非過期 ────────────────────────────────────

  describe('需求五：今日待辦打勾後保留在卡片中', () => {
    it('打勾後任務仍然出現在今日待辦', () => {
      const p = makeProject('p1');
      const tasks = [makeTask('t1', '今日任務', '2024-01-15', '2024-01-15')];
      renderDashboard([p], makeTaskData('p1', tasks));

      const card = getCard('今日待辦');
      const row = within(card).getByText('今日任務').closest('.todo-row');
      fireEvent.click(row.querySelector('.todo-check'));

      expect(within(card).queryByText('今日任務')).toBeInTheDocument();
    });

    it('打勾後 checkbox 呈現 done 樣式', () => {
      const p = makeProject('p1');
      const tasks = [makeTask('t1', '今日任務', '2024-01-15', '2024-01-15')];
      renderDashboard([p], makeTaskData('p1', tasks));

      const card = getCard('今日待辦');
      const row = within(card).getByText('今日任務').closest('.todo-row');
      const checkbox = row.querySelector('.todo-check');
      fireEvent.click(checkbox);

      expect(checkbox).toHaveClass('done');
    });

    it('任務到期後，打勾狀態在今日待辦消失（任務已移出今日待辦）', () => {
      const p = makeProject('p1');
      // 任務結束日是今天
      const tasks = [makeTask('t1', '今日到期', '2024-01-15', '2024-01-15')];

      const { unmount } = renderDashboard([p], makeTaskData('p1', tasks));

      const card = getCard('今日待辦');
      const row = within(card).getByText('今日到期').closest('.todo-row');
      fireEvent.click(row.querySelector('.todo-check'));

      unmount();

      // 時間推進到明天
      vi.setSystemTime(new Date('2024-01-16T10:00:00'));
      renderDashboard([p], makeTaskData('p1', tasks));

      const todoCard = getCard('今日待辦');
      // 任務已過期，不在今日待辦中
      expect(within(todoCard).queryByText('今日到期')).not.toBeInTheDocument();
    });
  });

  // ── 需求六：未打勾的今日任務過期後出現在過期未完成 ──────────────────────────

  describe('需求六：未打勾的過期今日任務出現在過期未完成', () => {
    it('未打勾的任務在過期後出現於過期未完成卡片', () => {
      const p = makeProject('p1');
      // 任務昨天結束，未打勾
      const tasks = [makeTask('t1', '昨天到期未完成', '2024-01-14', '2024-01-14')];
      renderDashboard([p], makeTaskData('p1', tasks));

      const overdueCard = getCard('過期未完成');
      expect(within(overdueCard).queryByText('昨天到期未完成')).toBeInTheDocument();
    });

    it('過期未完成卡片顯示逾期天數', () => {
      const p = makeProject('p1');
      // 昨天（Jan 14）到期，逾期 1 天
      const tasks = [makeTask('t1', '逾期任務', '2024-01-12', '2024-01-14')];
      renderDashboard([p], makeTaskData('p1', tasks));

      const overdueCard = getCard('過期未完成');
      expect(within(overdueCard).getByText(/逾期 1 天/)).toBeInTheDocument();
    });

    it('過期未完成卡片最多顯示 5 筆，超過時顯示「還有 N 項」', () => {
      const p = makeProject('p1');
      const tasks = Array.from({ length: 7 }, (_, i) =>
        makeTask(`t${i}`, `逾期任務${i}`, '2024-01-10', '2024-01-14'),
      );
      renderDashboard([p], makeTaskData('p1', tasks));

      const overdueCard = getCard('過期未完成');
      expect(within(overdueCard).getByText(/還有 2 項/)).toBeInTheDocument();
    });
  });

  // ── 需求七：沒有過期任務時不渲染過期未完成卡片 ──────────────────────────────

  describe('需求七：沒有過期任務時不渲染過期未完成卡片', () => {
    it('全部任務都是今天或未來時，不渲染過期未完成', () => {
      const p = makeProject('p1');
      const tasks = [
        makeTask('t1', '今天任務', '2024-01-15', '2024-01-15'),
        makeTask('t2', '明天任務', '2024-01-16', '2024-01-20'),
      ];
      renderDashboard([p], makeTaskData('p1', tasks));

      expect(screen.queryByText('過期未完成')).not.toBeInTheDocument();
    });

    it('沒有任何任務時，不渲染過期未完成', () => {
      renderDashboard([], {});

      expect(screen.queryByText('過期未完成')).not.toBeInTheDocument();
    });

    it('有過期任務時才渲染過期未完成卡片', () => {
      const p = makeProject('p1');
      const tasks = [makeTask('t1', '逾期任務', '2024-01-10', '2024-01-14')];
      renderDashboard([p], makeTaskData('p1', tasks));

      expect(screen.queryByText('過期未完成')).toBeInTheDocument();
    });
  });
});
