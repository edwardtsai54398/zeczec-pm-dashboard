import { useEffect, useRef } from 'react';
import { runScheduleV2 } from '../lib/schedulerV2.js';
import { freezeSchedule, isSchedulable } from '../lib/scheduleStore.js';

// 改版前的舊專案 data 沒有 schedule 欄位(schedule === undefined),過去都是每次載入即時算。
// 改版後排程改成落地,這支 hook 在首次載入偵測到這種舊專案時,跑一次排程(＝今日的全域行為,
// 共用工時預算)並凍結寫回雲端,讓既有排程無感接軌。
//
// 只針對 schedule === undefined 的專案:新專案建立時帶 schedule:{}(欄位存在但空),
// 所以「新專案在快速排程前是空的」不會被這裡誤遷移。寫回失敗(樂觀鎖)的專案下次載入會再試。
export function useMigrateSchedules({ projects, settings, loaded, saveProjectToCloud, setProjects }) {
  const doneRef = useRef(false);

  useEffect(() => {
    if (!loaded || doneRef.current) return;
    // 專案還沒從雲端載入,等下次 render 再判斷(此時不設 doneRef)。
    if (projects.length === 0) return;

    const targets = projects.filter((p) => p.schedule === undefined && isSchedulable(p));
    if (targets.length === 0) { doneRef.current = true; return; }
    doneRef.current = true; // 只跑一次

    (async () => {
      try {
        const { sch } = runScheduleV2(targets, settings);
        const saved = {};
        for (const project of targets) {
          const schedule = freezeSchedule(sch[project.id] || {});
          try {
            const result = await saveProjectToCloud({ ...project, schedule });
            saved[result.id] = result;
          } catch (e) {
            // 樂觀鎖衝突等:略過,下次載入會重試(該專案仍是 schedule === undefined)
            console.error('遷移排程儲存失敗', project.id, e);
          }
        }
        if (Object.keys(saved).length > 0) {
          setProjects((v) => v.map((p) => saved[p.id] || p));
        }
      } catch (e) {
        console.error('遷移排程失敗', e);
      }
    })();
  }, [loaded, projects, settings, saveProjectToCloud, setProjects]);
}
