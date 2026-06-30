# Сессия 2026-07-01 — Дизайн-система: токены, компоненты, финальный выбор стиля

## Решение сессии
Финально выбран **Институциональный стиль** (из трёх протестированных: Institutional / Swiss / Flat 2.0).
Обоснование: оптимален для B2B ежедневного использования, вызывает доверие у проектных институтов, застройщиков и госструктур Казахстана.

## Что было сделано

### Дополнительные дизайн-варианты (построены и удалены)
Перед финальным выбором построили ещё 2 варианта для сравнения:
- Swiss/Minimalist: Inter, чистый белый, H1 58px без фона, статусы текстом без фона
- Flat 2.0: Plus Jakarta Sans, индиго `#4F46E5`, плоские блоки секций, flat-пилюли
Все 4 новые страницы (2 лендинга + 2 ленты) закоммичены, затем удалены вместе с остальными демо.

### Дизайн-система (институциональный)

**`frontend/src/app/globals.css`**
- `--ds-*` namespace: палитра (navy/blue/bg/text/muted/border), статусы (Новая/Активна/Выбор/Завершена), верификация (ver/unver), семантические (success/error/warning)
- Типографика: `--ds-font-heading` (Lexend), `--ds-font-body` (Source Sans 3)
- 8px-сетка: `--ds-sp-1..20`; скругления `--ds-r-sm..pill`; z-index шкала; nav-height; max-width
- shadcn-переменные (`--primary`, `--background` и др.) обновлены под институциональные значения → Button работает правильно без изменений
- Тёмная тема: все `--ds-*` переопределены в `.dark {}`
- `:focus-visible` настроен глобально (WCAG AA, 2px ring)

**`frontend/src/app/[locale]/layout.tsx`**
- Lexend + Source Sans 3 загружаются один раз; CSS-переменные `--font-lexend`, `--font-source` доступны всему дереву
- Страницы больше не должны импортировать шрифты самостоятельно

**`frontend/src/components/ui/Badge.tsx`**
- `StatusBadge` — pill-бейдж статуса заявки через CSS-переменные
- `VerificationBadge` — verified (зелёный) / unverified (красный), `iconOnly` prop для таблиц
- Цвет не единственный индикатор (WCAG 1.4.1): текстовая метка присутствует всегда

**`frontend/src/components/ui/AppNav.tsx`**
- `variant: "public"|"app"`, `activeLink`, `user: { name, role }`, кастомные `links`
- Public: Войти + Зарегистрироваться; App: avatar с инициалами + роль
- `aria-current="page"` на активной ссылке; `aria-label` на nav

**`frontend/src/components/ui/AppFooter.tsx`**
- Полный: 4 колонки (О компании + 3 категории ссылок)
- `compact={true}`: только нижняя полоса с копирайтом

**`frontend/src/components/ui/Pagination.tsx`**
- Умное отображение: `[1] … [n-1] n [n+1] … [last]` (до 7 кнопок)
- ARIA: `aria-label`, `aria-current="page"`, disabled состояния

**`docs/design-system.md`**
- Полный справочник: палитра, типографика, отступы, компоненты, правила, план экранов

### Удалены демо-страницы
design-geo, design-authority, design-preview, design-institutional, design-swiss, design-flat

### Остались
- `/ru/landing` — публичная главная
- `/ru/institutional` — лента заявок (референс)

## Применено из ui-ux-pro-max
- WCAG AAA: focus-visible, color not only indicator, aria-labels, contrast 4.5:1
- No emoji icons: SVG throughout
- cursor-pointer + transition 150ms на всех интерактивных элементах
- Design system persisted: `design-system/eospatial/MASTER.md`

## Открытые вопросы (следующая сессия)
1. JWT: httpOnly cookie vs localStorage — решить до реализации API-клиента
2. Лендинг: /ru/landing → возможно перенести на /ru (корень locale)

## Коммиты сессии
- `b8e181e` — лендинг /ru/landing (из предыдущей сессии этого дня)
- `ae6ee1f` — дизайн-система (токены + компоненты + документация + удаление демо)
