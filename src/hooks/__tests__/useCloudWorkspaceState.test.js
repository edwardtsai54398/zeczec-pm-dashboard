import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// supabaseClient 在 import 時會檢查環境變數並可能 throw;整個 mock 掉避免載入真 client。
// 用 hoisted mock 讓 maybeSingle / upsert 可在各測試個別設定回傳值與斷言呼叫。
const { maybeSingleMock, upsertMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(() => Promise.resolve({ data: null, error: null })),
  upsertMock: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock('../../lib/supabaseClient.js', () => {
  const builder = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = (...a) => maybeSingleMock(...a);
  builder.upsert = (...a) => upsertMock(...a);
  return { supabase: { from: vi.fn(() => builder) } };
});

import { useCloudWorkspaceState } from '../useCloudWorkspaceState.js';

const FUTURE = '2999-12-31'; // 遠未來日期,確保 todo_done 剪枝不會誤刪

// 只移除各測試自己用到的 localStorage key(避免動到其他 app 資料)。
const TEST_KEYS = ['zeczec_state_seeded_w1', 'zeczec_todo_done', 'zeczec_overdue_done'];
function clearTestKeys() {
  TEST_KEYS.forEach((k) => localStorage.removeItem(k));
}

// 等載入(maybeSingle → seedFromLocal → setState)這串 microtask / effect 跑完。
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useCloudWorkspaceState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    maybeSingleMock.mockReset();
    upsertMock.mockReset();
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    upsertMock.mockResolvedValue({ error: null });
    clearTestKeys();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearTestKeys();
  });

  it('載入時把雲端 state 灌進回傳值', async () => {
    localStorage.setItem('zeczec_state_seeded_w1', '1'); // 跳過 seed
    maybeSingleMock.mockResolvedValueOnce({
      data: { state: { todo_done: { 'p1_t1': FUTURE }, overdue_done: { 'p1_t2': true } } },
      error: null,
    });

    const { result } = renderHook(() => useCloudWorkspaceState('w1', 'u1'));
    await flush();

    expect(result.current.todoDone).toEqual({ 'p1_t1': FUTURE });
    expect(result.current.overdueDone).toEqual({ 'p1_t2': true });
  });

  it('載入時剔除已過今天的 todo_done(剪枝)', async () => {
    localStorage.setItem('zeczec_state_seeded_w1', '1');
    maybeSingleMock.mockResolvedValueOnce({
      data: { state: { todo_done: { fresh: FUTURE, stale: '2000-01-01' }, overdue_done: {} } },
      error: null,
    });

    const { result } = renderHook(() => useCloudWorkspaceState('w1', 'u1'));
    await flush();

    expect(result.current.todoDone).toEqual({ fresh: FUTURE });
  });

  it('toggle 後等 2 秒才寫一次雲端(debounce),且寫入整包最新 state', async () => {
    localStorage.setItem('zeczec_state_seeded_w1', '1');
    const { result } = renderHook(() => useCloudWorkspaceState('w1', 'u1'));
    await flush();

    act(() => result.current.toggleTodoDone('p1_t1', FUTURE));
    expect(upsertMock).not.toHaveBeenCalled(); // 還沒到 2 秒,不寫

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: 'u1',
        workspace_id: 'w1',
        state: { todo_done: { 'p1_t1': FUTURE }, overdue_done: {} },
      },
      { onConflict: 'user_id,workspace_id' },
    );
  });

  it('2 秒內連續多次操作只合併成一次寫入', async () => {
    localStorage.setItem('zeczec_state_seeded_w1', '1');
    const { result } = renderHook(() => useCloudWorkspaceState('w1', 'u1'));
    await flush();

    act(() => result.current.toggleTodoDone('a', FUTURE));
    act(() => result.current.toggleTodoDone('b', FUTURE));
    act(() => result.current.dismissOverdue('c'));

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenLastCalledWith(
      {
        user_id: 'u1',
        workspace_id: 'w1',
        state: { todo_done: { a: FUTURE, b: FUTURE }, overdue_done: { c: true } },
      },
      { onConflict: 'user_id,workspace_id' },
    );
  });

  it('首次:雲端為空且本地有舊資料時,seedFromLocal 把本地搬上雲並設旗標', async () => {
    localStorage.setItem('zeczec_todo_done', JSON.stringify({ a: FUTURE }));
    localStorage.setItem('zeczec_overdue_done', JSON.stringify({ b: true }));
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null }); // 雲端為空

    const { result } = renderHook(() => useCloudWorkspaceState('w1', 'u1'));
    await flush();

    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: 'u1',
        workspace_id: 'w1',
        state: { todo_done: { a: FUTURE }, overdue_done: { b: true } },
      },
      { onConflict: 'user_id,workspace_id' },
    );
    expect(localStorage.getItem('zeczec_state_seeded_w1')).toBe('1');
    expect(result.current.todoDone).toEqual({ a: FUTURE });
    expect(result.current.overdueDone).toEqual({ b: true });
  });

  it('沒有 workspaceId / userId 時不打 DB', async () => {
    renderHook(() => useCloudWorkspaceState(null, null));
    await flush();
    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
