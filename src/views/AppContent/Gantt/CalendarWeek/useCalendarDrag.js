import { useState, useRef, useCallback } from 'react';
import { fmtF, addD } from '../../../../lib/dateUtils.js';
import { offsetToClockMin, snapMin, clampStartMin } from '../../../../lib/scheduleTime.js';

// 行事曆任務區塊的拖拉(改開始時間)/縮放(改時長)。像素↔時間換算靠 hourH 與量到的欄寬:
//   移動:Δ天 = round(Δx / 欄寬)、Δ分 = snap30(Δy / hourH × 60);保留工時,只挪開始。
//   縮放:Δ工時 = round(Δy / hourH × 2)/2(對齊 0.5 小時);保留開始,只改時長。
// 用「相對任務開始的累積位移」計算,不管抓到多日任務的哪一天都對。放手才 onCommit(只寫一次)。
export function useCalendarDrag({ hourH, daysAreaRef, canEdit, onCommit }) {
  const [drag, setDrag] = useState(null); // { key, mode, dx, dy } —— 給即時預覽用
  const dragRef = useRef(null);

  const commit = useCallback((info) => {
    const { task, project, mode, dx, dy, colWidth } = info;
    const startDayStr = fmtF(new Date(task.start));
    const firstO = task.days?.[startDayStr]?.o ?? 0;
    const startMin = offsetToClockMin(firstO);

    let changes;
    if (mode === 'move') {
      const deltaDays = Math.round(dx / colWidth);
      const deltaMin = snapMin((dy / hourH) * 60);
      const newStartDay = fmtF(addD(new Date(task.start), deltaDays));
      const newStartMin = clampStartMin(startMin + deltaMin);
      if (deltaDays === 0 && newStartMin === startMin) return; // 沒變不寫
      changes = { pinnedStart: newStartDay, pinnedStartMin: newStartMin, pinnedHours: task.hours };
    } else {
      const deltaHours = Math.round((dy / hourH) * 2) / 2;
      const newHours = Math.max(0.5, task.hours + deltaHours);
      if (newHours === task.hours) return;
      changes = { pinnedStart: startDayStr, pinnedStartMin: startMin, pinnedHours: newHours };
    }
    Promise.resolve(onCommit(project.id, task.id, changes))
      .catch((err) => console.error('拖拉排程儲存失敗', err));
  }, [hourH, onCommit]);

  const onPointerDown = useCallback((event, mode, task, project) => {
    if (!canEdit || event.button !== 0) return;
    event.stopPropagation();
    const colWidth = daysAreaRef.current ? daysAreaRef.current.clientWidth / 7 : 1;
    const info = {
      mode, task, project, colWidth,
      startX: event.clientX, startY: event.clientY,
      dx: 0, dy: 0, moved: false,
      key: `${project.id}-${task.id}`,
    };
    dragRef.current = info;
    setDrag({ key: info.key, mode, dx: 0, dy: 0 });

    const onMove = (ev) => {
      const cur = dragRef.current;
      if (!cur) return;
      cur.dx = ev.clientX - cur.startX;
      cur.dy = ev.clientY - cur.startY;
      if (Math.abs(cur.dx) > 3 || Math.abs(cur.dy) > 3) cur.moved = true;
      setDrag({ key: cur.key, mode: cur.mode, dx: cur.dx, dy: cur.dy });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (cur && cur.moved) commit(cur); // 沒真的移動 = 當成點擊/雙擊,不寫
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [canEdit, daysAreaRef, commit]);

  return { drag, onPointerDown };
}
