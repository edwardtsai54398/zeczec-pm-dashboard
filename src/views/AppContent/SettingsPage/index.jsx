import { useCallback, useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { useWorkspace } from '../../../context/WorkspaceContext.jsx';
import { useAuthContext } from '../../../context/AuthContext.jsx';
import { useDraftEditor } from '../../../hooks/useDraftEditor.js';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal.jsx';
import DailyHoursEditor from './DailyHoursEditor.jsx';
import CatCompanionEditor from './CatCompanionEditor.jsx';
import BlackoutEditor from './BlackoutEditor.jsx';
import styles from './SettingsPage.module.css';

// 設定頁:三個編輯器各自有草稿/儲存。
// 工時、不可用時段是 workspace 設定(走 workspaces.settings);貓咪是個人偏好(走 profiles.preferences)。
export default function SettingsPage() {
  const { settings, saveSettingsToCloud } = useWorkspace();
  const { preferences, savePreferences } = useAuthContext();

  const hours = useDraftEditor(settings.hoursPerDay);
  const blackouts = useDraftEditor(settings.blackouts);
  const cat = useDraftEditor(preferences);

  // 工時、不可用時段共用 workspaces.settings 一個 JSONB。
  // 各自儲存時只把自己的 slice 蓋上「已存的整包 settings」,另一個用的是 context 裡的已存值,
  // 所以單獨存其中一個不會把另一個未存的草稿一起送出,也不會覆寫對方已存的值。
  const saveHours = useCallback(
    () => saveSettingsToCloud({ ...settings, hoursPerDay: hours.draft }),
    [saveSettingsToCloud, settings, hours.draft],
  );
  const saveBlackouts = useCallback(
    () => saveSettingsToCloud({ ...settings, blackouts: blackouts.draft }),
    [saveSettingsToCloud, settings, blackouts.draft],
  );
  const saveCat = useCallback(() => savePreferences(cat.draft), [savePreferences, cat.draft]);

  const anyDirty = hours.dirty || blackouts.dirty || cat.dirty;

  // 有未存草稿時離開設定頁攔截(比照 ProjectPage)。
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        anyDirty && currentLocation.pathname !== nextLocation.pathname,
      [anyDirty],
    ),
  );

  // 重整 / 關分頁前提醒
  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [anyDirty]);

  // 離開攔截時的「全部儲存」:workspace 兩個編輯器合併寫一次(避免互蓋),再視需要存貓咪。
  const saveAll = useCallback(async () => {
    if (hours.dirty || blackouts.dirty) {
      await saveSettingsToCloud({ ...settings, hoursPerDay: hours.draft, blackouts: blackouts.draft });
    }
    if (cat.dirty) await saveCat();
  }, [hours.dirty, hours.draft, blackouts.dirty, blackouts.draft, cat.dirty, settings, saveSettingsToCloud, saveCat]);

  const discardAll = useCallback(() => {
    hours.discard();
    blackouts.discard();
    cat.discard();
  }, [hours, blackouts, cat]);

  return (
    <div className={styles.wrap}>
      <DailyHoursEditor
        draft={hours.draft} onChange={hours.setDraft} dirty={hours.dirty}
        onSave={saveHours} onDiscard={hours.discard}
      />
      <CatCompanionEditor
        draft={cat.draft} onChange={cat.setDraft} dirty={cat.dirty}
        onSave={saveCat} onDiscard={cat.discard}
      />
      <BlackoutEditor
        draft={blackouts.draft} onChange={blackouts.setDraft} dirty={blackouts.dirty}
        onSave={saveBlackouts} onDiscard={blackouts.discard}
      />

      <UnsavedChangesModal
        open={blocker.state === 'blocked'}
        onDiscard={() => { discardAll(); blocker.proceed(); }}
        onSave={async () => { await saveAll(); blocker.proceed(); }}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}
