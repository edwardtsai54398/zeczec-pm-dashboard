import { useState } from 'react';
import CatType1 from './Type1';
import CatType2 from './Type2';
import CatType3 from './Type3';
import CatType4 from './Type4';
import CatType5 from './Type5';

const INKS = [
  '--t-lavender',
  '--t-lavender-ink',
  '--t-lime-ink',
  '--t-peach-ink',
  '--t-rose',
  '--t-rose-ink',
  '--t-sky-ink',
  '--t-olive',
  '--t-olive-ink'
];
const ink = () => `var(${INKS[Math.floor(Math.random() * INKS.length)]})`;

const RENDERERS = [
  () => <CatType1 color={ink()} />,
  () => <CatType2 catColor={ink()} poopColor={ink()} />,
  () => <CatType3 color={ink()} />,
  () => <CatType4 color={ink()} />,
  () => <CatType5 color={ink()} />,
];

// position 由外部決定：透過 className / style 傳入定位
// 每個 instance 各自隨機抽一次貓種 / 顏色 / 大小，並凍結（lazy useState），
// 之後 re-render 不會閃爍變色或變形。
export default function RandomCat({ className = '', size, style }) {
  const [node] = useState(() => RENDERERS[Math.floor(Math.random() * RENDERERS.length)]());
  const [randSize] = useState(() => Math.round(100 + Math.random() * 50));
  const finalSize = size ?? randSize;

  return (
    <div
      className={`random-cat${className ? ` ${className}` : ''}`}
      style={{ width: finalSize, height: finalSize, ...style }}
    >
      {node}
    </div>
  );
}
