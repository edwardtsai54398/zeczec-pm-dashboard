// 全頁載入提示。auth 守門與工作區資料載入共用,避免各處重複同一段 inline 樣式。
export default function Loading() {
  return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)' }}>載入中…</div>
  );
}
