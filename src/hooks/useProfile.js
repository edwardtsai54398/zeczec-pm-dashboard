import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { DEFAULT_PREFERENCES } from '../constants.js';

// 登入(auth)成功 ≠ 我們資料庫裡有這個人的 profile。
// 這個 hook 拿登入者的 id 去 profiles 表查有沒有對應的 row:
//   查不到(或沒有 display_name) → 第一次 → 上層顯示取名畫面
//   查得到且有名字              → 老使用者 → 直接進 App
export function useProfile(user) {
  const [profile, setProfile] = useState(null);
  // 'loading'(查詢中) | 'ready'(查完了，profile 可能是某筆或 null)
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    // 沒有 user 不用查(理論上上層已擋掉，但保險)
    if (!user) {
      setProfile(null);
      setStatus('ready');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    // maybeSingle: 查不到回 null 而不是丟錯，正好對應新使用者
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('查 profile 失敗', error);
        setProfile(data ?? null);
        setStatus('ready');
      });

    // 換人登入 / 元件卸載時，丟棄這次查詢結果，避免蓋掉新的
    return () => { cancelled = true; };
  }, [user?.id]);

  // 第一次取名後呼叫:把名字 + 預設偏好寫進 profiles。
  // 用 upsert(不是 insert):萬一已有空 row 或重複送出都不會撞 duplicate key。
  const saveProfile = useCallback(async (displayName) => {
    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email,
          display_name: displayName.trim(),
          preferences: DEFAULT_PREFERENCES,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) throw error;     // 讓取名畫面顯示錯誤訊息
    setProfile(data);           // 更新本地狀態 → 門禁自動切到 AppContent
  }, [user]);

  return { profile, status, saveProfile };
}
