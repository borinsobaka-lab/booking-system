import { expect, test, type Page } from '@playwright/test'

// Данные живут в localStorage — каждый тест стартует с чистого состояния.
test.beforeEach(async ({ page }) => {
  await page.goto('#/admin')
  await page.evaluate(() => localStorage.clear())
  await page.goto('#/admin')
})

async function setupOwner(page: Page) {
  await expect(page.getByRole('heading', { name: 'Настройка администратора' })).toBeVisible()
  await page.getByLabel('Ваше имя').fill('Гига')
  await page.getByLabel('Логин').fill('owner')
  await page.getByLabel('Пароль', { exact: true }).fill('secret1')
  await page.getByLabel('Повторите пароль').fill('secret1')
  await page.getByRole('button', { name: 'Создать и войти' }).click()
}

test('первичная настройка суперадминистратора и доступ к разделам', async ({ page }) => {
  await setupOwner(page)
  await expect(page.getByRole('heading', { name: 'Записи' })).toBeVisible()
  // Раздел «Пользователи» доступен только владельцу
  await expect(page.getByRole('button', { name: /Пользователи/ })).toBeVisible()
})

test('заведение услуги и специалиста', async ({ page }) => {
  await setupOwner(page)

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

test('клиентская витрина показывает три пути записи', async ({ page }) => {
  await setupOwner(page)
  // создаём минимальные данные через localStorage, чтобы витрина была настроена
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('booking-db-v1') || '{}')
    raw.services = [
      { id: 's1', name: 'Массаж', description: '', durationMin: 60, price: 3000, image: null, createdAt: 1 },
    ]
    raw.specialists = [
      { id: 'p1', firstName: 'Нино', lastName: 'Ц.', role: 'Массажист', avatar: null, serviceIds: ['s1'], createdAt: 1 },
    ]
    localStorage.setItem('booking-db-v1', JSON.stringify(raw))
  })
  await page.goto('#/')
  await expect(page.getByRole('heading', { name: 'Мастер' })).toHaveCount(0)
  await expect(page.getByText('Мастер', { exact: true })).toBeVisible()
  await expect(page.getByText('Выбрать дату', { exact: true })).toBeVisible()
  await expect(page.getByText('Выбрать услугу', { exact: true })).toBeVisible()
})
