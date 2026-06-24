import { useState, useRef, useCallback } from 'react';

// 通用的「草稿/dirty/還原」hook,是 useProjectEditor 的精簡通用版。
// 只負責草稿狀態與 dirty 判斷,不綁特定的雲端寫入 —— 儲存由呼叫端決定。
// dirty 用 JSON.stringify 序列化比對,適用 number / 物件 / 陣列各種 saved。
export function useDraftEditor(saved) {
  const [draft, setDraft] = useState(saved);

  // saved 由外部變動(雲端載入完、或儲存成功後 context 更新)時,在 render 階段重設草稿。
  // 用序列化值比對而非物件 identity:preferences 之類每次 render 都產生新物件,
  // 若比 identity 會把使用者正在編的草稿誤清掉。
  const savedKey = JSON.stringify(saved);
  const prevKey = useRef(savedKey);
  if (savedKey !== prevKey.current) {
    prevKey.current = savedKey;
    setDraft(saved);
  }

  const dirty = JSON.stringify(draft) !== savedKey;

  const discard = useCallback(() => setDraft(saved), [saved]);

  return { draft, setDraft, dirty, discard };
}
