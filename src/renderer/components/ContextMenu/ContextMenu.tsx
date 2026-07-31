import { useEffect, useRef, useState } from 'react'

// A lightweight right-click menu. Rendered fixed at (x, y); closes on outside
// click, Escape, or after a leaf item runs. Supports one-level submenus (items
// with a `submenu`) and separators. Used by the graph (commit actions) and the
// sidebar (branch actions).

export interface MenuItem {
  /** Omitted only for separators. */
  label?: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  /** Render a divider instead of a clickable row (other fields ignored). */
  separator?: boolean
  /** Nested items; hovering the row opens them to the right. */
  submenu?: MenuItem[]
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }): JSX.Element {
  const [openSub, setOpenSub] = useState<number | null>(null)
  return (
    <div className="min-w-[190px] rounded border border-edge bg-base-800 py-1 shadow-lg">
      {items.map((it, i) => {
        if (it.separator) return <div key={i} className="my-1 h-px bg-edge/70" />
        if (it.submenu) {
          return (
            <div
              key={i}
              className="relative"
              onMouseEnter={() => setOpenSub(i)}
              onMouseLeave={() => setOpenSub(null)}
            >
              <button className="flex w-full items-center justify-between px-3 py-1 text-[12px] text-txt hover:bg-base-600">
                <span>{it.label}</span>
                <span className="ml-3 text-txt-muted">▸</span>
              </button>
              {openSub === i && (
                <div className="absolute top-0 left-full z-10 -ml-1">
                  <MenuList items={it.submenu} onClose={onClose} />
                </div>
              )}
            </div>
          )
        }
        return (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => {
              onClose()
              it.onClick?.()
            }}
            className={`block w-full text-left px-3 py-1 text-[12px] hover:bg-base-600 disabled:opacity-40 disabled:cursor-not-allowed ${
              it.danger ? 'text-bad' : 'text-txt'
            }`}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

export default function ContextMenu({
  menu,
  onClose
}: {
  menu: MenuState
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div ref={ref} className="fixed z-50" style={{ top: menu.y, left: menu.x }}>
      <MenuList items={menu.items} onClose={onClose} />
    </div>
  )
}
