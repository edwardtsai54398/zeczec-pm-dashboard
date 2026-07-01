import { describe, it, expect } from 'vitest';
import { can } from '../permissions.js';

// 權限站點的真值表:三種角色 × 各 capability,固定行為一旦改動就會被這裡擋下。
describe('permissions.can', () => {
  it('owner 能做所有事', () => {
    const caps = [
      'manageMembers', 'editWorkspaceSettings', 'editKOL',
      'editProject', 'editGantt', 'editDashboard', 'viewOverdue',
    ];
    caps.forEach((cap) => expect(can('owner', cap)).toBe(true));
  });

  it('editor 能編輯內容,但不能管理成員或改工作區設定', () => {
    expect(can('editor', 'editKOL')).toBe(true);
    expect(can('editor', 'editProject')).toBe(true);
    expect(can('editor', 'editGantt')).toBe(true);
    expect(can('editor', 'editDashboard')).toBe(true);
    expect(can('editor', 'viewOverdue')).toBe(true);
    expect(can('editor', 'manageMembers')).toBe(false);
    expect(can('editor', 'editWorkspaceSettings')).toBe(false);
  });

  it('viewer 一律唯讀,且看不到逾期卡', () => {
    const denied = [
      'manageMembers', 'editWorkspaceSettings', 'editKOL',
      'editProject', 'editGantt', 'editDashboard', 'viewOverdue',
    ];
    denied.forEach((cap) => expect(can('viewer', cap)).toBe(false));
  });

  it('未知角色 / 尚未載入(null)一律不能做', () => {
    expect(can(null, 'editKOL')).toBe(false);
    expect(can(undefined, 'viewOverdue')).toBe(false);
    expect(can('stranger', 'editProject')).toBe(false);
  });

  it('未知 capability 回傳 false,不會誤放行', () => {
    expect(can('owner', 'nukeEverything')).toBe(false);
  });
});
