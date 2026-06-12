import { useRef, useEffect } from 'react'

// 貓眼模組，含眨眼動畫
// Props:
//   scale         - 眼睛大小倍數（預設 1）
//   gap           - 兩眼中心的距離，SVG 座標單位（預設 19）
//   blinkInterval - 眨眼週期，ms（預設 10000）
const CatEyes = ({ scale = 1, gap = 19, blinkInterval = 10000 }) => {
  const rightRef = useRef(null)
  const leftRef  = useRef(null)

  useEffect(() => {
    const blink = () => {
      const r = rightRef.current
      const l = leftRef.current
      if (!r || !l) return

      const close = () => { r.style.display = 'none';  l.style.display = 'none'  }
      const open  = () => { r.style.display = 'block'; l.style.display = 'block' }

      close()
      setTimeout(open,  130)   // 第 1 下（閉 130ms）
      setTimeout(close, 330)
      setTimeout(open,  460)   // 第 2 下（閉 130ms）
    }

    const id = setInterval(blink, blinkInterval)
    return () => clearInterval(id)
  }, [blinkInterval])

  const half = gap / 2

  return (
    <g>
      {/* 右眼 */}
      <g ref={rightRef} transform={`translate(${half}, 0) scale(${scale})`}>
        {/* 眼白 */}
        <path
          fill="rgb(255,255,255)"
          fillOpacity="1"
          d="M4.915,-1.315 C4.915,-1.315 3.455,1.595 0.625,2.355 C-2.195,3.115 -4.915,1.315 -4.915,1.315 C-4.915,1.315 -3.465,-1.595 -0.635,-2.355 C2.195,-3.115 4.915,-1.315 4.915,-1.315z"
        />
        {/* 瞳孔 */}
        <path
          fill="rgb(0,0,0)"
          fillOpacity="1"
          d="M2.357,-0.632 C2.706,0.670 1.933,2.008 0.631,2.357 C-0.670,2.706 -2.009,1.933 -2.357,0.631 C-2.706,-0.671 -1.934,-2.009 -0.632,-2.358 C0.670,-2.706 2.008,-1.934 2.357,-0.632z"
        />
      </g>

      {/* 左眼 */}
      <g ref={leftRef} transform={`translate(${-half}, 0) scale(${scale})`}>
        {/* 眼白 */}
        <path
          fill="rgb(255,255,255)"
          fillOpacity="1"
          d="M4.915,1.315 C4.915,1.315 2.195,3.115 -0.635,2.355 C-3.455,1.595 -4.915,-1.315 -4.915,-1.315 C-4.915,-1.315 -2.195,-3.115 0.635,-2.355 C3.455,-1.595 4.915,1.315 4.915,1.315z"
        />
        {/* 瞳孔 */}
        <path
          fill="rgb(0,0,0)"
          fillOpacity="1"
          d="M2.357,0.632 C2.008,1.934 0.670,2.706 -0.632,2.358 C-1.934,2.009 -2.706,0.671 -2.357,-0.631 C-2.009,-1.933 -0.670,-2.706 0.631,-2.357 C1.933,-2.008 2.706,-0.670 2.357,0.632z"
        />
      </g>
    </g>
  )
}

export default CatEyes
