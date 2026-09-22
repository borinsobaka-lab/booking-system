import { expect, test, type Page } from '@playwright/test'
import { COUNTRIES } from '../src/countries'

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
  await page.getByRole('button', { name: '+ Услуга' }).click()
  await page.getByLabel('Название').fill('Классический массаж')
  await page.getByLabel('Длительность, мин').fill('60')
  await page.getByLabel('Стоимость, ₾').fill('3000')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Классический массаж')).toBeVisible()

  await page.getByRole('button', { name: /Специалисты/ }).click()
  await page.getByRole('button', { name: '+ Специалист' }).click()
  await page.getByLabel('Имя', { exact: true }).fill('Нино')
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

// --- Двое массажистов ---

/** Двое мастеров, общий кабинет (rooms=1), расписание на завтра и вчера,
 *  по одной прошедшей записи у каждого. */
async function seedTwoSpecialists(page: Page) {
  await page.evaluate(() => {
    const L = (s: string) => ({ en: s, ka: s, ru: s })
    const pad = (n: number) => String(n).padStart(2, '0')
    const key = (shift: number) => {
      const d = new Date(Date.now() + shift * 86_400_000)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    const tomorrow = key(1)
    const yesterday = key(-1)
    const raw = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    raw.settings = { ...(raw.settings || {}), minLeadMinutes: 0, rooms: 1 }
    raw.services = [{ id: 's1', name: L('Массаж'), description: L(''), durationMin: 60, price: 3000, image: null, createdAt: 1 }]
    raw.specialists = [
      { id: 'p1', firstName: L('Нино'), lastName: L('Ц.'), role: L('Массажист'), bio: L(''), avatar: null, serviceIds: ['s1'], createdAt: 1 },
      { id: 'p2', firstName: L('Мари'), lastName: L('Г.'), role: L('Массажист'), bio: L(''), avatar: null, serviceIds: ['s1'], createdAt: 2 },
    ]
    const day = (specialistId: string, date: string) => ({
      specialistId, date, windows: [{ start: '09:00', end: '18:00' }], breaks: [],
    })
    raw.schedules = [day('p1', tomorrow), day('p2', tomorrow), day('p1', yesterday), day('p2', yesterday)]
    const bk = (id: string, specialistId: string, date: string, start: string, end: string, clientName: string) => ({
      id, specialistId, serviceId: 's1', date, start, end, status: 'confirmed', clientName, clientPhone: '+995 555', createdAt: 1,
    })
    raw.bookings = [
      bk('b1', 'p1', tomorrow, '10:00', '11:00', 'Клиент Нино'),
      bk('b2', 'p1', yesterday, '10:00', '11:00', 'Прошлый Нино'),
      bk('b3', 'p2', yesterday, '12:00', '13:00', 'Прошлый Мари'),
    ]
    localStorage.setItem('booking-db-v1', JSON.stringify(raw))
  })
  await page.reload()
}

function dateKey(shift: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = new Date(Date.now() + shift * 86_400_000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

test('общий кабинет: занятое время второму мастеру недоступно', async ({ page }) => {
  await loginAsOwner(page)
  await seedTwoSpecialists(page)

  await page.getByRole('button', { name: '+ Запись' }).click()
  await page.getByLabel('Дата').fill(dateKey(1))
  await page.getByLabel('Специалист').selectOption({ label: 'Мари Г.' })
  await page.getByLabel('Услуга').selectOption({ index: 1 })
  // 10:00 занято у Нино — кабинет один, значит и Мари в это время занять нельзя
  await expect(page.getByRole('button', { name: '11:00', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '10:00', exact: true })).toHaveCount(0)
  // а у самой Мари 09:00 свободно — сеанс заканчивается ровно к началу чужого
  await expect(page.getByRole('button', { name: '09:00', exact: true })).toBeVisible()
})

test('расписание: рабочие дни и время задаются на неделю сразу', async ({ page }) => {
  await loginAsOwner(page)
  await seedTwoSpecialists(page)

  // предупреждение «в выходной день есть записи» подтверждаем
  page.on('dialog', (d) => d.accept())

  await page.getByRole('button', { name: /Расписание/ }).click()
  await page.getByRole('button', { name: 'Рабочие дни и время на неделю' }).click()
  await expect(page.getByText('Рабочие дни', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Пн/ }).click()
  await page.getByRole('button', { name: /^Вт/ }).click()
  const picked = await page.locator('.weekday-pill.active').count()
  await page.getByRole('button', { name: 'Применить к неделе' }).click()
  // на таймлайне ровно столько рабочих дней, сколько отмечено
  await expect(page.locator('.tl-work')).toHaveCount(picked)
})

test('массажист видит только свои записи и свою зарплату', async ({ page }) => {
  await loginAsOwner(page)
  await seedTwoSpecialists(page)
  await createUser(page, 'Сотрудник', 'mari', 'maripass')
  // привязываем учётку к карточке специалиста
  await page.getByRole('button', { name: 'Профиль мастера' }).last().click()
  await page.getByLabel('Карточка специалиста').selectOption({ index: 2 }) // Мари Г.
  await page.getByRole('button', { name: 'Сохранить' }).click()

  // владелец видит обоих мастеров и обе суммы
  await page.getByRole('button', { name: /Записи/ }).click()
  await page.getByRole('button', { name: 'Прошедшие' }).click()
  await expect(page.getByText('Прошлый Нино')).toBeVisible()
  await expect(page.getByText('Прошлый Мари')).toBeVisible()
  await expect(page.getByText('80 ₾').first()).toBeVisible() // два сеанса по 40 ₾
  await logout(page)

  // мастер — только свои записи и своя сумма
  await login(page, 'mari', 'maripass')
  await page.getByRole('button', { name: 'Прошедшие' }).click()
  await expect(page.getByText('Прошлый Мари')).toBeVisible()
  await expect(page.getByText('Прошлый Нино')).toHaveCount(0)
  await expect(page.getByText('40 ₾').first()).toBeVisible()
  await expect(page.getByText('осталось получить за проведённые сеансы')).toBeVisible()
  // фильтра по мастерам у него нет — он видит только себя
  await expect(page.getByRole('button', { name: 'Все мастера' })).toHaveCount(0)
})

test('записи: аватар мастера на карточке и фильтр по мастерам на всех вкладках', async ({ page }) => {
  await loginAsOwner(page)
  await seedTwoSpecialists(page)

  // На карточке записи виден мастер — аватар с именем
  await expect(page.locator('.card-spec').first()).toBeVisible()
  await expect(page.locator('.card-spec-name', { hasText: 'Нино' }).first()).toBeVisible()

  // Прошедшие: фильтр на месте, по умолчанию видны оба мастера
  await page.getByRole('button', { name: 'Прошедшие' }).click()
  await expect(page.getByRole('button', { name: 'Все мастера' })).toBeVisible()
  await expect(page.getByText('Прошлый Нино')).toBeVisible()
  await expect(page.getByText('Прошлый Мари')).toBeVisible()

  // Переключаемся на Мари — остаются только её сеансы и её сумма
  await page.getByRole('button', { name: /Мари Г\./ }).click()
  await expect(page.getByText('Прошлый Мари')).toBeVisible()
  await expect(page.getByText('Прошлый Нино')).toHaveCount(0)
  await expect(page.getByText('Прошло 1 сеанс.')).toBeVisible()

  // Фильтр сохраняется при переходе на «Текущие»
  await page.getByRole('button', { name: 'Текущие' }).click()
  await expect(page.getByText('Клиент Нино')).toHaveCount(0)
})

test('записи: видно, сколько клиент платит за услугу', async ({ page }) => {
  await loginAsOwner(page)
  await seedTwoSpecialists(page)

  // Текущие: стоимость услуги на карточке + сумма за день в шапке
  await expect(page.locator('.card-pay').first()).toContainText('клиент')
  await expect(page.locator('.card-price').first()).toHaveText('3 000 ₾')
  await expect(page.locator('.feed-day-cash')).toContainText('3 000 ₾')

  // Прошедшие: рядом со стоимостью клиента — подписанная выплата мастеру
  await page.getByRole('button', { name: 'Прошедшие' }).click()
  await expect(page.locator('.card-price').first()).toHaveText('3 000 ₾')
  await expect(page.locator('.pay-label').first()).toHaveText('мастеру')

  // По абонементу клиент на месте не платит — суммы нет
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    for (const b of raw.bookings) b.membership = true
    localStorage.setItem('booking-db-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.getByRole('button', { name: 'Прошедшие' }).click()
  await expect(page.locator('.card-price').first()).toHaveText('не платит')
})

/** Клиент доходит до последнего шага записи: мастер → ближайшее время → услуга. */
async function openBookingForm(page: Page) {
  await page.evaluate(() => {
    const L = (s: string) => ({ en: s, ka: s, ru: s })
    const pad = (n: number) => String(n).padStart(2, '0')
    const key = (shift: number) => {
      const d = new Date(Date.now() + shift * 86_400_000)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    const raw = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    raw.settings = { ...(raw.settings || {}), minLeadMinutes: 0, rooms: 1 }
    raw.services = [{ id: 's1', name: L('Massage'), description: L(''), durationMin: 60, price: 100, image: null, createdAt: 1 }]
    raw.specialists = [
      { id: 'p1', firstName: L('Nino'), lastName: L('T.'), role: L('Therapist'), bio: L(''), avatar: null, serviceIds: ['s1'], createdAt: 1 },
    ]
    raw.schedules = [1, 2, 3].map((shift) => ({
      specialistId: 'p1', date: key(shift), windows: [{ start: '09:00', end: '18:00' }], breaks: [],
    }))
    raw.bookings = []
    localStorage.setItem('booking-db-v1', JSON.stringify(raw))
  })
  await page.goto('#/')
  await page.reload()
  await page.getByText('Specialist', { exact: true }).click()
  await page.locator('.spec-slot').first().click()
  await page.locator('.svc-full').first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Confirmation' })).toBeVisible()
}

test('запись: телефон по маске, код страны — из списка с флагами', async ({ page }) => {
  await openBookingForm(page)

  // По умолчанию Грузия: круглый флаг рядом с кодом +995
  const country = page.locator('.phone-country')
  await expect(country).toContainText('+995')
  await expect(country.locator('.flag svg')).toBeVisible()

  // Номер набирается по маске, буквы и лишние знаки в неё не попадают
  const number = page.locator('.phone-number')
  await expect(number).toHaveAttribute('placeholder', '000 00 00 00')
  await number.fill('555abc12-34)56')
  await expect(number).toHaveValue('555 12 34 56')

  // Список стран: Грузия первая, дальше по алфавиту, у каждой страны свой флаг
  await country.click()
  const options = page.locator('.phone-opt')
  await expect(options.first()).toContainText('Georgia')
  await expect(options.nth(1)).toContainText('Afghanistan')
  await expect(options).toHaveCount(COUNTRIES.length)
  await expect(page.locator('.phone-opt .flag svg')).toHaveCount(COUNTRIES.length)

  // Поиск и выбор другой страны: код и маска меняются, набранные цифры остаются
  await page.getByPlaceholder('Search country').fill('Germ')
  await expect(options).toHaveCount(1)
  await options.first().click()
  await expect(country).toContainText('+49')
  await expect(number).toHaveValue('555 123 456')

  // Возвращаемся к Грузии и дозаполняем форму
  await country.click()
  await page.getByPlaceholder('Search country').fill('Georgia')
  await page.locator('.phone-opt').first().click()
  await expect(country).toContainText('+995')
  await expect(number).toHaveValue('555 12 34 56')

  await page.getByPlaceholder('Enter name').fill('Ana')
  await page.getByPlaceholder('Enter email').fill('ana@example.com')
  await page.locator('.consent input').check()
  await page.getByRole('button', { name: 'Book now' }).click()

  // В запись уходит номер целиком, в международном виде
  await expect(page.getByRole('heading', { name: "You're booked!" })).toBeVisible()
  const saved = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    return db.bookings[db.bookings.length - 1].clientPhone
  })
  expect(saved).toBe('+995 555 12 34 56')
})

test('запись: без полного номера бронировать нельзя', async ({ page }) => {
  await openBookingForm(page)

  await page.getByPlaceholder('Enter name').fill('Ana')
  await page.getByPlaceholder('Enter email').fill('ana@example.com')
  await page.locator('.consent input').check()
  const book = page.getByRole('button', { name: 'Book now' })
  await expect(book).toBeDisabled()

  // маска заполнена наполовину — всё ещё нельзя
  await page.locator('.phone-number').fill('555 12')
  await expect(book).toBeDisabled()

  await page.locator('.phone-number').fill('555123456')
  await expect(book).toBeEnabled()
})

// --- Абонементы ---

/** Мастер, услуга и одна будущая запись клиента с нормальным телефоном. */
async function seedForMembership(page: Page) {
  await page.evaluate(() => {
    const L = (s: string) => ({ en: s, ka: s, ru: s })
    const pad = (n: number) => String(n).padStart(2, '0')
    const d = new Date(Date.now() + 3 * 86_400_000)
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const raw = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    raw.services = [{ id: 's1', name: L('Массаж'), description: L(''), durationMin: 60, price: 3000, image: null, createdAt: 1 }]
    raw.specialists = [
      { id: 'p1', firstName: L('Нино'), lastName: L('Ц.'), role: L('Массажист'), bio: L(''), avatar: null, serviceIds: ['s1'], createdAt: 1 },
    ]
    raw.bookings = [
      {
        id: 'b1', specialistId: 'p1', serviceId: 's1', date, start: '10:00', end: '11:00',
        status: 'confirmed', clientName: 'Ана', clientPhone: '+995 555 12 34 56', createdAt: 1,
      },
    ]
    raw.memberships = []
    localStorage.setItem('booking-db-v1', JSON.stringify(raw))
  })
  await page.reload()
}

test('абонемент: заводится по телефону, списывает визит и возвращает при отмене', async ({ page }) => {
  await loginAsOwner(page)
  await seedForMembership(page)

  await page.getByRole('button', { name: /Абонементы/ }).click()
  await expect(page.getByRole('heading', { name: 'Абонементы' })).toBeVisible()

  await page.getByRole('button', { name: '+ Абонемент' }).click()
  await expect(page.getByRole('heading', { name: 'Новый абонемент' })).toBeVisible()
  // Телефон вводится той же маской, что и на витрине: код страны + номер
  await page.locator('.phone-number').fill('555123456')
  // Имя клиента подставилось из его записи
  await expect(page.getByLabel('Имя клиента (необязательно)')).toHaveValue('Ана')
  await expect(page.getByText(/Сейчас у него 1 записей/)).toBeVisible()
  await page.getByLabel('Количество посещений *').fill('2')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  // Будущая запись клиента сразу пошла по абонементу: остался один визит
  const card = page.locator('.ms-row')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('1 из 2')
  await expect(card).toContainText('Списано 1')

  // В «Записях» у этой записи появилась метка
  await page.getByRole('button', { name: /Записи/ }).click()
  await expect(page.getByText('по абонементу').first()).toBeVisible()

  // Отмена записи возвращает визит на абонемент
  await page.getByText('Ана').first().click()
  await expect(page.getByText('осталось 1 из 2')).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Отменить запись' }).click()

  await page.getByRole('button', { name: /Абонементы/ }).click()
  await expect(page.locator('.ms-row')).toContainText('2 из 2')
  await expect(page.locator('.ms-row')).toContainText('Списано 0')
})

test('абонемент: новая запись клиента списывает визит, лишние записи — обычные', async ({ page }) => {
  await loginAsOwner(page)
  await seedForMembership(page)

  // Абонемент на один визит: первая запись по нему, вторая — за деньги
  await page.getByRole('button', { name: /Абонементы/ }).click()
  await page.getByRole('button', { name: '+ Абонемент' }).click()
  await page.locator('.phone-number').fill('599000000')
  await page.getByLabel('Имя клиента (необязательно)').fill('Гость')
  await page.getByLabel('Количество посещений *').fill('1')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.locator('.ms-row')).toContainText('1 из 1')

  // Клиент записывается сам на витрине
  await page.evaluate(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const d = new Date(Date.now() + 3 * 86_400_000)
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const raw = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    const make = (id: string, start: string, end: string) => ({
      id, specialistId: 'p1', serviceId: 's1', date, start, end,
      status: 'confirmed', clientName: 'Гость', clientPhone: '+995 599 00 00 00', createdAt: Date.now(),
    })
    raw.bookings.push(make('b2', '12:00', '13:00'), make('b3', '14:00', '15:00'))
    localStorage.setItem('booking-db-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.getByRole('button', { name: /Абонементы/ }).click()
  await expect(page.locator('.ms-row')).toContainText('0 из 1')

  // Помечена ровно одна запись — визит в абонементе был один
  await page.getByRole('button', { name: /Записи/ }).click()
  await expect(page.getByText('по абонементу')).toHaveCount(1)
})

test('абонементы: сотрудник видит раздел, но не может его менять', async ({ page }) => {
  await loginAsOwner(page)
  await seedForMembership(page)
  await createUser(page, 'Сотрудник', 'staff2', 'staff2pass')
  await logout(page)

  await login(page, 'staff2', 'staff2pass')
  await page.getByRole('button', { name: /Абонементы/ }).click()
  await expect(page.getByRole('heading', { name: 'Абонементы' })).toBeVisible()
  await page.getByRole('button', { name: '+ Абонемент' }).click()
  await expect(page.getByRole('heading', { name: 'Только просмотр' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Новый абонемент' })).toHaveCount(0)
})

test('визиты клиента считаются и по телефону, и по почте', async ({ page }) => {
  await loginAsOwner(page)
  await page.evaluate(() => {
    const L = (s: string) => ({ en: s, ka: s, ru: s })
    const pad = (n: number) => String(n).padStart(2, '0')
    const key = (shift: number) => {
      const d = new Date(Date.now() + shift * 86_400_000)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    const raw = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    raw.services = [{ id: 's1', name: L('Массаж'), description: L(''), durationMin: 60, price: 3000, image: null, createdAt: 1 }]
    raw.specialists = [
      { id: 'p1', firstName: L('Нино'), lastName: L('Ц.'), role: L('Массажист'), bio: L(''), avatar: null, serviceIds: ['s1'], createdAt: 1 },
    ]
    const bk = (id: string, shift: number, name: string, phone: string, email: string) => ({
      id, specialistId: 'p1', serviceId: 's1', date: key(shift), start: '10:00', end: '11:00',
      status: 'confirmed', clientName: name, clientPhone: phone, clientEmail: email, createdAt: 1,
    })
    raw.bookings = [
      bk('b1', 1, 'Ана раз', '+995 555 12 34 56', 'ana@example.com'),
      // другой телефон, но та же почта — тот же человек
      bk('b2', 2, 'Ана два', '+995 599 11 11 11', 'ana@example.com'),
      // тот же телефон, что в первой записи, но другая почта — снова он же
      bk('b3', 3, 'Ана три', '+995 555 12 34 56', 'another@example.com'),
      bk('b4', 4, 'Гость', '+995 577 00 00 00', 'guest@example.com'),
    ]
    raw.memberships = []
    localStorage.setItem('booking-db-v1', JSON.stringify(raw))
  })
  await page.reload()

  const card = (name: string) => page.locator('.feed-card').filter({ hasText: name })
  await expect(card('Ана раз')).toContainText('1-й визит')
  await expect(card('Ана раз')).toContainText('новый клиент')
  // Почта повторилась — визит уже не первый, значка «новый клиент» нет
  await expect(card('Ана два')).toContainText('2-й визит')
  await expect(card('Ана два')).not.toContainText('новый клиент')
  // Телефон повторился — третий визит того же человека
  await expect(card('Ана три')).toContainText('3-й визит')
  await expect(card('Гость')).toContainText('новый клиент')

  // В «Клиентах» тот же человек — одной строкой, а не тремя
  await page.getByRole('button', { name: /Клиенты/ }).click()
  await expect(page.locator('.client-row')).toHaveCount(2)
})

test('деактивированный мастер: внизу списка, приглушён, записаться нельзя', async ({ page }) => {
  await page.evaluate(() => {
    const L = (s: string) => ({ en: s, ka: s, ru: s })
    const pad = (n: number) => String(n).padStart(2, '0')
    const key = (shift: number) => {
      const d = new Date(Date.now() + shift * 86_400_000)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    const raw = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    raw.settings = { ...(raw.settings || {}), minLeadMinutes: 0, rooms: 2 }
    raw.services = [{ id: 's1', name: L('Massage'), description: L(''), durationMin: 60, price: 100, image: null, createdAt: 1 }]
    raw.specialists = ['Ana', 'Nino'].map((name, i) => ({
      id: `p${i + 1}`, firstName: L(name), lastName: L('T.'), role: L('Therapist'), bio: L(''), avatar: null, serviceIds: ['s1'], createdAt: 1,
    }))
    raw.schedules = ['p1', 'p2'].flatMap((specialistId) =>
      [1, 2, 3].map((shift) => ({ specialistId, date: key(shift), windows: [{ start: '09:00', end: '18:00' }], breaks: [] })),
    )
    raw.bookings = []
    localStorage.setItem('booking-db-v1', JSON.stringify(raw))
  })
  await page.reload()

  // Владелец деактивирует первого мастера — в админке он уходит вниз.
  await loginAsOwner(page)
  await page.getByRole('button', { name: /Специалисты/ }).click()
  page.once('dialog', (d) => d.accept())
  await page.locator('.spec-card', { hasText: 'Ana' }).getByRole('button', { name: 'Деактивировать' }).click()
  await expect(page.locator('.spec-card').last()).toContainText('Ana')
  await expect(page.locator('.spec-card.inactive')).toContainText('Не работает')
  await expect(page.locator('.spec-card.inactive .avatar-dim')).toHaveCount(1)

  // На витрине: активный первым, деактивированный — последним, полупрозрачный,
  // без выбора и ближайших слотов, но с кнопкой «i».
  await page.goto('#/')
  await page.getByText('Specialist', { exact: true }).click()
  const rows = page.locator('.spec-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Nino')
  const off = rows.last()
  await expect(off).toContainText('Ana')
  await expect(off).toHaveClass(/inactive/)
  await expect(off).toContainText('not taking bookings')
  await expect(off.locator('.avatar-dim')).toHaveCount(1)
  await expect(off.locator('.spec-check')).toHaveCount(0)
  await expect(off.locator('.spec-slot')).toHaveCount(0)
  await expect(off.locator('.spec-row-main')).toBeDisabled()
  await off.locator('.spec-info-btn').click()
  await expect(page.locator('.spec-bio-name')).toHaveText('Ana T.')
  await expect(page.getByRole('button', { name: 'Choose this specialist' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Close bio' }).click()

  // Вернули в работу — снова можно выбрать.
  await page.goto('#/admin-panel')
  await page.getByRole('button', { name: /Специалисты/ }).click()
  await page.locator('.spec-card', { hasText: 'Ana' }).getByRole('button', { name: 'Активировать' }).click()
  await expect(page.locator('.spec-card.inactive')).toHaveCount(0)
})
