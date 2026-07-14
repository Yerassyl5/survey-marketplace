"use client";

/* ────────────────────────────────────────────────────────────────────────
   AppNav.tsx — институциональная навигация
   variant="public"  → Войти + Зарегистрироваться
   variant="app"     → user chip (имя + роль)
   activeLink        → подчёркивает активный пункт
   ──────────────────────────────────────────────────────────────────────── */

import type { CSSProperties } from "react";

/* ── Лого ───────────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <a
      href="/ru"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        textDecoration: "none",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          background: "var(--ds-blue)",
          borderRadius: "var(--ds-r-lg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width="16"
          height="16"
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
          <line x1="1" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="23" y2="12" />
        </svg>
      </div>
      <span
        style={{
          fontFamily: "var(--ds-font-heading)",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--ds-text)",
          letterSpacing: "-0.01em",
        }}
      >
        ПроГео
      </span>
    </a>
  );
}

/* ── Типы ───────────────────────────────────────────────────────────────── */
export interface AppNavUser {
  name: string;
  role: "customer" | "contractor";
}

export interface AppNavLink {
  label: string;
  href: string;
}

export interface AppNavProps {
  variant?: "public" | "app";
  activeLink?: string;
  user?: AppNavUser;
  links?: AppNavLink[];
}

const DEFAULT_PUBLIC_LINKS: AppNavLink[] = [
  { label: "О платформе", href: "#" },
  { label: "Как работает", href: "#" },
  { label: "Верификация", href: "#" },
];

const DEFAULT_APP_LINKS: AppNavLink[] = [
  { label: "Лента заявок", href: "/ru/feed" },
  { label: "Мои отклики", href: "/ru/requests/my-bids" },
  { label: "Профиль", href: "#" },
];

/* ── Компонент ──────────────────────────────────────────────────────────── */
export function AppNav({
  variant = "public",
  activeLink,
  user,
  links,
}: AppNavProps) {
  const navLinks = links ?? (variant === "app" ? DEFAULT_APP_LINKS : DEFAULT_PUBLIC_LINKS);

  const navStyle: CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: "var(--ds-z-nav)" as CSSProperties["zIndex"],
    background: "var(--ds-bg-white)",
    borderBottom: "1px solid var(--ds-border)",
    height: "var(--ds-nav-h)",
  };

  const innerStyle: CSSProperties = {
    maxWidth: "var(--ds-max-w)",
    margin: "0 auto",
    padding: "0 var(--ds-pad)",
    height: "100%",
    display: "flex",
    alignItems: "center",
    gap: 0,
  };

  const linkStyle = (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    height: "100%",
    fontFamily: "var(--ds-font-body)",
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    color: active ? "var(--ds-blue)" : "var(--ds-text-sec)",
    textDecoration: "none",
    borderBottom: active ? "2px solid var(--ds-blue)" : "2px solid transparent",
    transition: "color 150ms",
  });

  const ROLE_LABEL: Record<string, string> = {
    customer: "Заказчик",
    contractor: "Исполнитель",
  };

  return (
    <nav style={navStyle} aria-label="Основная навигация">
      <div style={innerStyle}>
        <Logo />

        {/* Ссылки */}
        <div style={{ display: "flex", height: "100%", marginLeft: 32, flex: 1 }}>
          {navLinks.map((l) => {
            const isActive = activeLink === l.href || activeLink === l.label;
            return (
              <a
                key={l.label}
                href={l.href}
                style={linkStyle(isActive)}
                aria-current={isActive ? "page" : undefined}
              >
                {l.label}
              </a>
            );
          })}
        </div>

        {/* Правая часть */}
        {variant === "public" ? (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <a
              href="/ru/login"
              style={{
                padding: "7px 18px",
                background: "transparent",
                border: "1px solid var(--ds-border-str)",
                borderRadius: "var(--ds-r-md)",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "var(--ds-font-body)",
                color: "var(--ds-text-sec)",
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                transition: "border-color 150ms, color 150ms",
              }}
            >
              Войти
            </a>
            <a
              href="/ru/register"
              style={{
                padding: "7px 18px",
                background: "var(--ds-blue)",
                border: "none",
                borderRadius: "var(--ds-r-md)",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "var(--ds-font-heading)",
                color: "#FFFFFF",
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                transition: "background 150ms",
              }}
            >
              Зарегистрироваться
            </a>
          </div>
        ) : user ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--ds-blue)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label={`Аккаунт: ${user.name}`}
            >
              <span
                style={{
                  fontFamily: "var(--ds-font-heading)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#FFFFFF",
                }}
              >
                {user.name
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()}
              </span>
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--ds-font-body)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ds-text)",
                  lineHeight: 1.2,
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  fontFamily: "var(--ds-font-body)",
                  fontSize: 11,
                  color: "var(--ds-text-muted)",
                }}
              >
                {ROLE_LABEL[user.role] ?? user.role}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
