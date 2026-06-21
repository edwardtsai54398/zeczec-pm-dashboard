import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// 登入狀態管理。對外吐出兩樣東西:
//   session  — 目前登入的人（null 代表沒人登入）
//   loading  — 還在問 Supabase「現在誰登入」嗎
// 登出不在這裡:它只是單純呼叫 supabase.auth.signOut()，與本 hook 的狀態無關,
// 所以直接在要放按鈕的元件裡 import supabase 來呼叫即可。
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ① 開機先問一次目前狀態（從 localStorage 讀既有 session）
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // ② 訂閱之後的所有變化:登入、登出、token 自動續命都會觸發這裡，
    //    React 就能即時知道「狀態變了，該重畫畫面」。
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    // ③ 元件卸載時取消訂閱，避免記憶體洩漏
    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}
