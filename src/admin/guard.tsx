import { useState, type ReactNode } from 'react'
import { Modal } from '../ui'
import { useAuth } from '../auth'

/**
 * Хук для разделов «только просмотр»: возвращает функцию показа предупреждения
 * и саму модалку. Сотрудник видит данные, но менять их может суперадминистратор;
 * администратор вдобавок правит расписание.
 */
export function useDeny(): [() => void, ReactNode] {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const isAdmin = user?.role === 'admin'
  const node = open ? (
    <Modal title="Только просмотр" onClose={() => setOpen(false)}>
      <div className="form">
        <p className="muted">
          {isAdmin
            ? 'Ваша роль — администратор: вы редактируете расписание, остальные разделы доступны только для просмотра. Изменить их может суперадминистратор.'
            : 'Изменять данные может только администратор. Ваша роль — сотрудник (просмотр). Обратитесь к администратору.'}
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
