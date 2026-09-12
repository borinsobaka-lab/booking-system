// Круглые SVG-флаги стран — рисуем сами, без внешних библиотек и картинок.
//
// Флаг описывается компактной строкой-рецептом (поле `flag` в src/countries.ts),
// которую разбирает `flagShapes`. Холст всегда 60×60: прямоугольный флаг
// «растянут» в квадрат, потому что в интерфейсе он показывается кружком —
// так в кружок попадает весь рисунок, а не только его середина.
//
// Грамматика: слои разделяются `;`, внутри слоя — токены через пробел.
//   h  c1 c2 …            горизонтальные полосы равной высоты
//   v  c1 c2 …            вертикальные полосы равной ширины
//                         (у любой полосы можно задать вес: `c:2`)
//   bg c                  сплошная заливка
//   r  c x y w h          прямоугольник
//   c  c cx cy r          круг
//   e  c cx cy rx ry      эллипс
//   s  c cx cy r [угол]   пятиконечная звезда
//   u  c cx cy r [лучи]   солнце (круг с лучами)
//   m  c bg cx cy r       полумесяц (рисуется кругом по фону bg)
//   x  c cx cy t          крест (вертикальная + горизонтальная полосы)
//   t  c x1 y1 x2 y2 x3 y3   треугольник
//   y  c x1,y1 x2,y2 …    многоугольник
//   l  c x1 y1 x2 y2 w    линия заданной толщины
//   p  c d                путь (в `d` вместо пробелов запятые)
//
// Гербы и сложные эмблемы даны узнаваемым упрощением: в кружке 22 px мелкие
// детали всё равно не читаются, важны цвета и общая фигура.

import { memo, type ReactNode } from 'react'
import { COUNTRIES } from './countries'

/** Часто повторяющиеся цвета — чтобы рецепты флагов были короче. */
const PALETTE: Record<string, string> = {
  W: '#ffffff',
  K: '#1a1a1a',
  R: '#d52b1e',
  G: '#009e49',
  B: '#0055a4',
  Y: '#fcd116',
  O: '#ff7f00',
  N: '#002b7f',
  C: '#4189dd',
  S: '#8b8b8b',
}

function color(token: string): string {
  return PALETTE[token] ?? token
}

const n = (v: string): number => Number(v)

/** Пятиконечная звезда: чередуем внешний и внутренний радиусы. */
function starPath(cx: number, cy: number, r: number, rotDeg = -90): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = ((rotDeg + i * 36) * Math.PI) / 180
    const rr = i % 2 === 0 ? r : r * 0.382
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
}

/** Солнце: лучи-треугольники по кругу (сам круг рисуется отдельно). */
function raysPath(cx: number, cy: number, r: number, rays: number): string {
  const out: string[] = []
  for (let i = 0; i < rays; i++) {
    const a = (i * 2 * Math.PI) / rays
    const half = Math.PI / rays / 2.2
    const p = (ang: number, rad: number) =>
      `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`
    out.push(`M${p(a - half, r * 0.9)}L${p(a, r * 1.75)}L${p(a + half, r * 0.9)}Z`)
  }
  return out.join('')
}

/** Полосы: равные по умолчанию, с весами — если у цвета указан `:вес`. */
function bands(dir: 'h' | 'v', parts: string[], key: string): ReactNode[] {
  const items = parts.map((p) => {
    const [c, w] = p.split(':')
    return { fill: color(c), weight: w ? Number(w) : 1 }
  })
  const total = items.reduce((s, i) => s + i.weight, 0)
  let at = 0
  return items.map((it, i) => {
    const size = (60 * it.weight) / total
    // +0.5 к размеру — чтобы между полосами не просвечивала щель при сглаживании.
    const el =
      dir === 'h' ? (
        <rect key={`${key}${i}`} x="0" y={at} width="60" height={size + 0.5} fill={it.fill} />
      ) : (
        <rect key={`${key}${i}`} x={at} y="0" width={size + 0.5} height="60" fill={it.fill} />
      )
    at += size
    return el
  })
}

/** Разбирает рецепт флага в набор SVG-фигур. */
export function flagShapes(spec: string): ReactNode[] {
  const out: ReactNode[] = []
  spec.split(';').forEach((raw, li) => {
    const tk = raw.trim().split(/\s+/).filter(Boolean)
    if (tk.length === 0) return
    const [kind, ...a] = tk
    const k = `l${li}`
    const fill = color(a[0])
    switch (kind) {
      case 'h':
      case 'v':
        out.push(...bands(kind, a, k))
        break
      case 'bg':
        out.push(<rect key={k} x="0" y="0" width="60" height="60" fill={fill} />)
        break
      case 'r':
        out.push(<rect key={k} x={n(a[1])} y={n(a[2])} width={n(a[3])} height={n(a[4])} fill={fill} />)
        break
      case 'c':
        out.push(<circle key={k} cx={n(a[1])} cy={n(a[2])} r={n(a[3])} fill={fill} />)
        break
      case 'e':
        out.push(<ellipse key={k} cx={n(a[1])} cy={n(a[2])} rx={n(a[3])} ry={n(a[4])} fill={fill} />)
        break
      case 's':
        out.push(
          <path key={k} d={starPath(n(a[1]), n(a[2]), n(a[3]), a[4] ? n(a[4]) : -90)} fill={fill} />,
        )
        break
      case 'u': {
        const [, cx, cy, r, rays] = a
        out.push(<path key={`${k}r`} d={raysPath(n(cx), n(cy), n(r), rays ? n(rays) : 12)} fill={fill} />)
        out.push(<circle key={k} cx={n(cx)} cy={n(cy)} r={n(r)} fill={fill} />)
        break
      }
      case 'm': {
        // Полумесяц = круг цвета флага минус круг цвета фона, сдвинутый вправо.
        const [, bgTok, cx, cy, r] = a
        out.push(<circle key={`${k}a`} cx={n(cx)} cy={n(cy)} r={n(r)} fill={fill} />)
        out.push(
          <circle
            key={`${k}b`}
            cx={n(cx) + n(r) * 0.3}
            cy={n(cy)}
            r={n(r) * 0.82}
            fill={color(bgTok)}
          />,
        )
        break
      }
      case 'x': {
        const [, cx, cy, t] = a
        out.push(<rect key={`${k}a`} x={n(cx) - n(t) / 2} y="0" width={n(t)} height="60" fill={fill} />)
        out.push(<rect key={`${k}b`} x="0" y={n(cy) - n(t) / 2} width="60" height={n(t)} fill={fill} />)
        break
      }
      case 't':
        out.push(
          <polygon
            key={k}
            points={`${a[1]},${a[2]} ${a[3]},${a[4]} ${a[5]},${a[6]}`}
            fill={fill}
          />,
        )
        break
      case 'y':
        out.push(<polygon key={k} points={a.slice(1).join(' ')} fill={fill} />)
        break
      case 'l': {
        const [, x1, y1, x2, y2, w] = a
        out.push(
          <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={fill} strokeWidth={w} />,
        )
        break
      }
      case 'p':
        out.push(<path key={k} d={a.slice(1).join(' ').replace(/,/g, ' ')} fill={fill} />)
        break
      default:
        break
    }
  })
  return out
}

const SPECS: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.flag]))

/** Круглый флаг страны по ISO-коду (`GE`, `DE`, …). */
export const Flag = memo(function Flag({ code, size = 22 }: { code: string; size?: number }) {
  const spec = SPECS[code]
  return (
    <span className="flag" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 60 60" width={size} height={size} focusable="false">
        {spec ? flagShapes(spec) : <rect x="0" y="0" width="60" height="60" fill="#dcdcdc" />}
      </svg>
    </span>
  )
})
