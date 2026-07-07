import { describe, it, expect } from 'vitest';
import { bucketFor, buildMemberColors, memberColorOf, layoutDayColumns, hourLabel } from '../utils.js';
import { MEMBER_PALETTE, MEMBER_UNASSIGNED_COLOR } from '../../../../constants.js';

// 行事曆多人視覺分離用到的純函式。

describe('bucketFor: 任務歸哪個成員桶', () => {
  const ownerId = 'U_owner';
  const memberIdSet = new Set(['U_owner', 'U_b']);

  it('指派給非 owner 的現有成員 → 該成員本人', () => {
    expect(bucketFor('U_b', ownerId, memberIdSet)).toBe('U_b');
  });

  it('未指派(null/undefined)→ owner', () => {
    expect(bucketFor(null, ownerId, memberIdSet)).toBe('U_owner');
    expect(bucketFor(undefined, ownerId, memberIdSet)).toBe('U_owner');
  });

  it('指派給 owner 本人 → owner', () => {
    expect(bucketFor('U_owner', ownerId, memberIdSet)).toBe('U_owner');
  });

  it('指派給已離開工作區的成員(不在 memberIdSet)→ owner', () => {
    expect(bucketFor('U_gone', ownerId, memberIdSet)).toBe('U_owner');
  });

  it('owner 尚未載入(ownerId=null)→ null(未指派桶)', () => {
    expect(bucketFor(undefined, null, new Set())).toBe(null);
  });
});

describe('buildMemberColors / memberColorOf: 成員配色', () => {
  it('依成員順序取調色盤,同輸入穩定', () => {
    const members = [{ user_id: 'A' }, { user_id: 'B' }, { user_id: 'C' }];
    const colors = buildMemberColors(members);
    expect(colors.get('A')).toBe(MEMBER_PALETTE[0]);
    expect(colors.get('B')).toBe(MEMBER_PALETTE[1]);
    expect(colors.get('C')).toBe(MEMBER_PALETTE[2]);
    // 再算一次結果相同
    expect(buildMemberColors(members).get('B')).toBe(MEMBER_PALETTE[1]);
  });

  it('成員數超過調色盤長度時繞回頭', () => {
    const members = Array.from({ length: MEMBER_PALETTE.length + 1 }, (_, i) => ({ user_id: `U${i}` }));
    const colors = buildMemberColors(members);
    expect(colors.get(`U${MEMBER_PALETTE.length}`)).toBe(MEMBER_PALETTE[0]);
  });

  it('memberColorOf:null 或查無 → 中性灰;有對應 → 該色', () => {
    const colors = buildMemberColors([{ user_id: 'A' }]);
    expect(memberColorOf(colors, null)).toBe(MEMBER_UNASSIGNED_COLOR);
    expect(memberColorOf(colors, 'unknown')).toBe(MEMBER_UNASSIGNED_COLOR);
    expect(memberColorOf(colors, 'A')).toBe(MEMBER_PALETTE[0]);
  });
});

describe('layoutDayColumns: 同日時間重疊錯開', () => {
  it('時間不相交(接續)→ 各自整寬 cols=1', () => {
    const a = { offset: 0, hours: 2 };
    const b = { offset: 2, hours: 2 };
    const layout = layoutDayColumns([a, b]);
    expect(layout.get(a).cols).toBe(1);
    expect(layout.get(b).cols).toBe(1);
  });

  it('兩塊完全重疊 → cols=2,分佔第 0、1 欄', () => {
    const a = { offset: 0, hours: 4 };
    const b = { offset: 0, hours: 4 };
    const layout = layoutDayColumns([a, b]);
    expect(layout.get(a).cols).toBe(2);
    expect(layout.get(b).cols).toBe(2);
    expect(new Set([layout.get(a).col, layout.get(b).col])).toEqual(new Set([0, 1]));
  });

  it('重疊群與獨立塊各自算 cols', () => {
    const a = { offset: 0, hours: 4 };  // 與 b 重疊
    const b = { offset: 0, hours: 4 };
    const c = { offset: 5, hours: 2 };  // 獨立
    const layout = layoutDayColumns([a, b, c]);
    expect(layout.get(a).cols).toBe(2);
    expect(layout.get(b).cols).toBe(2);
    expect(layout.get(c).cols).toBe(1);
  });

  it('不改動輸入陣列(以 block 參照為 key 回傳)', () => {
    const a = { offset: 0, hours: 4 };
    const input = [a];
    layoutDayColumns(input);
    expect(input).toEqual([{ offset: 0, hours: 4 }]);
  });
});

describe('hourLabel: 時鐘標籤', () => {
  it('上午 / 中午 / 下午 / 午夜', () => {
    expect(hourLabel(8)).toBe('上午8點');
    expect(hourLabel(11)).toBe('上午11點');
    expect(hourLabel(12)).toBe('中午12點');
    expect(hourLabel(13)).toBe('下午1點');
    expect(hourLabel(23)).toBe('下午11點');
    expect(hourLabel(0)).toBe('午夜12點');
  });
});
