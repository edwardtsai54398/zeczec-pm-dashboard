import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { DEFAULT_PREFERENCES, DEFAULT_WORKSPACE_SETTINGS } from '../constants.js';
import { writePreference } from '../lib/preference.js';
import { debounce } from '../lib/debounce.js';

// onboarding 完成時，幫使用者建立自己的 workspace 與 owner 身分。
async function ensureOwnerWorkspace(userId, workspaceName) {
  // ① 已擁有 workspace 就沿用既有 id
  const { data: owned, error: ownedErr } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
    .limit(1)
    .maybeSingle();
  if (ownedErr) throw ownedErr;

  let workspaceId = owned?.id;

  // ② 沒有才新建一個
  if (!workspaceId) {
    const { data: created, error: createErr } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceName,
        owner_id: userId,
        settings: DEFAULT_WORKSPACE_SETTINGS,
      })
      .select('id')
      .single();
    if (createErr) throw createErr;
    workspaceId = created.id;
  }

  // ③ 建立 owner membership;upsert + onConflict 確保重送不撞 UNIQUE
  const { error: memberErr } = await supabase
    .from('workspace_members')
    .upsert(
      { workspace_id: workspaceId, user_id: userId, role: 'owner' },
      { onConflict: 'workspace_id,user_id' }
    );
  if (memberErr) throw memberErr;
}

// 查登入者在 profiles 表有沒有名字，藉此分辨第一次（要取名）還是老使用者。
export function useProfile(user) {
  const [profile, setProfile] = useState(null);
  // 'loading'(查詢中) | 'ready'(查完了，profile 可能是某筆或 null)
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setStatus('ready');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('查 profile 失敗', error);
        setProfile(data ?? null);

        // preferences 寫入 localStorage
        if (data?.preferences) writePreference(data.preferences);
        setStatus('ready');
      });

    // 換人登入 / 元件卸載時，丟棄這次查詢結果，避免蓋掉新的
    return () => { cancelled = true; };
  }, [user?.id]);

  // 第一次取名後呼叫:建立 profile + workspace + owner 身分,最後才把名字落地。
  const saveProfile = useCallback(async (displayName) => {
    const name = displayName.trim();

    // ① 先寫一筆「還沒取名」的 profile(暫不含 display_name)。
    //    workspaces.owner_id 有 FK 指向 profiles.id,必須先有 profile row 才建得起 workspace。
    const { error: stubErr } = await supabase
      .from('profiles')
      .upsert(
        { id: user.id, email: user.email, preferences: DEFAULT_PREFERENCES },
        { onConflict: 'id' }
      );
    if (stubErr) throw stubErr;

    // ② 建 workspace + owner 身分(冪等,見 ensureOwnerWorkspace)。
    await ensureOwnerWorkspace(user.id, `${name} 的工作區`);

    // ③ 最後才寫 display_name:它是門禁判斷「onboarding 完成」的依據。
    //    放最後一步,前面任何步驟失敗名字都不會被寫入,使用者重新整理仍回到取名畫面。
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;     // 讓取名畫面顯示錯誤訊息
    setProfile(data);           // 更新狀態 → 門禁自動切到 AppContent
  }, [user]);

  const writePreferenceToDb = useMemo(
    () =>
      debounce(async (userId, prefs) => {
        // 寫 DB 失敗只記錄不 rollback
        const { error } = await supabase
          .from('profiles')
          .update({ preferences: prefs })
          .eq('id', userId);
        if (error) console.error('更新偏好失敗', error);
      }),
    []
  );

  // 元件卸載前把還沒送出的最後一次寫入補送,避免丟失
  useEffect(() => () => writePreferenceToDb.flush(), [writePreferenceToDb]);

  // 先本地 UI 同步、DB 寫入交給 debounce,使用者體驗即時且不狂打 DB
  const updatePreference = useCallback((patch) => {
    if (!user) return;
    const next = { ...DEFAULT_PREFERENCES, ...profile?.preferences, ...patch };

    // 本地立即生效:localStorage + 畫面狀態
    writePreference(next);
    setProfile((p) => (p ? { ...p, preferences: next } : p));

    writePreferenceToDb(user.id, next);
  }, [user, profile?.preferences, writePreferenceToDb]);

  const preferences = { ...DEFAULT_PREFERENCES, ...profile?.preferences };

  return { profile, status, saveProfile, preferences, updatePreference };
}
