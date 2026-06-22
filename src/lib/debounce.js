// debounce(防抖):把短時間內的連續呼叫合併成一次。
// 每次呼叫都「重設」計時器,只有最後一次呼叫之後靜止超過 wait 毫秒才真正執行 fn。
// 用途:偏好設定連續調整時不要每動一下就打一次 DB,等使用者停手再寫。
export function debounce(fn, wait = 2000) {
  let timer = null;
  let lastArgs = null;

  const debounced = (...args) => {
    // 又被觸發 → 取消上一個排程、記下最新參數、重新計時。
    // 「重新計時」正是「停手才寫」的關鍵:只要還在動,計時器永遠歸零。
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      lastArgs = null;
      fn(...args); // 只會用到最後一次呼叫帶進來的參數
    }, wait);
  };

  // 取消尚未送出的那次(例如使用者按下取消,不想讓變更落地)
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  // 立刻把排隊中的那次送出(若有)。元件卸載 / 登出前呼叫,避免丟失最後一次寫入。
  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const args = lastArgs;
    lastArgs = null;
    fn(...args);
  };

  return debounced;
}
