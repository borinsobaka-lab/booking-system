import { expect, test, type Page } from '@playwright/test'

// Данные живут в localStorage (локальный режим). Регистрации нет: в локальном
// режиме заведён демо-суперадминистратор (demo / demo); сотрудников создаёт он
// внутри панели. Каждый тест стартует с чистого состояния.
test.beforeEach(async ({ page }) => {
  await page.goto('#/admin-panel')
  await page.evaluate(() => localStorage.clear())
  await page.goto('#/admin-panel')
})

async function loginAsOwner(page: Page) {
  await login(page, 'demo', 'demo')
}

async function login(page: Page, username: string, password: string) {
  await expect(page.getByRole('heading', { name: 'Вход в админку' })).toBeVisible()
  await page.getByLabel('Логин').fill(username)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Записи' })).toBeVisible()
}

/** Услуга, специалист и две будущие записи — на них смотрят разделы
 *  «Расписание» и «Записи». */
async function seedSpecialist(page: Page) {
  await page.evaluate(() => {
    const L = (s: string) => ({ en: s, ka: s, ru: s })
    const d = new Date(Date.now() + 3 * 86_400_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const booking = (id: string, start: string, end: string, clientName: string) => ({
      id, specialistId: 'p1', serviceId: 's1', date, start, end,
      status: 'confirmed', clientName, clientPhone: '+995 555', createdAt: 1,
    })
    const raw = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    raw.services = [{ id: 's1', name: L('Массаж'), description: L(''), durationMin: 60, price: 3000, image: null, createdAt: 1 }]
    raw.specialists = [
      { id: 'p1', firstName: L('Нино'), lastName: L('Ц.'), role: L('Массажист'), bio: L(''), avatar: null, serviceIds: ['s1'], createdAt: 1 },
    ]
    raw.bookings = [booking('b1', '10:00', '11:00', 'Клиент А'), booking('b2', '12:00', '13:00', 'Клиент Б')]
    localStorage.setItem('booking-db-v1', JSON.stringify(raw))
  })
  await page.reload()
}

/** Владелец заводит пользователя с выбранной ролью. */
async function createUser(page: Page, role: 'Администратор' | 'Сотрудник', login: string, password: string) {
  await page.getByRole('button', { name: /Пользователи/ }).click()
  await page.getByRole('button', { name: '+ Пользователь' }).click()
  await page.getByRole('button', { name: role, exact: true }).click()
  await page.getByLabel('Имя сотрудника').fill(login)
  await page.getByLabel('Логин').fill(login)
  // У поля пароля рядом кнопка «Сгенерировать» — она попадает в подпись метки.
  await page.getByLabel(/^Пароль/).fill(password)
  await page.getByRole('button', { name: 'Создать' }).click()
  await expect(page.getByRole('heading', { name: 'Пользователь создан' })).toBeVisible()
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.getByText(`@${login} · ${role}`)).toBeVisible()
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page.getByRole('heading', { name: 'Вход в админку' })).toBeVisible()
  await page.goto('#/admin-panel') // следующий вход — с начала панели, а не с раздела владельца
}

test('админка: только вход, никакой регистрации', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Вход в админку' })).toBeVisible()
  // Нет формы регистрации/создания администратора
  await expect(page.getByText(/Настройка администратора/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Создать и войти/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Зарегистрироваться/i })).toHaveCount(0)
})

test('вход суперадминистратора и доступ к разделам', async ({ page }) => {
  await loginAsOwner(page)
  await expect(page.getByRole('button', { name: /Пользователи/ })).toBeVisible()
})

test('заведение услуги и специалиста', async ({ page }) => {
  await loginAsOwner(page)

  await page.getByRole('button', { name: /Услуги/ }).click()
  await page.getByRole('button', { name: '+ Добавить услугу' }).click()
  await page.getByLabel('Название').fill('Классический массаж')
  await page.getByLabel('Длительность, мин').fill('60')
  await page.getByLabel('Стоимость, ₽').fill('3000')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Классический массаж')).toBeVisible()

  await page.getByRole('button', { name: /Специалисты/ }).click()
  await page.getByRole('button', { name: '+ Добавить специалиста' }).click()
  await page.getByLabel('Имя').fill('Нино')
  await page.getByLabel('Фамилия').fill('Ц.')
  await page.getByText('Классический массаж').click()
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Нино Ц.')).toBeVisible()
})

test('клиентская витрина: три пути записи и никаких ссылок в админку', async ({ page }) => {
  await page.evaluate(() => {
    const L = (s: string) => ({ en: s, ka: s, ru: s })
    const raw = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    raw.services = [{ id: 's1', name: L('Massage'), description: L(''), durationMin: 60, price: 3000, image: null, createdAt: 1 }]
    raw.specialists = [
      { id: 'p1', firstName: L('Nino'), lastName: L('T'), role: L('Therapist'), bio: L(''), avatar: null, serviceIds: ['s1'], createdAt: 1 },
    ]
    localStorage.setItem('booking-db-v1', JSON.stringify(raw))
  })
  await page.goto('#/')
  await page.reload()
  // По умолчанию интерфейс на английском — три навигационные кнопки
  await expect(page.getByText('Specialist', { exact: true })).toBeVisible()
  await expect(page.getByText('Pick a date', { exact: true })).toBeVisible()
  await expect(page.getByText('Pick a service', { exact: true })).toBeVisible()
  // Никаких ссылок на админку с витрины
  await expect(page.locator('a[href*="admin"]')).toHaveCount(0)
})


test('администратор правит расписание и записи, сотрудник — только смотрит', async ({ page }) => {
  await loginAsOwner(page)
  await seedSpecialist(page)
  await createUser(page, 'Администратор', 'admin1', 'admin1pass')
  await createUser(page, 'Сотрудник', 'staff1', 'staff1pass')
  await logout(page)

  // Администратор: расписание открывается на редактирование
  await login(page, 'admin1', 'admin1pass')
  await expect(page.getByText('Администратор', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Пользователи/ })).toHaveCount(0) // учётки — только владельцу
  await page.getByRole('button', { name: /Расписание/ }).click()
  await page.getByRole('button', { name: '＋ время' }).first().click()
  await expect(page.getByText('Что добавить')).toBeVisible()
  await page.getByRole('button', { name: 'Добавить' }).click()
  await expect(page.getByText('10:00–18:00').first()).toBeVisible()
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.locator('.tl-work')).toHaveCount(1) // рабочее окно появилось на таймлайне

  // Администратор: записи — заведение вручную, отметка «по абонементу» и отмена
  await page.getByRole('button', { name: /Записи/ }).click()
  await page.getByRole('button', { name: '+ Запись' }).click()
  await expect(page.getByRole('heading', { name: 'Новая запись' })).toBeVisible()
  await page.getByRole('button', { name: 'Отмена' }).click()
  await page.getByText('Клиент А').click()
  await page.getByRole('button', { name: 'Отметить по абонементу' }).click()
  await expect(page.getByRole('button', { name: 'Снять «по абонементу»' })).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Отменить запись' }).click()
  await page.getByRole('button', { name: 'Отмены' }).click()
  await expect(page.getByText('Клиент А')).toBeVisible()
  await logout(page)

  // Сотрудник: расписание — предупреждение «Только просмотр»
  await login(page, 'staff1', 'staff1pass')
  await page.getByRole('button', { name: /Расписание/ }).click()
  await page.getByRole('button', { name: '＋ время' }).first().click()
  await expect(page.getByRole('heading', { name: 'Только просмотр' })).toBeVisible()
  await expect(page.getByText('Что добавить')).toHaveCount(0)
  await page.getByRole('button', { name: 'Понятно' }).click()

  // Сотрудник: в записи можно только смотреть — кнопок действий нет
  await page.getByRole('button', { name: /Записи/ }).click()
  await page.getByText('Клиент Б').click()
  await expect(page.getByRole('heading', { name: 'Запись', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Отменить запись' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Отметить по абонементу' })).toHaveCount(0)
  // «Закрыть» есть и крестиком в шапке модалки, и кнопкой внизу — берём кнопку
  await page.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
  await page.getByRole('button', { name: '+ Запись' }).click()
  await expect(page.getByRole('heading', { name: 'Только просмотр' })).toBeVisible()
})
