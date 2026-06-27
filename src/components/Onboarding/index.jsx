import { useState } from 'react';
import styles from './Onboarding.module.css';

// 第一次登入(profiles 還沒有這個人的 row)時顯示的取名畫面。
// 取名完成 → onDone(name) 會把名字 + 預設偏好寫進 profiles，
// 寫入成功後上層的 profile 狀態一變，這個畫面就自動被換成 App。
export default function Onboarding({ onDone }) {
  const [name, setName] = useState('');
  // 'idle'(待輸入) | 'saving'(建立中) | 'error'(建立失敗)
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    setStatus('saving');
    setErrorMsg('');
    try {
      await onDone(value);
      // 成功後本元件會被卸載，不用再做事
    } catch (err) {
      setStatus('error');
      setErrorMsg(err?.message || '請稍後再試一次');
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.title}>🎉 註冊成功，開始使用吧！</div>
        <p className={styles.subtitle}>想先請問你要叫什麼名字？</p>
        <form onSubmit={submit}>
          <input
            type="text"
            required
            autoFocus
            placeholder="你的名字"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.primaryBtn} disabled={status === 'saving'}>
            {status === 'saving' ? '建立中…' : '開始使用'}
          </button>
        </form>
        {status === 'error' && <p className={styles.err}>建立失敗:{errorMsg}</p>}
      </div>
    </div>
  );
}
