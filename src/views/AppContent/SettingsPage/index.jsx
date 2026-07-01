import { useCallback, useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useWorkspace } from '../../../context/WorkspaceContext.jsx';
import { useAuthContext } from '../../../context/AuthContext.jsx';
import { useDraftEditor } from '../../../hooks/useDraftEditor.js';
import { usePermissions } from '../../../hooks/usePermissions.js';
import {
  useWorkspaceMembers, addWorkspaceMember, removeWorkspaceMember, updateWorkspaceMemberRole,
} from '../../../hooks/useWorkspaceMembers.js';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal.jsx';
import AddMemberModal from '../../../components/AddMemberModal/index.jsx';
import DailyHoursEditor from './DailyHoursEditor.jsx';
import CatCompanionEditor from './CatCompanionEditor.jsx';
import BlackoutEditor from './BlackoutEditor.jsx';
import MembersEditor from './MembersEditor.jsx';
import styles from './SettingsPage.module.css';

// 設定頁:分「工作區設定」(工時 + 不可用時段,走 workspaces.settings)與
// 「個人化設定」(貓咪,走 profiles.preferences)兩區,標題在卡片外。
// 工作區設定只有 owner 能改(editWorkspaceSettings);個人化不受角色限制。
export default function SettingsPage() {
  const { settings, saveSettingsToCloud } = useWorkspace();
  const { preferences, savePreferences, workspaceId, session } = useAuthContext();
  const { can } = usePermissions();

  const canEditWorkspace = can('editWorkspaceSettings');
  const [showAddMember, setShowAddMember] = useState(false);

  // 成員清單在真正用到的這層(設定頁 = 新增成員動作所在)呼叫,再把資料/handler 傳給
  // 緊鄰的呈現用 MembersEditor。改角色 / 踢除成功後 refetch,清單即時反映。
  const { members, loading: membersLoading, error: membersError, refetch: refetchMembers } =
    useWorkspaceMembers(workspaceId);
  const changeMemberRole = useCallback(
    (userId, role) => updateWorkspaceMemberRole(workspaceId, userId, role).then(refetchMembers),
    [workspaceId, refetchMembers],
  );
  const removeMember = useCallback(
    (userId) => removeWorkspaceMember(workspaceId, userId).then(refetchMembers),
    [workspaceId, refetchMembers],
  );

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
      <section>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>工作區設定</h2>
          {can('manageMembers') && (
            <button className={`cta-primary ${styles.addMemberBtn}`} onClick={() => setShowAddMember(true)}>
              <i className="ti ti-user-plus"></i>新增成員
            </button>
          )}
        </div>
        <div className="card">
          <DailyHoursEditor
            draft={hours.draft} onChange={hours.setDraft} dirty={hours.dirty}
            onSave={saveHours} onDiscard={hours.discard} canEdit={canEditWorkspace}
          />
          <div className={styles.divider} />
          <BlackoutEditor
            draft={blackouts.draft} onChange={blackouts.setDraft} dirty={blackouts.dirty}
            onSave={saveBlackouts} onDiscard={blackouts.discard} canEdit={canEditWorkspace}
          />
          <div className={styles.divider} />
          <MembersEditor
            members={members} loading={membersLoading} error={membersError}
            canManage={can('manageMembers')} currentUserId={session?.user?.id}
            onRoleChange={changeMemberRole} onRemove={removeMember}
          />
        </div>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>個人化設定</h2>
        <div className="card">
          <CatCompanionEditor
            draft={cat.draft} onChange={cat.setDraft} dirty={cat.dirty}
            onSave={saveCat} onDiscard={cat.discard}
          />
        </div>
      </section>

      <AddMemberModal
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
        onConfirm={async (email, role) => {
          await addWorkspaceMember(workspaceId, email, role);
          refetchMembers(); // 新增成功後刷新清單,新成員立即出現
        }}
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
