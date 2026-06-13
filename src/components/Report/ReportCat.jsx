import CatEyes from '../CatSvg/CatEyes.jsx';

// 「回報問題」按鈕的貓咪對話框圖形。手繪 SVG：左側貓頭（雙耳 + 雙眼）、
// 圓角氣泡身體、右側上翹尾巴，標籤文字直接畫進身體（SVG 座標，縮放不跑位）。
// 眼睛沿用共用的 CatEyes（含眨眼動畫）。color 預設 --t-olive；label / color 可由外部覆寫。
export default function ReportCat({ className = '', color = 'var(--t-olive)', label = '回報問題' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 8 272 98"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      {/* 尾巴（畫在身體底下，從右側上翹） */}
      <path
        d="M212 58 C 238 52 254 46 258 22"
        fill="none"
        stroke={color}
        strokeWidth="15"
        strokeLinecap="round"
      />

      {/* 雙耳（畫在身體底下，只露出尖端） */}
      <path d="M30 52 L44 18 L62 52 Z" fill={color} />
      <path d="M58 52 L74 20 L90 52 Z" fill={color} />

      {/* 氣泡身體 */}
      <rect x="20" y="46" width="200" height="52" rx="26" fill={color} />

      {/* 雙眼（共用 CatEyes，含眨眼動畫） */}
      <g transform="translate(56, 64)">
        <CatEyes scale={1.5} gap={25} />
      </g>

      {/* 標籤文字：置於身體中段，避開左側貓臉與右側尾巴 */}
      <text
        x="151"
        y="80"
        textAnchor="middle"
        fontFamily="var(--font-sans)"
        fontSize="20"
        fontWeight="500"
        letterSpacing={2.5}
        fill="#000"
      >
        {label}
      </text>
    </svg>
  );
}
