import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import styles from './Login.module.css';

// Magic link 登入畫面。註冊與登入是同一個動作:
// 第一次出現的 email → Supabase 自動建帳號；已存在的 email → 當作登入。
export default function Login() {
  const [email, setEmail] = useState('');
  // 'idle'（待輸入）| 'sending'（寄送中）| 'sent'（已寄出）| 'error'（寄送失敗）
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const sendLink = async (e) => {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;
    setStatus('sending');
    setErrorMsg('');
    const { error } = await supabase.auth.signInWithOtp({
      email: target,
      // 點信裡的連結後，把使用者導回我們的 App 首頁
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('sent');
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        {status === 'sent' ? (
          <>
            <div className={styles.title}>📧 信寄出囉</div>
            <p className={styles.subtitle}>
              系統已將登入連結寄到：<br />
              <strong className={styles.email}>{email.trim()}</strong><br />
              請到信箱點連結完成登入。
            </p>
            <button className={styles.ghostBtn} onClick={() => setStatus('idle')}>
              改用其他信箱
            </button>
          </>
        ) : (
          <>
            <div className={styles.title}>募資專案管理</div>
            <p className={styles.subtitle}>
              輸入帳號 email。
            </p>
            <form onSubmit={sendLink}>
              <input
                type="email"
                required
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
              />
              <button type="submit" className={styles.primaryBtn} disabled={status === 'sending'}>
                {status === 'sending' ? '寄送中…' : '登入連結'}
              </button>
            </form>
            {status === 'error' && <p className={styles.err}>寄送失敗:{errorMsg}</p>}
          </>
        )}
      </div>
    </div>
  );
}
