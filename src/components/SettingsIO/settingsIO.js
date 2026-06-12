// 「匯出設定 / 匯入設定」功能的純邏輯。這是暫時性功能,未來移除時整個
// src/components/SettingsIO/ 資料夾刪掉即可。
//
// 本 App 用到的 localStorage keys（白名單）。匯出/匯入只動這些 key,
// 不會碰到 deck-stage.railVisible 等非本 App 的資料。
//   cfpm4               → src/constants.js (STORAGE_KEY)：專案 + 設定
//   zeczec_todo_done    → src/views/Dashboard.jsx：待辦完成狀態
//   zeczec_overdue_done → src/views/Dashboard.jsx：逾期完成狀態
export const APP_KEYS = ['cfpm4', 'zeczec_todo_done', 'zeczec_overdue_done'];

// 把本 App 的 localStorage 內容序列化成格式化 JSON 並下載。
export function exportSettings() {
  const data = {};
  for (const key of APP_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    // 本 App 的值都是 JSON 字串,parse 後放入讓輸出檔可讀;非 JSON 則原樣保留。
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zeczec-pm-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 讓單一白名單 key 等於匯入檔的內容：檔案有就寫入（物件 stringify、字串直接寫）,
// 檔案沒有就還原成未設定狀態,如此達成「以檔案內容直接覆蓋」。
function applyKey(data, key) {
  if (Object.prototype.hasOwnProperty.call(data, key)) {
    const value = data[key];
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } else {
    localStorage.removeItem(key);
  }
}

// 讀取使用者選的 .json 檔,以檔案內容直接覆蓋本 App 的 localStorage（只動白名單）,
// 完成後 reload 套用（localStorage 只在 mount 時讀取）。回傳 Promise 方便接錯誤。
export function importSettings(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        applyKey(data, 'cfpm4');
        applyKey(data, 'zeczec_todo_done');
        applyKey(data, 'zeczec_overdue_done');
        resolve();
        window.location.reload();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
