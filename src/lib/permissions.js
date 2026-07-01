// 角色 → 能力矩陣。權限的唯一站點:UI 只透過 can() 問「能不能做某件事」,
// 不在各元件散落角色字串判斷,改權限規則時只動這裡一處。
const CAPABILITIES = {
  manageMembers: ['owner'], // 新增/管理成員(設定頁右上角)
  editWorkspaceSettings: ['owner'], // 每日工時、不可用時段
  editKOL: ['owner', 'editor'], // KOL 新增/修改/刪除(含日期)
  editProject: ['owner', 'editor'], // 專案編輯/封存/任務清單(含日期)
  editGantt: ['owner', 'editor'], // 甘特圖 double click 訂選日期
  editDashboard: ['owner', 'editor'], // Dashboard 打勾 / 過期關閉
  viewOverdue: ['owner', 'editor'], // viewer 看不到逾期卡
};

// role 可能是 null(尚未載入工作區),用 ?? false 收斂成「不能做」。
export function can(role, capability) {
  return CAPABILITIES[capability]?.includes(role) ?? false;
}

// 角色中文標籤,給成員彈窗 / 工作區切換器共用。
export const ROLE_LABELS = { owner: '擁有者', editor: '編輯者', viewer: '檢視者' };
