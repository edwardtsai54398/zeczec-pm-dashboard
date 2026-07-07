import { useState, useCallback, useRef, useEffect } from 'react';
import { useWorkspace } from '../../../context/WorkspaceContext.jsx';
import { collectDownstream } from '../../../lib/scheduleStore.js';
import ReflowPrompt from './ReflowPrompt/index.jsx';

// 行事曆拖拉/縮放與彈窗存檔共用的「先套用再問」流程:
//   applyThenAsk(pid, taskId, changes) → 先寫「只改這一個」(single) 落地 DB;
//   若該任務有下游依賴,再跳 ReflowPrompt 問要不要一起往後重排(reschedule)。
// 回傳 { applyThenAsk, promptElement };view 直接把 promptElement 放進 render。
export function useReflowPrompt() {
  const { projects, applyTaskDateChange } = useWorkspace();
  const [prompt, setPrompt] = useState(null); // { pid, taskId, changes }
  const timerRef = useRef(null);

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPrompt(null);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const applyThenAsk = useCallback(async (pid, taskId, changes) => {
    await applyTaskDateChange(pid, taskId, changes, 'single');
    // 依賴圖不會因為改日期而變,用當前 projects 判斷有沒有下游就夠(size>1 = 除了自己還有別人)。
    const project = projects.find((p) => p.id === pid);
    const hasDownstream = project && collectDownstream(project, taskId).size > 1;
    if (!hasDownstream) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setPrompt({ pid, taskId, changes });
    timerRef.current = setTimeout(() => setPrompt(null), 8000); // 逾時自動關,不打擾
  }, [applyTaskDateChange, projects]);

  const reschedule = useCallback(async () => {
    if (!prompt) return;
    const { pid, taskId, changes } = prompt;
    clear();
    await applyTaskDateChange(pid, taskId, changes, 'reschedule');
  }, [prompt, applyTaskDateChange, clear]);

  const promptElement = prompt
    ? <ReflowPrompt onReschedule={reschedule} onDismiss={clear} />
    : null;

  return { applyThenAsk, promptElement };
}
