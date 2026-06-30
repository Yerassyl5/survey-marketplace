"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ─── SVG-иконки ──────────────────────────────────────────────────────── */
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconWarn = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M6 1.5L10.5 10H1.5L6 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M6 5v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="6" cy="8.5" r="0.6" fill="currentColor" />
  </svg>
);
const IconPin = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <circle cx="6" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M6 1C3.79 1 2 2.79 2 4.5c0 3.5 4 6.5 4 6.5s4-3 4-6.5C10 2.79 8.21 1 6 1Z" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);
const IconUsers = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="5" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M1 11c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="10.5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2" />
    <path d="M12.5 11c0-1.7-1-3-2.2-3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
const IconChevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M4 5l2 2 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ─── Данные заявок ───────────────────────────────────────────────────── */
const REQUESTS = [
  { id: 1, type: "Инженерно-геодезические работы", short: "Геодезия", city: "Алматы", price: "850 000 ₸", status: "Активна", verified: true, bids: 4 },
  { id: 2, type: "Инженерно-геологические изыскания", short: "Геология", city: "Астана", price: "1 200 000 ₸", status: "Выбор исполнителя", verified: true, bids: 7 },
  { id: 3, type: "Геофизическая съёмка", short: "Геофизика", city: "Шымкент", price: "650 000 ₸", status: "Новая", verified: false, bids: 0 },
  { id: 4, type: "Топографическая съёмка", short: "Геодезия", city: "Алматы", price: "450 000 ₸", status: "Активна", verified: true, bids: 2 },
  { id: 5, type: "Инженерно-экологические изыскания", short: "Экология", city: "Алматы", price: "320 000 ₸", status: "Активна", verified: true, bids: 3 },
];

/* ═══════════════════════════════════════════════════════════════════════
   НАПРАВЛЕНИЕ 1 — ИНСТИТУЦИОНАЛЬНЫЙ
   Плотная HTML-таблица на всю ширину, строгие разделители
   ═══════════════════════════════════════════════════════════════════════ */
function DirectionOne() {
  const H: React.CSSProperties = { fontFamily: "var(--font-lexend), sans-serif" };
  const B: React.CSSProperties = { fontFamily: "var(--font-source), sans-serif" };

  const statusColor = (s: string) =>
    s === "Активна"
      ? { bg: "#EFF6FF", color: "#1D4ED8" }
      : s === "Выбор исполнителя"
      ? { bg: "#FEF3C7", color: "#92400E" }
      : { bg: "#F1F5F9", color: "#475569" };

  return (
    <div style={{ ...B, background: "#F8FAFC", minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E8F0" }} className="px-8 py-4 flex items-center gap-5">
        <span style={{ ...H, color: "#0F172A", fontSize: 18, fontWeight: 700 }}>EOSpatial</span>
        <div className="flex-1 max-w-md">
          <input
            readOnly
            placeholder="Поиск по типу работ, городу…"
            className="w-full text-sm px-4 py-2 rounded"
            style={{ border: "1px solid #CBD5E1", background: "#F8FAFC", color: "#0F172A", outline: "none" }}
          />
        </div>
        <div className="flex-1" />
        <button className="text-sm font-medium px-5 py-2 rounded cursor-pointer" style={{ background: "#0369A1", color: "#fff" }}>
          Разместить заявку
        </button>
        <button className="text-sm font-medium px-5 py-2 rounded cursor-pointer" style={{ border: "1px solid #CBD5E1", color: "#475569", background: "transparent" }}>
          Войти
        </button>
      </header>

      {/* Фильтры */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E8F0" }} className="px-8 py-3 flex items-center gap-3">
        {["Тип работ", "Город", "Статус", "Стоимость"].map((f) => (
          <button key={f} className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded cursor-pointer" style={{ border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#475569" }}>
            {f} <IconChevron />
          </button>
        ))}
        <span className="ml-auto text-xs" style={{ color: "#94A3B8" }}>Найдено: {REQUESTS.length} заявок</span>
      </div>

      {/* Таблица */}
      <div className="px-8 py-6">
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, overflow: "hidden" }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                {["Тип работ", "Город", "Стоимость", "Статус", "Верификация исполнителя", ""].map((h) => (
                  <th key={h} className="text-left px-5 py-3" style={{ ...H, color: "#64748B", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REQUESTS.map((r, i) => {
                const sc = statusColor(r.status);
                return (
                  <tr key={r.id} style={{ borderBottom: i < REQUESTS.length - 1 ? "1px solid #F1F5F9" : "none", background: i % 2 === 0 ? "#FFFFFF" : "#FAFBFC" }}>
                    <td className="px-5 py-4" style={{ color: "#0F172A", fontWeight: 500 }}>{r.type}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5" style={{ color: "#475569" }}><IconPin /> {r.city}</span>
                    </td>
                    <td className="px-5 py-4" style={{ fontFamily: "monospace", fontWeight: 600, color: "#0F172A" }}>{r.price}</td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-medium px-2.5 py-1 rounded" style={{ background: sc.bg, color: sc.color }}>{r.status}</span>
                    </td>
                    <td className="px-5 py-4">
                      {r.verified
                        ? <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded" style={{ background: "#F0FDF4", color: "#166534" }}><IconCheck /> Верифицирован</span>
                        : <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded" style={{ background: "#FEF2F2", color: "#B91C1C" }}><IconWarn /> Не верифицирован</span>
                      }
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button className="text-xs font-medium px-4 py-1.5 rounded cursor-pointer" style={{ background: "#0369A1", color: "#fff" }}>Откликнуться</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Пагинация */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs" style={{ color: "#94A3B8" }}>Показаны 1–5 из 47 заявок</span>
          <div className="flex gap-1">
            {[1, 2, 3, "…", 10].map((p, i) => (
              <button key={i} className="text-xs px-3 py-1.5 rounded cursor-pointer" style={{ background: p === 1 ? "#0369A1" : "#FFFFFF", color: p === 1 ? "#fff" : "#475569", border: "1px solid #E2E8F0" }}>{p}</button>
            ))}
          </div>
        </div>

        {/* Регистрация */}
        <div className="mt-8 flex items-center gap-4 p-6 rounded-lg" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0" }}>
          <div>
            <p style={{ ...H, color: "#0F172A", fontWeight: 600, fontSize: 15 }}>Станьте исполнителем</p>
            <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>Откликайтесь на заявки и развивайте бизнес</p>
          </div>
          <div className="flex-1 max-w-xs ml-auto">
            <input readOnly placeholder="Email или телефон" className="w-full text-sm px-4 py-2.5 rounded" style={{ border: "1px solid #CBD5E1", background: "#F8FAFC", outline: "none" }} />
          </div>
          <button className="text-sm font-medium px-5 py-2.5 rounded shrink-0 cursor-pointer" style={{ background: "#0369A1", color: "#fff" }}>Зарегистрироваться</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   НАПРАВЛЕНИЕ 2 — ГЕОПРОФЕССИОНАЛ
   Крупные карточки с топо-картой, горизонтальные фильтры, сетка
   ═══════════════════════════════════════════════════════════════════════ */
function MapPlaceholder({ short }: { short: string }) {
  return (
    <div style={{ background: "#CCFBF1", position: "relative", overflow: "hidden" }} className="w-full h-32 rounded-t-xl">
      <svg width="100%" height="100%" viewBox="0 0 280 128" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <rect width="280" height="128" fill="#CCFBF1" />
        <ellipse cx="140" cy="70" rx="115" ry="52" fill="none" stroke="#99F6E4" strokeWidth="9" />
        <ellipse cx="140" cy="70" rx="82" ry="37" fill="none" stroke="#5EEAD4" strokeWidth="7" />
        <ellipse cx="140" cy="70" rx="54" ry="24" fill="none" stroke="#2DD4BF" strokeWidth="5" />
        <ellipse cx="140" cy="70" rx="30" ry="13" fill="#14B8A6" opacity="0.3" />
        <circle cx="140" cy="70" r="5" fill="#0F766E" opacity="0.9" />
        <circle cx="140" cy="70" r="2" fill="#fff" />
      </svg>
      <span className="absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.92)", color: "#0F766E" }}>
        {short}
      </span>
    </div>
  );
}

function DirectionTwo() {
  const [activeFilter, setActiveFilter] = useState("Все");
  const filters = ["Все", "Геодезия", "Геология", "Геофизика", "Экология"];
  const visible = activeFilter === "Все" ? REQUESTS : REQUESTS.filter((r) => r.short === activeFilter);

  const statusStyle = (s: string) =>
    s === "Активна" ? { bg: "#CCFBF1", color: "#0F766E" }
    : s === "Выбор исполнителя" ? { bg: "#FEF9C3", color: "#92400E" }
    : { bg: "#E0F2FE", color: "#0369A1" };

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif", background: "#F0FDFA", minHeight: "100vh" }}>
      {/* Header */}
      <header className="px-8 py-5 flex items-center gap-6" style={{ background: "#FFFFFF", borderBottom: "1px solid #CCFBF1" }}>
        <span style={{ color: "#134E4A", fontSize: 20, fontWeight: 700 }}>EOSpatial</span>
        <div className="flex-1 max-w-sm">
          <input readOnly placeholder="Поиск заявок…" className="w-full text-sm px-4 py-2.5 rounded-full" style={{ border: "2px solid #CCFBF1", background: "#F0FDFA", outline: "none", color: "#134E4A" }} />
        </div>
        <div className="flex-1" />
        <button className="text-sm font-semibold px-5 py-2.5 rounded-full cursor-pointer" style={{ background: "#0369A1", color: "#fff" }}>Разместить заявку</button>
        <button className="text-sm font-medium px-5 py-2.5 rounded-full cursor-pointer" style={{ background: "#CCFBF1", color: "#134E4A" }}>Войти</button>
      </header>

      {/* Фильтры-таблетки */}
      <div className="px-8 py-4 flex items-center gap-3 overflow-x-auto" style={{ borderBottom: "1px solid #CCFBF1", background: "#F8FFFE" }}>
        {filters.map((f) => (
          <button key={f} onClick={() => setActiveFilter(f)} className="text-sm font-semibold px-5 py-2 rounded-full cursor-pointer shrink-0 transition-all duration-150"
            style={activeFilter === f ? { background: "#0F766E", color: "#fff" } : { background: "#FFFFFF", color: "#0F766E", border: "1.5px solid #99F6E4" }}>
            {f}
          </button>
        ))}
        <div className="ml-auto shrink-0">
          <button className="text-sm px-4 py-2 rounded-full cursor-pointer" style={{ background: "#FFFFFF", border: "1.5px solid #CCFBF1", color: "#0F766E" }}>Сортировка ↕</button>
        </div>
      </div>

      {/* Сетка карточек */}
      <div className="px-8 py-8 grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {visible.map((r) => {
          const sc = statusStyle(r.status);
          return (
            <div key={r.id} className="overflow-hidden rounded-xl cursor-pointer" style={{ background: "#FFFFFF", border: "1.5px solid #CCFBF1", boxShadow: "0 2px 12px rgba(15,118,110,0.07)" }}>
              <MapPlaceholder short={r.short} />
              <div className="p-5 space-y-3" style={{ borderLeft: "4px solid #0F766E" }}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold leading-snug" style={{ color: "#134E4A" }}>{r.type}</h3>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ background: sc.bg, color: sc.color }}>{r.status}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#0F766E" }}><IconPin /> {r.city}</span>
                  <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#64748B" }}><IconUsers /> {r.bids} откликов</span>
                </div>
                <p className="text-xl font-bold" style={{ color: "#134E4A" }}>{r.price}</p>
                <div className="flex items-center justify-between pt-1">
                  {r.verified
                    ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "#CCFBF1", color: "#0F766E", border: "1.5px solid #0F766E" }}><IconCheck /> Верифицирован</span>
                    : <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: "#FEF9C3", color: "#92400E", border: "1.5px solid #FDE68A" }}><IconWarn /> Не верифицирован</span>
                  }
                  <button className="text-sm font-semibold px-4 py-2 rounded-full cursor-pointer" style={{ background: "#0369A1", color: "#fff" }}>Откликнуться</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Регистрация */}
      <div className="px-8 pb-10">
        <div className="flex items-center gap-4 p-6 rounded-2xl" style={{ background: "#134E4A" }}>
          <div>
            <p className="font-bold text-white text-base">Станьте исполнителем</p>
            <p className="text-xs mt-0.5" style={{ color: "#99F6E4" }}>Откликайтесь и развивайте бизнес</p>
          </div>
          <div className="flex-1 max-w-xs ml-auto">
            <input readOnly placeholder="Email или телефон" className="w-full text-sm px-4 py-3 rounded-full" style={{ background: "#0F4338", border: "1.5px solid #0F766E", color: "#ffffff", outline: "none" }} />
          </div>
          <button className="text-sm font-bold px-6 py-3 rounded-full shrink-0 cursor-pointer" style={{ background: "#0369A1", color: "#fff" }}>Зарегистрироваться</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   НАПРАВЛЕНИЕ 3 — АВТОРИТЕТ И ВЕРИФИКАЦИЯ
   Split-layout: тёмный сайдбар + горизонтальные карточки со статусом
   ═══════════════════════════════════════════════════════════════════════ */
function DirectionThree() {
  const PH: React.CSSProperties = { fontFamily: "var(--font-poppins), sans-serif" };
  const OH: React.CSSProperties = { fontFamily: "var(--font-open), sans-serif" };

  const navItems = [
    { label: "Лента заявок", active: true },
    { label: "Мои отклики", active: false },
    { label: "Договоры", active: false },
    { label: "Профиль", active: false },
  ];

  const statusStyle = (s: string) =>
    s === "Активна" ? { bg: "#164E63", color: "#38BDF8" }
    : s === "Выбор исполнителя" ? { bg: "#3B1A00", color: "#FBBF24" }
    : { bg: "#1E293B", color: "#94A3B8" };

  return (
    <div style={{ ...OH, background: "#0B1120", minHeight: "100vh", display: "flex" }}>
      {/* ── Сайдбар ── */}
      <aside className="shrink-0 flex flex-col" style={{ width: 272, background: "#060D1A", borderRight: "1px solid #1E293B" }}>
        {/* Логотип */}
        <div className="px-6 py-6" style={{ borderBottom: "1px solid #1E293B" }}>
          <span style={{ ...PH, color: "#F8FAFC", fontSize: 18, fontWeight: 700 }}>EOSpatial</span>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>Платформа изысканий</p>
        </div>

        {/* Навигация */}
        <nav className="px-3 py-4 space-y-1 flex-1">
          {navItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm"
              style={{ background: item.active ? "rgba(56,189,248,0.1)" : "transparent", color: item.active ? "#38BDF8" : "#64748B", fontWeight: item.active ? 600 : 400, borderLeft: item.active ? "3px solid #38BDF8" : "3px solid transparent" }}>
              {item.label}
            </div>
          ))}
        </nav>

        {/* Статистика */}
        <div className="px-5 py-5 space-y-3" style={{ borderTop: "1px solid #1E293B" }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#334155" }}>Моя активность</p>
          {[{ label: "Активных заявок", value: "4" }, { label: "В работе", value: "2" }, { label: "Завершено", value: "47" }].map((s) => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "#64748B" }}>{s.label}</span>
              <span className="text-sm font-bold" style={{ ...PH, color: "#F8FAFC" }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Поле ввода */}
        <div className="px-5 py-5" style={{ borderTop: "1px solid #1E293B" }}>
          <p className="text-xs font-medium mb-2" style={{ color: "#475569" }}>Email или телефон</p>
          <input readOnly placeholder="name@company.kz" className="w-full text-sm px-4 py-2.5 rounded-lg" style={{ background: "#0F172A", border: "1px solid #1E293B", color: "#F8FAFC", outline: "none" }} />
          <button className="w-full mt-2 text-sm font-bold py-2.5 rounded-lg cursor-pointer" style={{ background: "#38BDF8", color: "#0B1120" }}>Войти</button>
        </div>
      </aside>

      {/* ── Основной контент ── */}
      <main className="flex-1 overflow-y-auto" style={{ minWidth: 0 }}>
        {/* Топ-бар */}
        <div className="px-8 py-5 flex items-center gap-4 sticky top-0" style={{ borderBottom: "1px solid #1E293B", background: "#0B1120", zIndex: 10 }}>
          <h1 style={{ ...PH, color: "#F8FAFC", fontSize: 20, fontWeight: 700 }}>Лента заявок</h1>
          <div className="flex-1" />
          <button className="text-xs px-3 py-1.5 rounded cursor-pointer" style={{ background: "#1E293B", color: "#94A3B8", border: "1px solid #334155" }}>Сортировка: Новые ↕</button>
          <button className="text-sm font-semibold px-5 py-2 rounded-lg cursor-pointer" style={{ background: "#38BDF8", color: "#0B1120" }}>Разместить заявку</button>
        </div>

        {/* Карточки */}
        <div className="px-8 py-6 space-y-4">
          {REQUESTS.map((r) => {
            const sc = statusStyle(r.status);
            return (
              <div key={r.id} className="flex items-center gap-6 p-5 rounded-xl cursor-pointer"
                style={{ background: "#111827", border: r.verified ? "1px solid #F59E0B" : "1px solid #1E293B", borderLeft: r.verified ? "4px solid #F59E0B" : "4px solid #334155" }}>
                {/* Тип + город */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded" style={{ background: "#1E293B", color: "#38BDF8", border: "1px solid #334155" }}>{r.short}</span>
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded" style={{ background: sc.bg, color: sc.color }}>{r.status}</span>
                  </div>
                  <h3 className="text-sm font-semibold truncate" style={{ ...PH, color: "#F1F5F9" }}>{r.type}</h3>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#64748B" }}><IconPin /> {r.city}</span>
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#64748B" }}><IconUsers /> {r.bids} откликов</span>
                  </div>
                </div>

                {/* Верификация */}
                <div className="shrink-0">
                  {r.verified
                    ? <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "#F59E0B", color: "#0B1120" }}><IconCheck /> Верифицирован</span>
                    : <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: "#1E293B", color: "#64748B" }}><IconWarn /> Не верифицирован</span>
                  }
                </div>

                {/* Цена + кнопка */}
                <div className="shrink-0 text-right space-y-2">
                  <p style={{ ...PH, color: "#F8FAFC", fontWeight: 700, fontSize: 16 }}>{r.price}</p>
                  <button className="text-xs font-bold px-4 py-2 rounded-lg cursor-pointer" style={{ background: "#38BDF8", color: "#0B1120" }}>Откликнуться</button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ВКЛАДКИ И ГЛАВНЫЙ КОМПОНЕНТ
   ═══════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: "d1", label: "1 — Институциональный", sub: "Таблица · Плотный · Строгий", Component: DirectionOne },
  { id: "d2", label: "2 — Геопрофессионал", sub: "Карточки с картой · Фильтры · Тил", Component: DirectionTwo },
  { id: "d3", label: "3 — Авторитет", sub: "Сайдбар · Тёмный · Золото", Component: DirectionThree },
];

export default function DesignPreviewClient() {
  const [active, setActive] = useState("d1");
  const { Component } = TABS.find((t) => t.id === active)!;

  return (
    <div>
      {/* Sticky tab-switcher */}
      <div className="flex items-stretch" style={{ position: "sticky", top: 0, zIndex: 50, background: "#1E293B", borderBottom: "1px solid #334155" }}>
        <div className="flex items-center px-4 shrink-0" style={{ borderRight: "1px solid #334155" }}>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#475569" }}>Сравнение</span>
        </div>
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActive(tab.id)} className="flex-1 px-6 py-3 text-left cursor-pointer transition-colors duration-150"
            style={{ background: active === tab.id ? "#0F172A" : "transparent", borderBottom: active === tab.id ? "2px solid #38BDF8" : "2px solid transparent" }}>
            <span className="block text-sm font-semibold" style={{ color: active === tab.id ? "#F8FAFC" : "#64748B" }}>{tab.label}</span>
            <span className="block text-xs mt-0.5" style={{ color: "#475569" }}>{tab.sub}</span>
          </button>
        ))}
      </div>

      {/* Контент с анимацией */}
      <AnimatePresence mode="wait">
        <motion.div key={active} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <Component />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
