// Простой rich-text редактор без зависимостей (contentEditable + execCommand):
// жирный, маркированный и нумерованный списки, переносы строк. Хранит HTML.

import { useRef } from 'react'

/** Базовая очистка HTML перед показом (контент пишет доверенный владелец,
 *  но убираем скрипты/обработчики на всякий случай). */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

/** Показ отформатированного текста. */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  return <div className={`rte-view${className ? ' ' + className : ''}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
}

/**
 * Неуправляемый редактор: инициализируется значением при монтировании.
 * Чтобы сменить язык, передавайте key={lang} снаружи — компонент перемонтируется.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  const exec = (cmd: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false)
    onChange(ref.current?.innerHTML ?? '')
  }

  const btn = (cmd: string, label: string, title: string) => (
    <button
      type="button"
      className="rte-btn"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault()
        exec(cmd)
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="rte">
      <div className="rte-toolbar">
        {btn('bold', 'B', 'Жирный')}
        {btn('italic', 'I', 'Курсив')}
        {btn('insertUnorderedList', '• —', 'Маркированный список')}
        {btn('insertOrderedList', '1.', 'Нумерованный список')}
      </div>
      <div
        ref={ref}
        className="rte-area"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: value || '' }}
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
      />
    </div>
  )
}
