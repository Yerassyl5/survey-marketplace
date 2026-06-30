# Сессия 2026-06-30 — Фронтенд: три варианта дизайна

## Что было сделано

### Стек фронтенда (настроен ранее, зафиксирован в этой сессии)
- Tailwind CSS v4 (CSS-first конфиг, `@import "tailwindcss"`, `@theme inline`)
- shadcn/ui: ручная инициализация, `components.json`, `cn()`, Button компонент с CVA
- framer-motion v12: AnimatePresence + motion.div для переходов
- **Критический фикс Next.js 16:** `middleware.ts` → `proxy.ts` (breaking change v16.0.0)
- **Windows + Docker inotify:** новые файлы не подхватываются без `docker compose restart frontend` — это правило сессии: **всегда перезапускать контейнер при создании новых страниц**

### Дизайн-исследование (ui-ux-pro-max + 21st.dev)
Запущен скилл для двух запросов:
1. B2B marketplace institutional corporate trust → **Trust & Authority** palette: `#0F172A / #0369A1 / #F8FAFC`, Lexend + Source Sans 3
2. Geo survey field professional → Teal geo palette: `#0F766E / #14B8A6 / #F0FDFA`, Plus Jakarta Sans
3. Premium dark enterprise authority → Dark + gold: `#1C1917 / #CA8A04`, Lexend + Source Sans 3

### Три созданных страницы (временные, для выбора)

| Маршрут | Стиль | Структура |
|---|---|---|
| `/ru/design-institutional` | Корпоративный | HTML-таблица на всю ширину, фильтры-select, пагинация, футер |
| `/ru/design-geo` | Геопрофессионал | Карточки 3-col с SVG-топографией (3 варианта), pill-фильтры, glassmorphism nav |
| `/ru/design-authority` | Авторитет | Split-layout: тёмный сайдбар 280px + горизонтальные карточки, золото #CA8A04 для верифицированных |

### Технические решения
- Каждый вариант: `page.tsx` (Server Component, загружает шрифты) + `Screen.tsx` (Client Component, интерактивность)
- `/design-institutional/page.tsx` переиспользует `../institutional/Screen.tsx` без дублирования кода
- SVG-карты в geo: 3 варианта по типу работ (контуры геодезии, слои геологии, волны геофизики, точечная сетка экологии)
- Authority: toggle "Только верифицированные", hover на карточке меняет кнопку Откликнуться с outline на filled gold

## Что ждёт следующей сессии

1. **Выбор направления дизайна** — пользователь смотрит три страницы живьём и выбирает одно
2. После выбора: дизайн-система (токены, типографическая шкала, CSS-переменные)
3. Первые рабочие экраны: страница входа, регистрации, создания заявки
4. Подключение к API (JWT auth, лента заявок с реальными данными)

## Коммиты сессии
- `8748590` — Tailwind v4 + shadcn/ui + proxy.ts (предыдущая сессия, зафиксирован тут)
- `9555fbd` — три варианта дизайна ленты заявок (9 файлов, 1994 строки)

## Правила, выработанные в сессии
- При создании новых роутов в Next.js на Windows/Docker: **`docker compose restart frontend`** (не `touch`)
- Каждое направление дизайна = отдельная страница (не вкладки), чтобы сравнивать живьём
