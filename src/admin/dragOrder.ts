// Перетаскивание карточек для смены порядка (услуги, специалисты).
// Порядок массива в БД — это и есть порядок показа клиентам на витрине.

import { useEffect, useRef, useState } from 'react'

/**
 * Локальный порядок для плавного перетаскивания. С БД синхронизируемся, пока
 * карточку не тащат (иначе перерисовка сбивала бы drag). Карточка ищется по
 * `selector` + атрибуту data-id. `canSwap` может запретить перестановку двух
 * карточек (например, активного мастера с деактивированным).
 */
export function useDragOrder<T extends { id: string }>(
  items: T[],
  selector: string,
  save: (ids: string[]) => void,
  canSwap: (dragged: T, over: T) => boolean = () => true,
) {
  const [order, setOrder] = useState<T[]>(items)
  const [dragId, setDragId] = useState<string | null>(null)
  const draggingRef = useRef(false)
  const orderRef = useRef(order)
  orderRef.current = order
  const itemsRef = useRef(items)
  itemsRef.current = items
  const canSwapRef = useRef(canSwap)
  canSwapRef.current = canSwap

  useEffect(() => {
    if (!draggingRef.current) setOrder(items)
  }, [items])

  // Слушаем pointermove/up на window: карточка при перестановке двигается в DOM,
  // и capture на самой ручке терялся бы — window же ловит события всегда.
  useEffect(() => {
    if (!dragId) return
    const move = (e: PointerEvent) => {
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(selector)
      const overId = el?.getAttribute('data-id')
      if (!overId || overId === dragId) return
      setOrder((prev) => {
        const from = prev.findIndex((x) => x.id === dragId)
        const to = prev.findIndex((x) => x.id === overId)
        if (from < 0 || to < 0 || from === to) return prev
        if (!canSwapRef.current(prev[from], prev[to])) return prev
        const next = [...prev]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
    }
    const up = () => {
      draggingRef.current = false
      const ids = orderRef.current.map((s) => s.id)
      if (ids.join() !== itemsRef.current.map((s) => s.id).join()) save(ids)
      setDragId(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  const startDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault()
    draggingRef.current = true
    setDragId(id)
  }

  return { order, dragId, startDrag }
}
