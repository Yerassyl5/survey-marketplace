"use client";

/* ────────────────────────────────────────────────────────────────────────
   AppFooter.tsx — институциональный футер
   Четыре колонки: о компании, Платформа, Исполнителям, Заказчикам.
   Используется на лендинге и во всех рабочих экранах.
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties } from "react";

const COLS = [
  {
    heading: "Платформа",
    links: ["О проекте", "Как работает", "Верификация", "Тарифы"],
  },
  {
    heading: "Исполнителям",
    links: ["Регистрация", "Загрузить документы", "Лента заявок", "Мои отклики"],
  },
  {
    heading: "Заказчикам",
    links: ["Разместить заявку", "Мои объекты", "Найти исполнителя", "Поддержка"],
  },
];

interface AppFooterProps {
  /** Показывать расширенную версию с 4 колонками (лендинг) или компактную (app) */
  compact?: boolean;
}

export function AppFooter({ compact = false }: AppFooterProps) {
  const footerBg = "#060E1C";
  const borderColor = "#1E293B";

  const linkStyle: CSSProperties = {
    fontFamily: "var(--ds-font-body)",
    fontSize: 13,
    color: "#475569",
    textDecoration: "none",
    display: "block",
    marginBottom: 7,
    transition: "color 150ms",
  };

  const headingStyle: CSSProperties = {
    fontFamily: "var(--ds-font-body)",
    fontSize: 11,
    fontWeight: 700,
    color: "#334155",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    margin: "0 0 14px",
  };

  return (
    <footer
      style={{ background: footerBg, borderTop: `1px solid ${borderColor}` }}
    >
      <div
        style={{
          maxWidth: "var(--ds-max-w)",
          margin: "0 auto",
          padding: compact ? "24px var(--ds-pad)" : "40px var(--ds-pad) 28px",
        }}
      >
        {!compact && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              gap: 48,
              marginBottom: 40,
            }}
          >
            {/* О компании */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    background: "var(--ds-blue)",
                    borderRadius: "var(--ds-r-md)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="12" r="8" />
                    <line x1="12" y1="1" x2="12" y2="4" />
                    <line x1="12" y1="20" x2="12" y2="23" />
                  </svg>
                </div>
                <span
                  style={{
                    fontFamily: "var(--ds-font-heading)",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#F8FAFC",
                  }}
                >
                  ПроГео
                </span>
              </div>
              <p
                style={{
                  fontFamily: "var(--ds-font-body)",
                  fontSize: 13,
                  color: "#475569",
                  lineHeight: 1.7,
                  margin: "0 0 12px",
                }}
              >
                Платформа инженерных изысканий для Казахстана. Геодезия, геология, геофизика.
              </p>
              <p
                style={{
                  fontFamily: "var(--ds-font-body)",
                  fontSize: 12,
                  color: "#334155",
                  lineHeight: 1.7,
                }}
              >
                support@progeo.kz
                <br />
                +7 (727) 000-00-00
              </p>
            </div>

            {/* Колонки ссылок */}
            {COLS.map((col) => (
              <div key={col.heading}>
                <p style={headingStyle}>{col.heading}</p>
                {col.links.map((l) => (
                  <a key={l} href="#" style={linkStyle}>
                    {l}
                  </a>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Нижняя полоса */}
        <div
          style={{
            borderTop: compact ? "none" : `1px solid ${borderColor}`,
            paddingTop: compact ? 0 : 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: "var(--ds-font-body)",
              fontSize: 12,
              color: "#334155",
            }}
          >
            © 2026 ПроГео. Все права защищены.
          </span>
          <div style={{ display: "flex", gap: 24 }}>
            {["Условия использования", "Политика конфиденциальности"].map((l) => (
              <a
                key={l}
                href="#"
                style={{
                  fontFamily: "var(--ds-font-body)",
                  fontSize: 12,
                  color: "#334155",
                  textDecoration: "none",
                }}
              >
                {l}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
