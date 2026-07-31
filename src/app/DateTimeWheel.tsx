'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'

/**
 * iOS-style выбор даты/времени: три скролл-колонки (дата · часы · минуты)
 * со snap-скроллом. value/onChange — строка формата input[datetime-local]
 * ("YYYY-MM-DDTHH:MM").
 */

const ITEM_H = 36
const VISIBLE = 5 // нечётное — центр подсвечен
const PAD = ((VISIBLE - 1) / 2) * ITEM_H

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const labelOf = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`

interface Item {
  label: string
}

function WheelColumn({
  items,
  index,
  onIndex,
  width
}: {
  items: Item[]
  index: number
  onIndex: (i: number) => void
  width: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const first = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = index * ITEM_H
    if (Math.abs(el.scrollTop - target) > 2) {
      el.scrollTo({ top: target, behavior: first.current ? 'auto' : 'smooth' })
    }
    first.current = false
  }, [index])

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)))
      if (i !== index) onIndex(i)
    }, 110)
  }, [items.length, index, onIndex])

  return (
    <div className="wheel-scroll" ref={ref} onScroll={onScroll} style={{ width }}>
      <div style={{ height: PAD }} />
      {items.map((it, i) => (
        <div key={i} className={'wheel-item' + (i === index ? ' active' : '')}>
          {it.label}
        </div>
      ))}
      <div style={{ height: PAD }} />
    </div>
  )
}

function parseValue(value: string): { key: string; hour: number; minute: number } {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (m) return { key: m[1], hour: Number(m[2]), minute: Number(m[3]) }
  const now = new Date()
  return { key: keyOf(now), hour: now.getHours(), minute: now.getMinutes() }
}

export function DateTimeWheel({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}) {
  const dates = useMemo(() => {
    const arr: { key: string; label: string }[] = []
    const base = new Date()
    base.setHours(0, 0, 0, 0)
    for (let d = -60; d <= 2; d++) {
      const dt = new Date(base)
      dt.setDate(base.getDate() + d)
      arr.push({ key: keyOf(dt), label: labelOf(dt) })
    }
    return arr
  }, [])
  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => ({ label: pad(h) })), [])
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, m) => ({ label: pad(m) })), [])

  const { key, hour, minute } = parseValue(value)
  const dateIndex = Math.max(0, dates.findIndex((d) => d.key === key))

  const emit = useCallback(
    (k: string, h: number, m: number) => onChange(`${k}T${pad(h)}:${pad(m)}`),
    [onChange]
  )

  // Если пришли с пустым значением — зафиксируем текущий момент в родителе.
  useEffect(() => {
    if (!value) emit(key, hour, minute)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="wheel-panel">
      <div className="wheel-band" />
      <div className="wheel">
        <WheelColumn
          items={dates}
          index={dateIndex}
          width={132}
          onIndex={(i) => emit(dates[i].key, hour, minute)}
        />
        <div className="wheel-sep">:</div>
        <WheelColumn items={hours} index={hour} width={46} onIndex={(i) => emit(key, i, minute)} />
        <div className="wheel-sep">:</div>
        <WheelColumn items={minutes} index={minute} width={46} onIndex={(i) => emit(key, hour, i)} />
      </div>
    </div>
  )
}
