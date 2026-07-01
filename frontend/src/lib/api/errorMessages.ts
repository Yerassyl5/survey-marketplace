/* ────────────────────────────────────────────────────────────────────────
   errorMessages.ts — перевод сообщений backend на русский для UI.

   Наши собственные валидаторы (backend/apps/accounts/serializers.py) уже
   пишут текст ошибок по-русски прямо в коде — их не трогаем, распознаём
   по наличию кириллицы и пропускаем как есть.

   Здесь переводятся только сообщения ФРЕЙМВОРКА (Django/DRF/SimpleJWT),
   которые приходят на английском по умолчанию. Полноценная локализация
   через Django i18n (kk/ru/en) — отдельная задача 1.8 в docs/progress.md;
   этот словарь — точечный мост до неё, не подмена.
   ──────────────────────────────────────────────────────────────────────── */

const EXACT: Record<string, string> = {
  "No active account found with the given credentials": "Неверный email или пароль.",
  "This field is required.": "Это поле обязательно для заполнения.",
  "This field may not be blank.": "Это поле не должно быть пустым.",
  "Enter a valid email address.": "Введите корректный email.",
  "Authentication credentials were not provided.": "Учетные данные не были предоставлены.",
};

type PatternRule = [RegExp, (match: RegExpMatchArray, fieldKey?: string) => string];

const PATTERNS: PatternRule[] = [
  [/^CSRF Failed/i, () => "Не удалось выполнить запрос. Обновите страницу и попробуйте снова."],
  [
    // Django локализует часть этого сообщения ("уже существует"), но не
    // переводит verbose_name модели — в проде реально приходит смесь вида
    // "user с таким email уже существует." Ловим по обоим вариантам.
    /(already exists\.?$)|(уже существует\.?$)/i,
    (_match, fieldKey) =>
      fieldKey === "email"
        ? "Пользователь с таким email уже зарегистрирован."
        : "Такое значение уже используется — выберите другое.",
  ],
  [/^Ensure this field has at least (\d+) characters?\.?/i, (m) => `Поле должно содержать не менее ${m[1]} символов.`],
  [/^Ensure this field has no more than (\d+) characters?\.?/i, (m) => `Поле должно содержать не более ${m[1]} символов.`],
];

const HAS_CYRILLIC = /[а-яёА-ЯЁ]/;
const IS_ASCII_ONLY = /^[\x00-\x7F]*$/;

/** Общая заглушка — только для действительно неопознанных технических сообщений. */
const FALLBACK = "Не удалось выполнить запрос. Попробуйте позже.";

export function translateMessage(raw: string, fieldKey?: string): string {
  if (EXACT[raw]) return EXACT[raw];

  for (const [pattern, toRu] of PATTERNS) {
    const match = raw.match(pattern);
    if (match) return toRu(match, fieldKey);
  }

  if (HAS_CYRILLIC.test(raw)) return raw;
  if (IS_ASCII_ONLY.test(raw)) return FALLBACK;
  return raw;
}
