import { useState, type ReactNode } from 'react'
import { Modal } from '../ui'

/**
 * Хук для разделов «только просмотр»: возвращает функцию показа предупреждения
 * и саму модалку. Сотрудник видит данные, но менять может только администратор.
 */
export function useDeny(): [() => void, ReactNode] {
  const [open, setOpen] = useState(false)
  const node = open ? (
    <Modal title="Только просмотр" onClose={() => setOpen(false)}>
      <div className="form">
        <p className="muted">
          Изменять данные может только администратор. Ваша роль — сотрудник (просмотр). Обратитесь к
          администратору.
        </p>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={() => setOpen(false)}>
            Понятно
          </button>
        </div>
      </div>
    </Modal>
  ) : null
  return [() => setOpen(true), node]
}
