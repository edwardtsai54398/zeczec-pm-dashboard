import { useCallback, useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useWorkspace } from '../../../context/WorkspaceContext.jsx';
import { useAuthContext } from '../../../context/AuthContext.jsx';
import { useDraftEditor } from '../../../hooks/useDraftEditor.js';
import { usePermissions } from '../../../hooks/usePermissions.js';
import {
  useWorkspaceMembers, addWorkspaceMember, removeWorkspaceMember,
  updateWorkspaceMemberRole, updateMyAvailability,
} from '../../../hooks/useWorkspaceMembers.js';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal.jsx';
import AddMemberModal from '../../../components/AddMemberModal/index.jsx';
import CatCompanionEditor from './CatCompanionEditor.jsx';
import MyAvailabilityEditor from './MyAvailabilityEditor.jsx';
import MembersEditor from './MembersEditor.jsx';
import styles from './SettingsPage.module.css';

// 設定頁:分「工作區設定」(成員清單,唯讀顯示各人工時/休假)與
// 「個人化設定」(每日工時／休假 + 貓咪)兩區,標題在卡片外。
// 每日工時/休假是個人資料,人人只能改自己的(不分角色),故放進個人化設定;
// 成員的改角色/踢除仍限 owner,貓咪不受角色限制。
export default function SettingsPage() {
  const { settings } = useWorkspace();
  const { preferences, savePreferences, workspaceId, session } = useAuthContext();
  const { can } = usePermissions();

  const userId = session?.user?.id;
  const [showAddMember, setShowAddMember] = useState(false);

  // 成員清單在真正用到的這層(設定頁 = 新增成員動作所在)呼叫,再把資料/handler 傳給
  // 緊鄰的呈現用 MembersEditor。改角色 / 踢除 / 存自己可用性成功後 refetch,清單即時反映。
  const { members, loading: membersLoading, error: membersError, refetch: refetchMembers } =
    useWorkspaceMembers(workspaceId);
  const changeMemberRole = useCallback(
    (targetId, role) => updateWorkspaceMemberRole(workspaceId, targetId, role).then(refetchMembers),
    [workspaceId, refetchMembers],
  );
  const removeMember = useCallback(
    (targetId) => removeWorkspaceMember(workspaceId, targetId).then(refetchMembers),
    [workspaceId, refetchMembers],
  );
  // 存自己的可用性(工時/休假):後端只寫 auth.uid() 那列,存完 refetch 讓清單同步。
  const saveMyAvailability = useCallback(
    (dailyHours, daysOff) => updateMyAvailability(workspaceId, dailyHours, daysOff).then(refetchMembers),
    [workspaceId, refetchMembers],
  );

  // 個人化卡的「每日工時／休假」初始值取自己那筆成員列(載入後才掛載)。
  const myMember = members.find((member) => member.user_id === userId);

  const cat = useDraftEditor(preferences);
  const saveCat = useCallback(() => savePreferences(cat.draft), [savePreferences, cat.draft]);

  // 只剩貓咪走頁面層草稿;「每日工時／休假」自帶 SaveBar 各自落地,不併入離開攔截。
  const anyDirty = cat.dirty;

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
          <MembersEditor
            members={members} loading={membersLoading} error={membersError}
            canManage={can('manageMembers')} currentUserId={userId}
            defaultHours={settings.hoursPerDay}
            onRoleChange={changeMemberRole} onRemove={removeMember}
          />
        </div>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>個人化設定</h2>
        <div className="card">
          {myMember && (
            <>
              <MyAvailabilityEditor
                key={workspaceId} myMember={myMember}
                defaultHours={settings.hoursPerDay} onSave={saveMyAvailability}
              />
              <div className={styles.divider} />
            </>
          )}
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
        onDiscard={() => { cat.discard(); blocker.proceed(); }}
        onSave={async () => { await saveCat(); blocker.proceed(); }}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}
