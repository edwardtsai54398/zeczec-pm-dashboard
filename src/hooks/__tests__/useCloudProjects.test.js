import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// supabaseClient 在 import 時會檢查環境變數並可能 throw;整個 mock 掉避免載入真 client。
// 載入走 .order 收尾、seedFromLocal 走 .insert().select() 收尾,兩條各自獨立的終端 mock。
const { orderMock, insertMock, insertSelectMock, getSessionMock } = vi.hoisted(() => ({
  orderMock: vi.fn(() => Promise.resolve({ data: [], error: null })),
  insertMock: vi.fn(),
  insertSelectMock: vi.fn(() => Promise.resolve({ data: [], error: null })),
  getSessionMock: vi.fn(() =>
    Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
  ),
}));

vi.mock('../../lib/supabaseClient.js', () => {
  const builder = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = (...a) => orderMock(...a);
  builder.insert = (...a) => {
    insertMock(...a);
    return { select: (...b) => insertSelectMock(...b) };
  };
  return {
    supabase: {
      from: vi.fn(() => builder),
      auth: { getSession: (...a) => getSessionMock(...a) },
    },
  };
});

import { useCloudProjects } from '../useCloudProjects.js';

// 只清各測試自己用到的 localStorage key(避免動到其他 app 資料)。
const TEST_KEYS = ['cfpm4', 'cfpm4_seeded_w1'];
function clearTestKeys() {
  TEST_KEYS.forEach((k) => localStorage.removeItem(k));
}

// 等載入(order → seedFromLocal → setProjects)這串 microtask / effect 跑完。
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('useCloudProjects', () => {
  beforeEach(() => {
    orderMock.mockReset();
    insertMock.mockReset();
    insertSelectMock.mockReset();
    orderMock.mockResolvedValue({ data: [], error: null });
    insertSelectMock.mockResolvedValue({ data: [], error: null });
    clearTestKeys();
  });

  afterEach(() => {
    clearTestKeys();
  });

  it('雲端空 + 本地空:不 seed、不覆蓋全域(核心防呆)', async () => {
    // 全新使用者:usePersistence 把預設空專案寫進 local,這樣的 blob 不該被當成「本地有資料」搬上雲。
    localStorage.setItem('cfpm4', JSON.stringify({ projects: [], settings: {} }));
    orderMock.mockResolvedValueOnce({ data: [], error: null }); // 雲端空表

    const setProjects = vi.fn();
    renderHook(() => useCloudProjects('w1', setProjects));
    await flush();

    expect(insertMock).not.toHaveBeenCalled();
    expect(setProjects).not.toHaveBeenCalled();
    expect(localStorage.getItem('cfpm4_seeded_w1')).toBeNull();
  });

  it('雲端空 + 本地完全沒有 cfpm4:一樣不 seed', async () => {
    orderMock.mockResolvedValueOnce({ data: [], error: null });

    const setProjects = vi.fn();
    renderHook(() => useCloudProjects('w1', setProjects));
    await flush();

    expect(insertMock).not.toHaveBeenCalled();
    expect(setProjects).not.toHaveBeenCalled();
  });

  it('雲端空 + 本地有真實專案:seedFromLocal 照樣搬上雲並設旗標', async () => {
    // 舊使用者(cloud 上線前就有真資料)遷移路徑要維持有效。
    localStorage.setItem(
      'cfpm4',
      JSON.stringify({
        projects: [{ id: 'saba', name: 'SABA', tone: 'lime', tasks: [], kols: [] }],
        settings: {},
      }),
    );
    orderMock.mockResolvedValueOnce({ data: [], error: null }); // 雲端空表
    insertSelectMock.mockResolvedValueOnce({
      data: [
        { id: 'uuid1', name: 'SABA', position: 0, version: 0, is_archived: false, data: { tasks: [], kols: [] } },
      ],
      error: null,
    });

    const setProjects = vi.fn();
    renderHook(() => useCloudProjects('w1', setProjects));
    await flush();

    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0];
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ workspace_id: 'w1', name: 'SABA', position: 0 });
    expect(localStorage.getItem('cfpm4_seeded_w1')).toBe('1');
    expect(setProjects).toHaveBeenCalledTimes(1);
  });

  it('雲端有資料:直接灌進全域,不 seed', async () => {
    orderMock.mockResolvedValueOnce({
      data: [
        { id: 'uuid1', name: '雲端專案', position: 0, version: 3, is_archived: false, data: { tone: 'lime', tasks: [] } },
      ],
      error: null,
    });

    const setProjects = vi.fn();
    renderHook(() => useCloudProjects('w1', setProjects));
    await flush();

    expect(insertMock).not.toHaveBeenCalled();
    expect(setProjects).toHaveBeenCalledTimes(1);
    expect(setProjects.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'uuid1', name: '雲端專案', version: 3, tone: 'lime' }),
    ]);
  });

  it('沒有 workspaceId 時不打 DB', async () => {
    const setProjects = vi.fn();
    renderHook(() => useCloudProjects(null, setProjects));
    await flush();

    expect(orderMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(setProjects).not.toHaveBeenCalled();
  });
});
