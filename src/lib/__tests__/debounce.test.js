import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../debounce.js';

// 用假計時器精準控制時間流逝,驗證「停手後才執行」的行為。
describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('連續呼叫只在停手後執行一次,且用最後一次的參數', () => {
    const fn = vi.fn();
    const d = debounce(fn, 2000);

    d('a');
    d('b');
    d('c');
    expect(fn).not.toHaveBeenCalled(); // 還在計時,不該執行

    vi.advanceTimersByTime(1999);
    expect(fn).not.toHaveBeenCalled(); // 差 1 毫秒,仍不執行

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c'); // 只保留最後一次參數
  });

  it('每次呼叫都重設計時器(停手才觸發)', () => {
    const fn = vi.fn();
    const d = debounce(fn, 2000);

    d('x');
    vi.advanceTimersByTime(1500);
    d('y'); // 距上次 1.5 秒又觸發 → 重新計時
    vi.advanceTimersByTime(1500);
    expect(fn).not.toHaveBeenCalled(); // 距最後一次呼叫才 1.5 秒

    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('y');
  });

  it('預設等待 2 秒', () => {
    const fn = vi.fn();
    const d = debounce(fn);
    d();
    vi.advanceTimersByTime(1999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel 取消尚未送出的呼叫', () => {
    const fn = vi.fn();
    const d = debounce(fn, 2000);
    d();
    d.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush 立刻送出排隊中的呼叫(用最後一次參數),且不重複觸發', () => {
    const fn = vi.fn();
    const d = debounce(fn, 2000);

    d('pending');
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('pending');

    // 已無排隊 → 再 flush 不應重複執行,計時器也不會再觸發
    d.flush();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
