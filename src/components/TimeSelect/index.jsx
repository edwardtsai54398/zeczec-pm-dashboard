import { SNAP_MIN } from '../../lib/scheduleTime.js';
import styles from './TimeSelect.module.css';

// 30 分鐘一格的時刻下拉。value / onChange 都用「自午夜起的分鐘數」(整數)。
// 預設範圍上午 8 點～午夜(對齊行事曆格線);若目前值不在格點上(理論上不會)也會補進選項,
// 避免 <select> 出現空值。
function label(min) {
  const hour = Math.floor(min / 60);
  const minute = min % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function TimeSelect({ value, onChange, minMin = 8 * 60, maxMin = 24 * 60, disabled, className }) {
  const slots = [];
  for (let min = minMin; min <= maxMin; min += SNAP_MIN) slots.push(min);
  if (value != null && !slots.includes(value)) {
    slots.push(value);
    slots.sort((a, b) => a - b);
  }

  return (
    <select
      className={`${styles.select}${className ? ` ${className}` : ''}`}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {slots.map((min) => (
        <option key={min} value={min}>{label(min)}</option>
      ))}
    </select>
  );
}
