/* ────────────────────────────────────────────────────────────────────────
   Временная заглушка — нужна только чтобы (app)-layout (guard приватных
   маршрутов) было на чём проверить. Полноценный личный кабинет — отдельный
   пункт критического пути (см. docs/design-system.md), не в этой сессии.
   ──────────────────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  return (
    <div style={{ maxWidth: "var(--ds-max-w)", margin: "0 auto", padding: "40px var(--ds-pad)" }}>
      <h1
        style={{
          fontFamily: "var(--ds-font-heading)",
          fontSize: 26,
          fontWeight: 700,
          color: "var(--ds-text)",
        }}
      >
        Личный кабинет
      </h1>
      <p style={{ fontFamily: "var(--ds-font-body)", fontSize: 14, color: "var(--ds-text-sec)", marginTop: 8 }}>
        Экран в разработке — эта страница нужна только для проверки защиты маршрутов.
      </p>
    </div>
  );
}
