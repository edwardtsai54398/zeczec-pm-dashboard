import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { debounce } from '../lib/debounce.js';
import { fmtF } from '../lib/dateUtils.js';

// 今日總覽的「完成狀態」雲端資料層:待辦/近七日打勾(todo_done)+ 過期關閉(overdue_done)。
// 兩者合存同一筆 user_workspace_state(PK: user_id + workspace_id)的 state jsonb。
// 雲端是唯一真相;使用者連續操作不即時寫,改用 2 秒 debounce 合併成一次 upsert(見 lib/debounce.js)。
// workspace 設定低頻、單人一列,儲存不加 version 樂觀鎖(與 useCloudWorkspaceSettings 一致)。

const TODO_DONE_KEY = 'zeczec_todo_done';
const OVERDUE_DONE_KEY = 'zeczec_overdue_done';

// todo_done 記錄每個任務「完成到哪天(until)」;載入時剔除已過今天的舊條目,避免物件無限長大。
// (沿用搬上雲前 Dashboard loadDone 的剪枝邏輯。)overdue_done 不剪枝,維持現狀。
function pruneTodoDone(todoDone) {
  const todayStr = fmtF(new Date());
  const cleaned = {};
  Object.entries(todoDone || {}).forEach(([k, until]) => {
    if (typeof until === 'string' && until >= todayStr) cleaned[k] = until;
  });
  return cleaned;
}

// 讀本地舊資料(搬上雲前 Dashboard 寫的那兩個 localStorage key)。
function readLocalState() {
  try {
    return {
      todo_done: JSON.parse(localStorage.getItem(TODO_DONE_KEY) || '{}'),
      overdue_done: JSON.parse(localStorage.getItem(OVERDUE_DONE_KEY) || '{}'),
    };
  } catch {
    return { todo_done: {}, overdue_done: {} };
  }
}

// 首次:雲端還沒資料、但本地有舊紀錄時,把本地搬上雲,避免接雲後完成狀態歸零。
// per-workspace flag 防重複搬移。回傳搬移後採用的 state,否則 null。
async function seedFromLocal(userId, workspaceId, cloudState) {
  const flagKey = `zeczec_state_seeded_${workspaceId}`;
  if (localStorage.getItem(flagKey)) return null;

  const cloudEmpty =
    !cloudState ||
    (Object.keys(cloudState.todo_done || {}).length === 0 &&
      Object.keys(cloudState.overdue_done || {}).length === 0);
  const local = readLocalState();
  const localHasData =
    Object.keys(local.todo_done).length > 0 ||
    Object.keys(local.overdue_done).length > 0;

  if (!cloudEmpty || !localHasData) return null;

  const { error } = await supabase
    .from('user_workspace_state')
    .upsert(
      { user_id: userId, workspace_id: workspaceId, state: local },
      { onConflict: 'user_id,workspace_id' }
    );
  if (error) {
    console.error('搬移本地完成狀態上雲失敗', error);
    return null;
  }
  localStorage.setItem(flagKey, '1');
  return local;
}

export function useCloudWorkspaceState(workspaceId, userId) {
  const [todoDone, setTodoDone] = useState({});
  const [overdueDone, setOverdueDone] = useState({});

  // toggler 更新其中一邊時,要組出完整 { todo_done, overdue_done } 給 save;用 ref 讀另一邊的最新值,
  // 避免 callback 閉包讀到過期狀態。
  const todoRef = useRef(todoDone);
  const overdueRef = useRef(overdueDone);
  useEffect(() => { todoRef.current = todoDone; }, [todoDone]);
  useEffect(() => { overdueRef.current = overdueDone; }, [overdueDone]);

  // 載入:雲端唯一真相。第一次沒有列用 maybeSingle 不算錯;cancelled 防換人時舊查詢蓋新資料。
  useEffect(() => {
    if (!workspaceId || !userId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('user_workspace_state')
        .select('state')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (cancelled) return;
      if (error) { console.error('查完成狀態失敗', error); return; }

      let state = data?.state ?? null;
      const seeded = await seedFromLocal(userId, workspaceId, state);
      if (cancelled) return;
      if (seeded) state = seeded;

      setTodoDone(pruneTodoDone(state?.todo_done));
      setOverdueDone(state?.overdue_done ?? {});
    })();

    return () => { cancelled = true; };
  }, [workspaceId, userId]);

  // 2 秒 debounce:連續打勾只在停手後寫一次。整包 state 上 upsert,onConflict 對應 PK。
  const save = useMemo(
    () =>
      debounce((uid, wid, state) => {
        supabase
          .from('user_workspace_state')
          .upsert(
            { user_id: uid, workspace_id: wid, state },
            { onConflict: 'user_id,workspace_id' }
          )
          .then(({ error }) => { if (error) console.error('儲存完成狀態失敗', error); });
      }, 2000),
    []
  );

  // 卸載/換頁前把排隊中的最後一次立刻送出,避免打完勾馬上離開就遺失。
  useEffect(() => () => save.flush(), [save]);

  // 待辦打勾 toggle:有則取消、無則記到任務結束日(until)。先用 ref 算 next,再 setState 與排程寫入,
  // 不把 save 寫進 setState updater 內(避免 StrictMode 重入造成重複副作用)。
  const toggleTodoDone = useCallback((k, until) => {
    if (!k) return;
    const next = { ...todoRef.current };
    if (next[k]) delete next[k]; else next[k] = until;
    todoRef.current = next;
    setTodoDone(next);
    if (workspaceId && userId) {
      save(userId, workspaceId, { todo_done: next, overdue_done: overdueRef.current });
    }
  }, [save, workspaceId, userId]);

  // 過期任務關閉:標記 true(只增不刪)。
  const dismissOverdue = useCallback((k) => {
    if (!k || overdueRef.current[k]) return;
    const next = { ...overdueRef.current, [k]: true };
    overdueRef.current = next;
    setOverdueDone(next);
    if (workspaceId && userId) {
      save(userId, workspaceId, { todo_done: todoRef.current, overdue_done: next });
    }
  }, [save, workspaceId, userId]);

  return { todoDone, overdueDone, toggleTodoDone, dismissOverdue };
}
