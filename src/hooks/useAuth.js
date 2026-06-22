import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ① 開機先問一次目前狀態
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // ② 訂閱之後的所有變化:登入、登出、token 自動續命都會觸發這裡，
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
