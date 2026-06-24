import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraftEditor } from '../useDraftEditor.js';

describe('useDraftEditor', () => {
  it('初始草稿等於 saved,且 dirty 為 false', () => {
    const { result } = renderHook(() => useDraftEditor({ catEnabled: true, catCount: 20 }));
    expect(result.current.draft).toEqual({ catEnabled: true, catCount: 20 });
    expect(result.current.dirty).toBe(false);
  });

  it('改草稿後 dirty 變 true,值不同才算 dirty', () => {
    const { result } = renderHook(() => useDraftEditor(8));

    act(() => result.current.setDraft(10));
    expect(result.current.dirty).toBe(true);

    // 改回原值 → 不再 dirty(用值比對而非有沒有改過)
    act(() => result.current.setDraft(8));
    expect(result.current.dirty).toBe(false);
  });

  it('discard 把草稿還原成 saved', () => {
    const { result } = renderHook(() => useDraftEditor([{ id: 'b1' }]));

    act(() => result.current.setDraft([{ id: 'b1' }, { id: 'b2' }]));
    expect(result.current.dirty).toBe(true);

    act(() => result.current.discard());
    expect(result.current.draft).toEqual([{ id: 'b1' }]);
    expect(result.current.dirty).toBe(false);
  });

  it('外部 saved 變動(雲端載入/儲存成功)時草稿跟著重設,dirty 回 false', () => {
    const { result, rerender } = renderHook(({ saved }) => useDraftEditor(saved), {
      initialProps: { saved: 8 },
    });

    act(() => result.current.setDraft(10));
    expect(result.current.dirty).toBe(true);

    // saved 換成新值 → 草稿重設成新值
    rerender({ saved: 12 });
    expect(result.current.draft).toBe(12);
    expect(result.current.dirty).toBe(false);
  });

  it('saved 是每 render 新物件但值相同時,不會誤清正在編輯的草稿', () => {
    const { result, rerender } = renderHook(
      // 模擬 preferences:每次都傳值相同但 identity 不同的新物件
      () => useDraftEditor({ catEnabled: true, catCount: 20 }),
    );

    act(() => result.current.setDraft({ catEnabled: true, catCount: 30 }));
    expect(result.current.dirty).toBe(true);

    rerender();
    expect(result.current.draft).toEqual({ catEnabled: true, catCount: 30 });
    expect(result.current.dirty).toBe(true);
  });
});
