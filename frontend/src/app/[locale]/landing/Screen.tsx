"use client";

import { useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   Дизайн-токены — Институциональный (та же система, что в ленте заявок)
   ──────────────────────────────────────────────────────────────────────── */
const T = {
  navy:        "#0F172A",   // фон героя, футера
  navyMid:     "#1E293B",   // карточки на тёмном
  navyLight:   "#334155",   // вторичный текст на тёмном
  blue:        "#0369A1",   // primary CTA
  blueDark:    "#1E40AF",   // active nav
  blueLight:   "#DBEAFE",
  blueXLight:  "#EFF6FF",
  bg:          "#F8FAFC",   // светлые секции
  white:       "#FFFFFF",
  border:      "#E2E8F0",
  borderStr:   "#CBD5E1",
  text:        "#0F172A",
  textSec:     "#475569",
  textMuted:   "#94A3B8",
  green:       "#166534",
  greenBg:     "#F0FDF4",
  greenBorder: "#BBF7D0",
};

/* ────────────────────────────────────────────────────────────────────────
   Иконки (Heroicons-стиль, stroke)
   ──────────────────────────────────────────────────────────────────────── */
const Ic = {
  Check: ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Shield: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  MapPin: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  Eye: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Users: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  FileText: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  ArrowRight: ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  ChevronRight: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Lock: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Building: ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
};

/* ────────────────────────────────────────────────────────────────────────
   Навигация
   ──────────────────────────────────────────────────────────────────────── */
function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = ["О платформе", "Как работает", "Верификация"];
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: T.white, borderBottom: `1px solid ${T.border}`, height: 64 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px", height: "100%", display: "flex", alignItems: "center", gap: 0 }}>
        {/* Лого */}
        <a href="#" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", marginRight: 40 }}>
          <div style={{ width: 30, height: 30, background: T.blue, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>
              <line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/>
              <line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/>
            </svg>
          </div>
          <span style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 16, fontWeight: 700, color: T.text }}>ПроГео</span>
        </a>

        {/* Ссылки */}
        <div style={{ display: "flex", gap: 0, height: "100%", alignItems: "stretch" }}>
          {links.map(l => (
            <a key={l} href="#" style={{ display: "flex", alignItems: "center", padding: "0 16px", fontFamily: "var(--font-source), sans-serif", fontSize: 14, fontWeight: 500, color: T.textSec, textDecoration: "none", borderBottom: "2px solid transparent", transition: "color 150ms" }}>
              {l}
            </a>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Кнопки */}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ padding: "8px 18px", background: "transparent", border: `1px solid ${T.borderStr}`, borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: "var(--font-source), sans-serif", color: T.textSec, cursor: "pointer", transition: "all 150ms" }}>
            Войти
          </button>
          <button style={{ padding: "8px 18px", background: T.blue, border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: "var(--font-lexend), sans-serif", color: T.white, cursor: "pointer", transition: "background 150ms" }}>
            Зарегистрироваться
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Hero — navy фон, центрированный, dual CTA
   ──────────────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section style={{
      background: T.navy,
      backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
      backgroundSize: "48px 48px",
      padding: "80px 32px 88px",
      textAlign: "center",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Бейдж */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 100, marginBottom: 28 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80", display: "inline-block" }} />
          <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Платформа инженерных изысканий · Казахстан
          </span>
        </div>

        {/* Заголовок */}
        <h1 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 52, fontWeight: 700, color: T.white, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 20px" }}>
          Инженерные изыскания —<br />
          <span style={{ color: "#93C5FD" }}>профессионально и прозрачно</span>
        </h1>

        {/* Подзаголовок */}
        <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 18, lineHeight: 1.65, color: "rgba(255,255,255,0.68)", margin: "0 0 40px", maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>
          Соединяем заказчиков с верифицированными геодезистами, геологами и геофизиками. Без посредников, с прозрачными статусами и документацией.
        </p>

        {/* CTA */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", background: T.blue, border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, fontFamily: "var(--font-lexend), sans-serif", color: T.white, cursor: "pointer", transition: "background 150ms" }}>
            Разместить заявку
            <Ic.ArrowRight size={16} />
          </button>
          <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", background: "transparent", border: "1.5px solid rgba(255,255,255,0.28)", borderRadius: 8, fontSize: 15, fontWeight: 600, fontFamily: "var(--font-lexend), sans-serif", color: T.white, cursor: "pointer", transition: "border-color 150ms" }}>
            Найти заявки
            <Ic.ChevronRight size={14} />
          </button>
        </div>

        {/* Доверительные сигналы */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, marginTop: 40, flexWrap: "wrap" }}>
          {[
            { icon: <Ic.Shield size={14} />, text: "Верифицированные исполнители" },
            { icon: <Ic.MapPin size={14} />, text: "Все регионы Казахстана" },
            { icon: <Ic.Eye size={14} />, text: "Прозрачные статусы сделок" },
          ].map(s => (
            <span key={s.text} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
              <span style={{ color: "#4ADE80" }}>{s.icon}</span>
              {s.text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Статистика — социальное доказательство (из скилла: stat counter effects)
   ──────────────────────────────────────────────────────────────────────── */
function StatsBar() {
  const stats = [
    { n: "94+",   label: "активных заявок" },
    { n: "230+",  label: "верифицированных исполнителей" },
    { n: "12",    label: "городов Казахстана" },
    { n: "98%",   label: "сделок завершены успешно" },
  ];
  return (
    <div style={{ background: T.white, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px", display: "flex" }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{ flex: 1, padding: "28px 24px", textAlign: "center", borderRight: i < stats.length - 1 ? `1px solid ${T.border}` : "none" }}>
            <div style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 34, fontWeight: 700, color: T.blueDark, letterSpacing: "-0.02em" }}>{s.n}</div>
            <div style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: T.textSec, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Как это работает — 4 шага с горизонтальной линией
   ──────────────────────────────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    { n: "01", title: "Публикуете заявку", desc: "Описание работ, бюджет, прикрепляете ТЗ, привязываете к земельному объекту" },
    { n: "02", title: "Исполнители откликаются", desc: "Видите профили, статус верификации лицензий и аттестатов каждого" },
    { n: "03", title: "Выбираете исполнителя", desc: "Оцениваете квалификацию, историю сделок и документы — выбираете лучшего" },
    { n: "04", title: "Принимаете результат", desc: "Исполнитель сдаёт материалы, вы подтверждаете — сделка закрыта" },
  ];
  return (
    <section id="how" style={{ background: T.bg, padding: "80px 32px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Заголовок секции */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, fontWeight: 700, color: T.blue, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Процесс</p>
          <h2 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 36, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", margin: 0 }}>Как работает платформа</h2>
          <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 16, color: T.textSec, marginTop: 12 }}>Полный цикл от заявки до закрытой сделки</p>
        </div>

        {/* Шаги */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, position: "relative" }}>
          {/* Горизонтальная соединительная линия */}
          <div style={{ position: "absolute", top: 28, left: "12.5%", right: "12.5%", height: 2, background: `linear-gradient(90deg, ${T.blueLight}, ${T.blueLight})`, zIndex: 0 }} />

          {steps.map((s, i) => (
            <div key={s.n} style={{ padding: "0 24px", textAlign: "center", position: "relative", zIndex: 1 }}>
              {/* Кружок с номером */}
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: i === 0 ? T.blue : T.white, border: `2px solid ${i === 0 ? T.blue : T.blueLight}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: "0 0 0 6px #F8FAFC" }}>
                <span style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 15, fontWeight: 700, color: i === 0 ? T.white : T.blueDark }}>{s.n}</span>
              </div>
              <h3 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 16, fontWeight: 600, color: T.text, margin: "0 0 8px" }}>{s.title}</h3>
              <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: T.textSec, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Для кого — два столбца: Заказчики / Исполнители
   ──────────────────────────────────────────────────────────────────────── */
function ForWhom() {
  const clients = ["Проектные организации и ГИПы", "Девелоперы и застройщики", "Государственные заказчики", "Частные землевладельцы", "Архитектурные бюро"];
  const contractors = ["Геодезисты и картографы", "Инженерные геологи", "Геофизики", "Гидрогеологи", "Инженеры-экологи"];
  return (
    <section style={{ background: T.white, padding: "80px 32px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, fontWeight: 700, color: T.blue, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Участники</p>
          <h2 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 36, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", margin: 0 }}>Для кого эта платформа</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Заказчики */}
          <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "36px 36px 32px" }}>
            <div style={{ width: 44, height: 44, background: T.blueXLight, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: T.blueDark, marginBottom: 18 }}>
              <Ic.Building size={22} />
            </div>
            <h3 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 22, fontWeight: 700, color: T.text, margin: "0 0 6px" }}>Заказчики</h3>
            <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: T.textSec, margin: "0 0 24px", lineHeight: 1.6 }}>
              Публикуйте заявки, получайте отклики от верифицированных специалистов, выбирайте лучшего.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10 }}>
              {clients.map(c => (
                <li key={c} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: T.textSec }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: T.greenBg, border: `1.5px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: T.green }}>
                    <Ic.Check size={10} />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 22px", background: T.blue, color: T.white, border: "none", borderRadius: 7, fontSize: 14, fontWeight: 600, fontFamily: "var(--font-lexend), sans-serif", cursor: "pointer" }}>
              Разместить заявку <Ic.ArrowRight size={14} />
            </button>
          </div>

          {/* Исполнители */}
          <div style={{ background: T.navy, border: `1px solid ${T.navyLight}`, borderRadius: 12, padding: "36px 36px 32px" }}>
            <div style={{ width: 44, height: 44, background: "rgba(255,255,255,0.08)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#93C5FD", marginBottom: 18 }}>
              <Ic.Users size={22} />
            </div>
            <h3 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 22, fontWeight: 700, color: T.white, margin: "0 0 6px" }}>Исполнители</h3>
            <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: "rgba(255,255,255,0.6)", margin: "0 0 24px", lineHeight: 1.6 }}>
              Находите заявки под вашу специализацию, откликайтесь, ведите сделки в одном месте.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10 }}>
              {contractors.map(c => (
                <li key={c} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: "rgba(255,255,255,0.65)" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(74,222,128,0.15)", border: "1.5px solid rgba(74,222,128,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ic.Check size={10} color="#4ADE80" />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 22px", background: "rgba(255,255,255,0.1)", color: T.white, border: "1.5px solid rgba(255,255,255,0.2)", borderRadius: 7, fontSize: 14, fontWeight: 600, fontFamily: "var(--font-lexend), sans-serif", cursor: "pointer" }}>
              Найти заявки <Ic.ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Преимущества — 3 карточки
   ──────────────────────────────────────────────────────────────────────── */
function Advantages() {
  const items = [
    {
      icon: <Ic.Shield size={24} />,
      title: "Только верифицированные",
      desc: "Перед выходом на заявки каждый исполнитель проходит проверку: загружает лицензию и аттестат, модератор подтверждает допуски. Заказчик всегда видит статус верификации.",
    },
    {
      icon: <Ic.MapPin size={24} />,
      title: "Все регионы Казахстана",
      desc: "Платформа работает по всей стране — Алматы, Астана, Шымкент, Актобе и другие города. Фильтрация по городу встроена в ленту заявок.",
    },
    {
      icon: <Ic.Eye size={24} />,
      title: "Прозрачность на каждом шаге",
      desc: "Статусы заявки, откликов и сделки отображаются в реальном времени. История документов, переписки и результатов сохраняется и доступна обоим сторонам.",
    },
  ];
  return (
    <section id="about" style={{ background: T.bg, padding: "80px 32px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, fontWeight: 700, color: T.blue, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Преимущества</p>
          <h2 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 36, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", margin: 0 }}>Почему ПроГео</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {items.map(item => (
            <div key={item.title} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "32px 28px" }}>
              <div style={{ width: 48, height: 48, background: T.blueXLight, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: T.blueDark, marginBottom: 20 }}>
                {item.icon}
              </div>
              <h3 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 18, fontWeight: 700, color: T.text, margin: "0 0 10px" }}>{item.title}</h3>
              <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: T.textSec, lineHeight: 1.7, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Верификация — процесс шаг за шагом (trust section из скилла)
   ──────────────────────────────────────────────────────────────────────── */
function Verification() {
  const steps = [
    { title: "Загрузка документов", desc: "Исполнитель загружает лицензию на проведение изысканий и аттестат специалиста в личном кабинете" },
    { title: "Проверка модератором", desc: "Модератор ПроГео проверяет подлинность документов и соответствие допусков заявленным видам работ" },
    { title: "Статус «Верифицирован»", desc: "Исполнитель получает доступ к заявкам. Заказчики видят статус верификации при каждом отклике" },
  ];
  return (
    <section id="verify" style={{ background: T.white, padding: "80px 32px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
        {/* Текст */}
        <div>
          <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, fontWeight: 700, color: T.blue, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Верификация</p>
          <h2 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 34, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", margin: "0 0 16px", lineHeight: 1.2 }}>
            Только специалисты с подтверждёнными допусками
          </h2>
          <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 15, color: T.textSec, lineHeight: 1.7, margin: "0 0 32px" }}>
            Мы не берём исполнителей на слово. Каждый проходит ручную проверку документов. Это не формальность — это обязательное условие для работы на платформе.
          </p>
          {/* Зелёный badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", background: T.greenBg, border: `1.5px solid ${T.greenBorder}`, borderRadius: 8 }}>
            <span style={{ color: T.green }}><Ic.Shield size={16} /></span>
            <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, fontWeight: 600, color: T.green }}>Лицензии и аттестаты проверены</span>
          </div>
        </div>

        {/* Шаги */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {steps.map((s, i) => (
            <div key={s.title} style={{ display: "flex", gap: 20, paddingBottom: i < steps.length - 1 ? 28 : 0 }}>
              {/* Левый столбик: кружок + линия */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 40 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.greenBg, border: `2px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: T.green }}>
                  <Ic.Check size={16} />
                </div>
                {i < steps.length - 1 && (
                  <div style={{ flex: 1, width: 2, background: T.greenBorder, marginTop: 8 }} />
                )}
              </div>
              {/* Текст */}
              <div style={{ paddingTop: 8, paddingBottom: i < steps.length - 1 ? 20 : 0 }}>
                <h4 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 16, fontWeight: 600, color: T.text, margin: "0 0 6px" }}>{s.title}</h4>
                <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: T.textSec, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Превью заявок — реальные заявки, часть закрыта (social proof из скилла)
   ──────────────────────────────────────────────────────────────────────── */
const PREVIEW_REQUESTS = [
  { type: "Инженерно-геодезические работы",         city: "Алматы",  price: "850 000 ₸",   status: "Активна",             bids: 4, verified: true  },
  { type: "Инженерно-геологические изыскания",      city: "Астана",  price: "1 200 000 ₸", status: "Выбор исполнителя",   bids: 7, verified: true  },
  { type: "Геофизическая съёмка участка",           city: "Шымкент", price: "650 000 ₸",   status: "Новая",               bids: 0, verified: false },
  { type: "Государственная геодезическая привязка", city: "Астана",  price: "2 400 000 ₸", status: "Активна",             bids: 11, verified: true },
  { type: "Топографическая съёмка территории",      city: "Алматы",  price: "450 000 ₸",   status: "Активна",             bids: 2, verified: true  },
];

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  "Новая":             { bg: "#EFF6FF", color: "#1D4ED8" },
  "Активна":           { bg: "#F0FDF4", color: "#166534" },
  "Выбор исполнителя": { bg: "#FEF3C7", color: "#92400E" },
};

function RequestsPreview() {
  return (
    <section style={{ background: T.bg, padding: "80px 32px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, fontWeight: 700, color: T.blue, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Актуальные заявки</p>
          <h2 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 36, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", margin: 0 }}>Заявки прямо сейчас</h2>
          <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 15, color: T.textSec, marginTop: 10 }}>
            Зарегистрируйтесь, чтобы видеть все заявки и откликаться
          </p>
        </div>

        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", position: "relative" }}>
          {/* Заголовок таблицы */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 150px 140px 160px", gap: 0, background: T.bg, borderBottom: `1px solid ${T.border}` }}>
            {["Тип работ", "Город", "Стоимость", "Статус", "Откликов"].map(h => (
              <div key={h} style={{ padding: "10px 20px", fontFamily: "var(--font-source), sans-serif", fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {h}
              </div>
            ))}
          </div>

          {/* Строки */}
          {PREVIEW_REQUESTS.map((r, i) => {
            const sc = STATUS_COLOR[r.status] || { bg: "#F1F5F9", color: "#475569" };
            const isBlurred = i >= 3;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 150px 140px 160px", gap: 0, borderBottom: i < PREVIEW_REQUESTS.length - 1 ? `1px solid ${T.border}` : "none", background: i % 2 === 0 ? T.white : T.bg, filter: isBlurred ? "blur(4px)" : "none", userSelect: isBlurred ? "none" : "auto" }}>
                <div style={{ padding: "14px 20px" }}>
                  <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, fontWeight: 500, color: T.text }}>{r.type}</span>
                </div>
                <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: T.textSec }}>{r.city}</div>
                <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: T.text }}>{r.price}</div>
                <div style={{ padding: "14px 20px", display: "flex", alignItems: "center" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 100, fontSize: 11, fontWeight: 600, fontFamily: "var(--font-source), sans-serif", background: sc.bg, color: sc.color }}>
                    {r.status}
                  </span>
                </div>
                <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: r.bids > 0 ? T.blueDark : T.textMuted, fontWeight: r.bids > 0 ? 600 : 400 }}>
                  {r.bids > 0 ? `${r.bids} откликов` : "Нет откликов"}
                </div>
              </div>
            );
          })}

          {/* Оверлей «залочены» */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 140, background: "linear-gradient(transparent, rgba(248,250,252,0.97))", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 }}>
                <span style={{ color: T.textMuted }}><Ic.Lock size={16} /></span>
                <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: T.textMuted }}>
                  Ещё 89 активных заявок — только для зарегистрированных исполнителей
                </span>
              </div>
              <button style={{ padding: "10px 24px", background: T.blue, color: T.white, border: "none", borderRadius: 7, fontSize: 14, fontWeight: 700, fontFamily: "var(--font-lexend), sans-serif", cursor: "pointer" }}>
                Зарегистрироваться и откликаться
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Финальный CTA — два пути: заказчик / исполнитель
   ──────────────────────────────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section style={{ background: T.navy, padding: "80px 32px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 36, fontWeight: 700, color: T.white, letterSpacing: "-0.02em", margin: 0 }}>
            Начните прямо сейчас
          </h2>
          <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 16, color: "rgba(255,255,255,0.6)", marginTop: 12 }}>
            Регистрация бесплатна — для обеих сторон
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 800, margin: "0 auto" }}>
          {/* Заказчик */}
          <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "36px 32px", textAlign: "center" }}>
            <div style={{ width: 52, height: 52, background: T.blueXLight, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: T.blueDark }}>
              <Ic.FileText size={24} />
            </div>
            <h3 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 20, fontWeight: 700, color: T.white, margin: "0 0 10px" }}>Я — Заказчик</h3>
            <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: "rgba(255,255,255,0.6)", margin: "0 0 28px", lineHeight: 1.6 }}>
              Размещу заявку, получу отклики верифицированных специалистов и выберу лучшего
            </p>
            <button style={{ width: "100%", padding: "12px", background: T.blue, color: T.white, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: "var(--font-lexend), sans-serif", cursor: "pointer" }}>
              Зарегистрироваться как заказчик
            </button>
          </div>

          {/* Исполнитель */}
          <div style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.18)", borderRadius: 14, padding: "36px 32px", textAlign: "center" }}>
            <div style={{ width: 52, height: 52, background: "rgba(255,255,255,0.08)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#93C5FD" }}>
              <Ic.Users size={24} />
            </div>
            <h3 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 20, fontWeight: 700, color: T.white, margin: "0 0 10px" }}>Я — Исполнитель</h3>
            <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: "rgba(255,255,255,0.6)", margin: "0 0 28px", lineHeight: 1.6 }}>
              Пройду верификацию, найду заявки под специализацию и буду вести клиентов в системе
            </p>
            <button style={{ width: "100%", padding: "12px", background: "transparent", color: T.white, border: "1.5px solid rgba(255,255,255,0.3)", borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: "var(--font-lexend), sans-serif", cursor: "pointer" }}>
              Зарегистрироваться как исполнитель
            </button>
          </div>
        </div>

        <p style={{ textAlign: "center", fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 28 }}>
          Уже есть аккаунт?{" "}
          <a href="#" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "underline", cursor: "pointer" }}>Войти</a>
        </p>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Футер
   ──────────────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: "#060E1C", borderTop: "1px solid #1E293B" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 32px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 48, marginBottom: 40 }}>
          {/* О компании */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 26, height: 26, background: T.blue, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><line x1="12" y1="1" x2="12" y2="4"/></svg>
              </div>
              <span style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 15, fontWeight: 700, color: T.white }}>ПроГео</span>
            </div>
            <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: "#475569", lineHeight: 1.7, margin: "0 0 16px" }}>
              Платформа инженерных изысканий для Казахстана. Геодезия, геология, геофизика.
            </p>
            <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, color: "#334155" }}>
              support@progeo.kz<br />+7 (727) 000-00-00
            </p>
          </div>
          {/* Платформа */}
          <div>
            <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 14px" }}>Платформа</p>
            {["О проекте", "Как работает", "Верификация", "Тарифы"].map(l => (
              <div key={l} style={{ marginBottom: 8 }}>
                <a href="#" style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: "#475569", textDecoration: "none" }}>{l}</a>
              </div>
            ))}
          </div>
          {/* Исполнителям */}
          <div>
            <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 14px" }}>Исполнителям</p>
            {["Регистрация", "Загрузить документы", "Лента заявок", "Мои отклики"].map(l => (
              <div key={l} style={{ marginBottom: 8 }}>
                <a href="#" style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: "#475569", textDecoration: "none" }}>{l}</a>
              </div>
            ))}
          </div>
          {/* Заказчикам */}
          <div>
            <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 14px" }}>Заказчикам</p>
            {["Разместить заявку", "Мои объекты", "Найти исполнителя", "Поддержка"].map(l => (
              <div key={l} style={{ marginBottom: 8 }}>
                <a href="#" style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: "#475569", textDecoration: "none" }}>{l}</a>
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid #1E293B", paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, color: "#334155" }}>© 2026 ПроГео. Все права защищены.</span>
          <div style={{ display: "flex", gap: 24 }}>
            {["Условия использования", "Политика конфиденциальности"].map(l => (
              <a key={l} href="#" style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, color: "#334155", textDecoration: "none" }}>{l}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Главный компонент
   ──────────────────────────────────────────────────────────────────────── */
export default function LandingScreen() {
  return (
    <div style={{ fontFamily: "var(--font-source), sans-serif" }}>
      <Nav />
      <Hero />
      <StatsBar />
      <HowItWorks />
      <ForWhom />
      <Advantages />
      <Verification />
      <RequestsPreview />
      <FinalCTA />
      <Footer />
    </div>
  );
}
