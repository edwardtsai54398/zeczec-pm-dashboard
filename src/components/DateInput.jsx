import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const POPUP_W = 228;

export function DateInput({ value, onChange, className, style }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  const parsed = value
    ? { y: +value.slice(0, 4), m: +value.slice(5, 7) - 1, d: +value.slice(8, 10) }
    : null;

  const [vy, setVy] = useState(() => parsed?.y ?? new Date().getFullYear());
  const [vm, setVm] = useState(() => parsed?.m ?? new Date().getMonth());

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (
        !triggerRef.current?.contains(e.target) &&
        !popupRef.current?.contains(e.target)
      ) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const openPicker = () => {
    if (parsed) { setVy(parsed.y); setVm(parsed.m); }
    const rect = triggerRef.current.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - POPUP_W - 8);
    setPos({ bottom: window.innerHeight - rect.top + 6, left });
    setOpen(true);
  };

  const nav = (delta) => {
    const d = new Date(vy, vm + delta, 1);
    setVy(d.getFullYear());
    setVm(d.getMonth());
  };

  const pick = (day) => {
    const m = String(vm + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange({ target: { value: `${vy}-${m}-${d}` } });
    setOpen(false);
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange({ target: { value: '' } });
  };

  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const firstDow = new Date(vy, vm, 1).getDay();
  const display = parsed
    ? `${parsed.y}/${String(parsed.m + 1).padStart(2, '0')}/${String(parsed.d).padStart(2, '0')}`
    : '';

  const popup = open && createPortal(
    <div ref={popupRef} className="di-popup" style={{ bottom: pos.bottom, left: pos.left }}>
      <div className="di-hd">
        <button type="button" className="di-nav" onClick={() => nav(-1)}>‹</button>
        <span className="di-title">{vy}年 {vm + 1}月</span>
        <button type="button" className="di-nav" onClick={() => nav(1)}>›</button>
      </div>
      <div className="di-grid">
        {WEEK.map((w) => <div key={w} className="di-dow">{w}</div>)}
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const isSel = parsed && parsed.y === vy && parsed.m === vm && parsed.d === day;
          return (
            <button
              type="button"
              key={day}
              className={`di-day${isSel ? ' sel' : ''}`}
              onClick={() => pick(day)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );

  return (
    <div ref={triggerRef} className="di-wrap">
      <button
        type="button"
        className={`di-trigger${className ? ` ${className}` : ''}`}
        style={style}
        onClick={openPicker}
      >
        <span className={display ? undefined : 'di-ph'}>{display || '選擇日期'}</span>
        {value && <span className="di-x" onClick={clear}><i className="ti ti-x"></i></span>}
      </button>
      {popup}
    </div>
  );
}
