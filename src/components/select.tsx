'use client'

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n/client'

export type SelectOption = { value: string; label: string; group?: string }

type Props = {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  /** Default: on when there are more than 8 options. */
  searchable?: boolean
  required?: boolean
  disabled?: boolean
  /** Panel stays open; a row in `selected` is checked and clicking it still calls onChange (caller toggles). */
  multiple?: boolean
  selected?: string[]
  /** Replaces the closed-trigger text, e.g. "2 cards selected". */
  triggerLabel?: string
  id?: string
}

type Pos = { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

const PANEL_MAX = 320

// Custom listbox. The panel is portaled to body with fixed positioning because .grid clips overflow.
export function Select({ value, onChange, options, placeholder = '', searchable, required, disabled, multiple, selected, triggerLabel, id }: Props) {
  const { t } = useI18n()
  const uid = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const typed = useRef({ buf: '', timer: 0 })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<Pos | null>(null)
  const [invalid, setInvalid] = useState(false)

  const hasSearch = searchable ?? options.length > 8
  const isSel = (v: string) => (multiple ? !!selected?.includes(v) : v === value)

  const { groups, flat } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => `${o.group ?? ''} ${o.label}`.toLowerCase().includes(q)) : options
    const byGroup = new Map<string, SelectOption[]>()
    for (const o of list) {
      const g = o.group ?? ''
      const bucket = byGroup.get(g)
      if (bucket) bucket.push(o)
      else byGroup.set(g, [o])
    }
    let i = 0
    const groups = [...byGroup].map(([name, opts]) => ({ name, rows: opts.map((o) => ({ o, i: i++ })) }))
    return { groups, flat: groups.flatMap((g) => g.rows.map((r) => r.o)) }
  }, [options, query])

  const optId = (i: number) => `${uid}-o${i}`

  const place = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vh = document.documentElement.clientHeight
    const vw = document.documentElement.clientWidth
    const below = vh - r.bottom - 8
    const above = r.top - 8
    const up = below < 220 && above > below
    const mobile = vw <= 640
    setPos({
      left: mobile ? 8 : r.left,
      width: mobile ? vw - 16 : r.width,
      maxHeight: Math.max(120, Math.min(PANEL_MAX, up ? above : below)),
      ...(up ? { bottom: vh - r.top - 1 } : { top: r.bottom - 1 }),
    })
  }

  const openPanel = () => {
    if (disabled) return
    const at = options.findIndex((o) => isSel(o.value))
    setQuery('')
    setActive(Math.max(0, at))
    setOpen(true)
  }

  const closePanel = (refocus: boolean) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  useLayoutEffect(() => {
    if (open) place()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const placed = pos !== null
  useEffect(() => {
    if (open && placed && hasSearch) searchRef.current?.focus()
  }, [open, placed, hasSearch])

  useEffect(() => {
    if (!open) return
    const onResize = () => place()
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) place()
    }
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node
      if (!panelRef.current?.contains(n) && !triggerRef.current?.contains(n)) setOpen(false)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('pointerdown', onDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasSearch])

  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, pos])

  useEffect(() => () => window.clearTimeout(typed.current.timer), [])

  const choose = (o: SelectOption | undefined) => {
    if (!o) return
    setInvalid(false)
    onChange(o.value)
    if (!multiple) closePanel(true)
  }

  const typeAhead = (ch: string) => {
    const s = typed.current
    window.clearTimeout(s.timer)
    s.buf += ch.toLowerCase()
    s.timer = window.setTimeout(() => (s.buf = ''), 600)
    const from = s.buf.length === 1 ? active + 1 : active
    const order = [...flat.slice(from), ...flat.slice(0, from)]
    const hit = order.find((o) => o.label.toLowerCase().startsWith(s.buf))
    if (hit) setActive(flat.indexOf(hit))
  }

  const onKey = (e: React.KeyboardEvent) => {
    const last = flat.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => Math.min(last, i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
        break
      case 'Home':
        if (!hasSearch) {
          e.preventDefault()
          setActive(0)
        }
        break
      case 'End':
        if (!hasSearch) {
          e.preventDefault()
          setActive(Math.max(0, last))
        }
        break
      case 'Enter':
        e.preventDefault()
        choose(flat[active])
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        closePanel(true)
        break
      case 'Tab':
        closePanel(true)
        break
      default:
        if (!hasSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (e.key === ' ' && !typed.current.buf) {
            e.preventDefault()
            choose(flat[active])
          } else {
            e.preventDefault()
            typeAhead(e.key)
          }
        }
    }
  }

  const current = options.find((o) => o.value === value)
  const text = triggerLabel ?? (current ? (current.group ? `${current.group} / ${current.label}` : current.label) : placeholder)
  const listId = `${uid}-list`
  const activeId = open && flat.length ? optId(active) : undefined

  return (
    <div className="select-wrap">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="select select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={hasSearch ? undefined : activeId}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? closePanel(false) : openPanel())}
        onKeyDown={(e) => {
          if (open) return onKey(e)
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            openPanel()
          }
        }}
        onKeyUp={(e) => {
          if (open && e.key === ' ') e.preventDefault()
        }}
      >
        {text}
      </button>
      {required && !multiple && (
        <input
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          onInvalid={(e) => {
            e.preventDefault()
            setInvalid(true)
            triggerRef.current?.focus()
          }}
        />
      )}
      {invalid && (
        <p className="notice bad" role="alert" style={{ marginTop: 6 }}>
          {t.select.required}
        </p>
      )}
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="select-panel"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          >
            {hasSearch && (
              <input
                ref={searchRef}
                className="select-search"
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-label={t.select.search}
                placeholder={t.select.search}
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onKey}
              />
            )}
            <div id={listId} role="listbox" aria-multiselectable={multiple || undefined} className="select-list">
              {flat.length === 0 && <div className="select-empty">{t.select.noResults}</div>}
              {groups.map((g) => (
                <div key={g.name} role={g.name ? 'group' : 'presentation'} aria-labelledby={g.name ? `${uid}-g-${g.rows[0].i}` : undefined}>
                  {g.name && (
                    <div id={`${uid}-g-${g.rows[0].i}`} className="select-group">
                      {g.name}
                    </div>
                  )}
                  {g.rows.map(({ o, i }) => (
                    <div
                      key={o.value}
                      id={optId(i)}
                      role="option"
                      className="select-opt"
                      aria-selected={isSel(o.value)}
                      data-active={i === active}
                      onMouseMove={() => i !== active && setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o)}
                    >
                      {multiple && (
                        <span className="select-box" aria-hidden>
                          {isSel(o.value) ? '✓' : ''}
                        </span>
                      )}
                      <span className="select-txt">{o.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
