"use client";

import { useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   Типы
   ──────────────────────────────────────────────────────────────────────── */
type Status = "Новая" | "Активна" | "Выбор исполнителя" | "Завершена";

interface Request {
  id: number;
  type: string;
  client: string;
  city: string;
  price: number;
  priceDisplay: string;
  deadline: number;
  status: Status;
  verified: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
   Данные — 10 реалистичных заявок
   ──────────────────────────────────────────────────────────────────────── */
const ALL: Request[] = [
  { id: 1,  type: "Инженерно-геодезические работы",         client: "ТОО «КазСтрой»",         city: "Алматы",   price: 850000,  priceDisplay: "850 000 ₸",   deadline: 15, status: "Активна",              verified: true  },
  { id: 2,  type: "Инженерно-геологические изыскания",      client: "АО «ПроектСтандарт»",    city: "Астана",   price: 1200000, priceDisplay: "1 200 000 ₸", deadline: 30, status: "Выбор исполнителя",    verified: true  },
  { id: 3,  type: "Геофизическая съёмка участка",           client: "ТОО «ДевСтрой»",          city: "Шымкент",  price: 650000,  priceDisplay: "650 000 ₸",   deadline: 20, status: "Новая",               verified: false },
  { id: 4,  type: "Топографическая съёмка территории",      client: "ИП Сидоров А. Н.",        city: "Алматы",   price: 450000,  priceDisplay: "450 000 ₸",   deadline: 10, status: "Активна",             verified: true  },
  { id: 5,  type: "Инженерно-экологические изыскания",      client: "ТОО «ЭкоПроект»",         city: "Алматы",   price: 320000,  priceDisplay: "320 000 ₸",   deadline: 25, status: "Активна",             verified: true  },
  { id: 6,  type: "Государственная геодезическая привязка", client: "АО «ГосПроект КЗ»",       city: "Астана",   price: 2400000, priceDisplay: "2 400 000 ₸", deadline: 45, status: "Активна",             verified: true  },
  { id: 7,  type: "Инженерно-сейсмологические изыскания",   client: "ТОО «СтройКонсалт»",      city: "Алматы",   price: 980000,  priceDisplay: "980 000 ₸",   deadline: 60, status: "Новая",               verified: false },
  { id: 8,  type: "Геодезические работы для ЖК «Арман»",   client: "ТОО «УрбанГрупп»",        city: "Астана",   price: 750000,  priceDisplay: "750 000 ₸",   deadline: 12, status: "Выбор исполнителя",   verified: true  },
  { id: 9,  type: "Литологическое бурение и опробование",   client: "АО «ГеоМастер»",          city: "Актобе",   price: 1850000, priceDisplay: "1 850 000 ₸", deadline: 90, status: "Активна",             verified: true  },
  { id: 10, type: "Мониторинг деформаций здания",           client: "ТОО «ТехНадзор»",         city: "Алматы",   price: 420000,  priceDisplay: "420 000 ₸",   deadline: 7,  status: "Активна",             verified: true  },
];

/* ────────────────────────────────────────────────────────────────────────
   Дизайн-токены (ui-ux-pro-max: Trust & Authority palette)
   ──────────────────────────────────────────────────────────────────────── */
const T = {
  bgPage:      "#F8FAFC",
  bgWhite:     "#FFFFFF",
  border:      "#E2E8F0",
  borderStrong:"#CBD5E1",
  text:        "#0F172A",
  textSec:     "#475569",
  textMuted:   "#94A3B8",
  blueDark:    "#1E40AF",
  blueCta:     "#0369A1",
  blueLight:   "#DBEAFE",
  blueXLight:  "#EFF6FF",
  navH:        64,
};

const STATUS: Record<Status, { bg: string; color: string; border: string }> = {
  "Новая":             { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  "Активна":           { bg: "#F0FDF4", color: "#166534", border: "#BBF7D0" },
  "Выбор исполнителя": { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  "Завершена":         { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
};

/* ────────────────────────────────────────────────────────────────────────
   SVG-иконки (героиконы, только path)
   ──────────────────────────────────────────────────────────────────────── */
const Ic = {
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  ),
  Bell: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  Chevron: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  X: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  User: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Filter: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  ),
  Building: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  Pin: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  Clock: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
};

/* ────────────────────────────────────────────────────────────────────────
   Вспомогательные компоненты
   ──────────────────────────────────────────────────────────────────────── */
function Select({ value, onChange, options, label }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            appearance: "none",
            WebkitAppearance: "none",
            width: "100%",
            padding: "8px 36px 8px 12px",
            fontSize: 14,
            fontFamily: "var(--font-source), sans-serif",
            fontWeight: 400,
            color: value === "all" ? T.textMuted : T.text,
            background: T.bgWhite,
            border: `1px solid ${T.borderStrong}`,
            borderRadius: 6,
            cursor: "pointer",
            outline: "none",
          }}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: T.textMuted }}>
          <Ic.Chevron />
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Верхняя навигация
   ──────────────────────────────────────────────────────────────────────── */
function TopNav() {
  const NAV = ["Лента заявок", "Мои отклики", "Договоры", "Аналитика"];
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: T.bgWhite, borderBottom: `1px solid ${T.border}`, height: T.navH }}>
      <div style={{ padding: "0 32px", height: "100%", display: "flex", alignItems: "center", gap: 0 }}>
        {/* Логотип */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 40 }}>
          <div style={{ width: 28, height: 28, background: T.blueCta, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" fill="none" stroke="white" strokeWidth="1.5"/>
              <line x1="12" y1="4" x2="12" y2="1" stroke="white" strokeWidth="2"/>
            </svg>
          </div>
          <span style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 16, fontWeight: 700, color: T.text }}>EOSpatial</span>
        </div>

        {/* Навигационные пункты */}
        <div style={{ display: "flex", alignItems: "stretch", height: "100%", gap: 0 }}>
          {NAV.map((item, i) => (
            <div key={item} style={{
              display: "flex", alignItems: "center", padding: "0 16px",
              cursor: "pointer",
              fontFamily: "var(--font-source), sans-serif",
              fontSize: 14, fontWeight: i === 0 ? 600 : 500,
              color: i === 0 ? T.blueDark : T.textSec,
              borderBottom: i === 0 ? `2px solid ${T.blueDark}` : "2px solid transparent",
              transition: "color 150ms, border-color 150ms",
            }}>
              {item}
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Правая часть */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Уведомления */}
          <button style={{ position: "relative", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: T.textSec }}>
            <Ic.Bell />
            <span style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, background: "#EF4444", borderRadius: "50%", border: "2px solid white" }} />
          </button>

          {/* Разделитель */}
          <div style={{ width: 1, height: 24, background: T.border, margin: "0 8px" }} />

          {/* Профиль */}
          <button style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", transition: "background 150ms" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.blueDark, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
              <Ic.User />
            </div>
            <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, fontWeight: 500, color: T.text }}>Нурланов Е.</span>
            <span style={{ color: T.textMuted }}><Ic.Chevron /></span>
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Шапка страницы — заголовок + статистика
   ──────────────────────────────────────────────────────────────────────── */
function PageHeader({ total }: { total: number }) {
  const stats = [
    { n: total,  label: "заявок доступно" },
    { n: 12,     label: "новых сегодня" },
    { n: 4,      label: "жду вашего отклика" },
  ];
  return (
    <div style={{ background: T.bgWhite, borderBottom: `1px solid ${T.border}`, padding: "20px 32px 0" }}>
      {/* Хлебные крошки */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: T.textMuted }}>
        <span style={{ cursor: "pointer", transition: "color 150ms" }}>Главная</span>
        <span>/</span>
        <span style={{ color: T.text, fontWeight: 500 }}>Лента заявок</span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
            Лента заявок
          </h1>
          <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: T.textSec, margin: "6px 0 0" }}>
            Изыскания по всему Казахстану — выбирайте подходящие заявки и откликайтесь
          </p>
        </div>
        <button style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 8, border: "none",
          background: T.blueCta, color: "white", cursor: "pointer",
          fontFamily: "var(--font-lexend), sans-serif", fontSize: 13, fontWeight: 600,
          transition: "background 150ms", whiteSpace: "nowrap", marginBottom: 4,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Разместить заявку
        </button>
      </div>

      {/* Статистика */}
      <div style={{ display: "flex", gap: 0, marginTop: 20 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 24px 12px 0", marginRight: i < stats.length - 1 ? 24 : 0, borderRight: i < stats.length - 1 ? `1px solid ${T.border}` : "none" }}>
            <span style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 24, fontWeight: 700, color: i === 2 ? "#D97706" : T.blueDark }}>{s.n}</span>
            <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: T.textSec, lineHeight: 1.3, maxWidth: 90 }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Панель фильтров
   ──────────────────────────────────────────────────────────────────────── */
function FilterBar({ search, setSearch, filterType, setFilterType, filterCity, setFilterCity, filterStatus, setFilterStatus, filterPrice, setFilterPrice, onReset, hasActive }: {
  search: string; setSearch: (v: string) => void;
  filterType: string; setFilterType: (v: string) => void;
  filterCity: string; setFilterCity: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  filterPrice: string; setFilterPrice: (v: string) => void;
  onReset: () => void; hasActive: boolean;
}) {
  return (
    <div style={{ background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {/* Поиск */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.textMuted }}>
          <Ic.Search />
        </span>
        <input
          type="text"
          placeholder="Поиск по типу работ, заказчику, городу…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 16px 10px 40px",
            fontFamily: "var(--font-source), sans-serif", fontSize: 14,
            color: T.text, background: T.bgPage,
            border: `1px solid ${T.borderStrong}`, borderRadius: 7,
            outline: "none", transition: "border-color 150ms",
          }}
        />
      </div>

      {/* Фильтры */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto auto", gap: 12, alignItems: "end" }}>
        <Select value={filterType} onChange={setFilterType} label="Тип работ" options={[
          { value: "all", label: "Все типы" },
          { value: "геодезич", label: "Геодезия" },
          { value: "геологич", label: "Геология" },
          { value: "геофизич", label: "Геофизика" },
          { value: "экологич", label: "Экология" },
        ]} />
        <Select value={filterCity} onChange={setFilterCity} label="Город" options={[
          { value: "all",      label: "Все города" },
          { value: "Алматы",   label: "Алматы" },
          { value: "Астана",   label: "Астана" },
          { value: "Шымкент",  label: "Шымкент" },
          { value: "Актобе",   label: "Актобе" },
        ]} />
        <Select value={filterStatus} onChange={setFilterStatus} label="Статус" options={[
          { value: "all",              label: "Все статусы" },
          { value: "Новая",            label: "Новая" },
          { value: "Активна",          label: "Активна" },
          { value: "Выбор исполнителя",label: "Выбор исполнителя" },
        ]} />
        <Select value={filterPrice} onChange={setFilterPrice} label="Стоимость" options={[
          { value: "all",        label: "Любая" },
          { value: "under500",   label: "до 500 000 ₸" },
          { value: "500to1000",  label: "500 000 – 1 000 000 ₸" },
          { value: "over1000",   label: "от 1 000 000 ₸" },
        ]} />

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "transparent", display: "block" }}>x</span>
          <button
            style={{ padding: "9px 20px", background: T.blueCta, color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "var(--font-source), sans-serif", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", transition: "background 150ms" }}
          >
            Применить
          </button>
        </div>

        {hasActive && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "transparent", display: "block" }}>x</span>
            <button
              onClick={onReset}
              style={{ padding: "9px 16px", background: "transparent", color: T.textSec, border: `1px solid ${T.borderStrong}`, borderRadius: 6, cursor: "pointer", fontFamily: "var(--font-source), sans-serif", fontSize: 14, transition: "background 150ms", whiteSpace: "nowrap" }}
            >
              Сбросить
            </button>
          </div>
        )}
      </div>

      {/* Активные фильтры-чипы */}
      {hasActive && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: T.textMuted, fontFamily: "var(--font-source), sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
            <Ic.Filter /> Активные фильтры:
          </span>
          {filterType !== "all" && (
            <Chip label={filterType === "геодезич" ? "Геодезия" : filterType === "геологич" ? "Геология" : filterType === "геофизич" ? "Геофизика" : "Экология"} onRemove={() => setFilterType("all")} />
          )}
          {filterCity !== "all" && <Chip label={filterCity} onRemove={() => setFilterCity("all")} />}
          {filterStatus !== "all" && <Chip label={filterStatus} onRemove={() => setFilterStatus("all")} />}
          {filterPrice !== "all" && <Chip label={filterPrice === "under500" ? "до 500 000 ₸" : filterPrice === "500to1000" ? "500–1 000 тыс ₸" : "от 1 000 000 ₸"} onRemove={() => setFilterPrice("all")} />}
          {search && <Chip label={`«${search}»`} onRemove={() => setSearch("")} />}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px 3px 10px", background: T.blueXLight, color: T.blueDark, borderRadius: 100, fontSize: 12, fontFamily: "var(--font-source), sans-serif", fontWeight: 500, border: `1px solid ${T.blueLight}` }}>
      {label}
      <button onClick={onRemove} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: "50%", border: "none", background: "rgba(30,64,175,0.15)", cursor: "pointer", padding: 0, color: T.blueDark }}>
        <Ic.X />
      </button>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Таблица заявок
   ──────────────────────────────────────────────────────────────────────── */
function RequestTable({ rows, totalCount }: { rows: Request[]; totalCount: number }) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const COL = { fontFamily: "var(--font-source), sans-serif", fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.07em", padding: "10px 16px", background: "#F8FAFC", whiteSpace: "nowrap" as const, borderBottom: `2px solid ${T.border}` };

  return (
    <div style={{ background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {/* Тулбар таблицы */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: T.textSec }}>
          Показано <strong style={{ color: T.text }}>{rows.length}</strong> из <strong style={{ color: T.text }}>{totalCount}</strong> заявок
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ padding: "5px 12px", fontSize: 12, fontFamily: "var(--font-source), sans-serif", color: T.textSec, background: "transparent", border: `1px solid ${T.borderStrong}`, borderRadius: 5, cursor: "pointer" }}>Сортировка: По дате ↓</button>
          <button style={{ padding: "5px 12px", fontSize: 12, fontFamily: "var(--font-source), sans-serif", color: T.textSec, background: "transparent", border: `1px solid ${T.borderStrong}`, borderRadius: 5, cursor: "pointer" }}>Вид: Таблица</button>
        </div>
      </div>

      {/* Скролл-обёртка (overflow-x для мобильных) */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...COL, width: 48, textAlign: "center" }}>№</th>
              <th style={{ ...COL, textAlign: "left" }}>Тип работ</th>
              <th style={{ ...COL, textAlign: "left" }}>Заказчик / Город</th>
              <th style={{ ...COL, textAlign: "right" }}>Стоимость</th>
              <th style={{ ...COL, textAlign: "center" }}>Срок</th>
              <th style={{ ...COL, textAlign: "center" }}>Статус</th>
              <th style={{ ...COL, textAlign: "center" }}>Верификация</th>
              <th style={{ ...COL, textAlign: "center", width: 130 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 48, textAlign: "center", fontFamily: "var(--font-source), sans-serif", fontSize: 14, color: T.textMuted }}>
                  По вашим фильтрам заявок не найдено
                </td>
              </tr>
            ) : rows.map((r, i) => {
              const sc = STATUS[r.status];
              const isHovered = hoveredId === r.id;
              return (
                <tr
                  key={r.id}
                  onMouseEnter={() => setHoveredId(r.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    background: isHovered ? T.blueXLight : i % 2 === 0 ? T.bgWhite : "#FAFBFD",
                    borderBottom: `1px solid ${T.border}`,
                    transition: "background 120ms",
                    cursor: "pointer",
                  }}
                >
                  {/* № */}
                  <td style={{ padding: "14px 16px", textAlign: "center", fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: T.textMuted, fontWeight: 500 }}>
                    {r.id}
                  </td>
                  {/* Тип */}
                  <td style={{ padding: "14px 16px", maxWidth: 280 }}>
                    <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 14, fontWeight: 500, color: isHovered ? T.blueDark : T.text, display: "block", transition: "color 120ms" }}>
                      {r.type}
                    </span>
                  </td>
                  {/* Заказчик / Город */}
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-source), sans-serif", fontSize: 13, fontWeight: 500, color: T.text, marginBottom: 2 }}>
                      <Ic.Building /> {r.client}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-source), sans-serif", fontSize: 12, color: T.textSec }}>
                      <Ic.Pin /> {r.city}
                    </span>
                  </td>
                  {/* Стоимость */}
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>{r.priceDisplay}</span>
                  </td>
                  {/* Срок */}
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: T.textSec }}>
                      <Ic.Clock /> {r.deadline} дн.
                    </span>
                  </td>
                  {/* Статус */}
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 100, fontSize: 12, fontWeight: 600, fontFamily: "var(--font-source), sans-serif", background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: "nowrap" }}>
                      {r.status}
                    </span>
                  </td>
                  {/* Верификация */}
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    {r.verified ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 100, fontSize: 12, fontWeight: 600, fontFamily: "var(--font-source), sans-serif", background: "#F0FDF4", color: "#166534", border: "1px solid #BBF7D0", whiteSpace: "nowrap" }}>
                        <Ic.Check /> Верифицирован
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 100, fontSize: 12, fontWeight: 600, fontFamily: "var(--font-source), sans-serif", background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA", whiteSpace: "nowrap" }}>
                        <Ic.X /> Не верифицирован
                      </span>
                    )}
                  </td>
                  {/* Действие */}
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <button style={{ padding: "7px 14px", background: isHovered ? T.blueDark : T.blueCta, color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontFamily: "var(--font-lexend), sans-serif", fontWeight: 600, transition: "background 150ms", whiteSpace: "nowrap" }}>
                      Откликнуться
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Пагинация
   ──────────────────────────────────────────────────────────────────────── */
function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;

  const pages: (number | "...")[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1, 2);
    if (current > 4) pages.push("...");
    for (let i = Math.max(3, current - 1); i <= Math.min(total - 2, current + 1); i++) pages.push(i);
    if (current < total - 3) pages.push("...");
    pages.push(total - 1, total);
  }

  const btn = (active: boolean, disabled: boolean, onClick: () => void, children: React.ReactNode) => (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minWidth: 34, height: 34, padding: "0 8px",
        borderRadius: 6,
        border: `1px solid ${active ? T.blueDark : T.borderStrong}`,
        background: active ? T.blueDark : "transparent",
        color: active ? "white" : disabled ? T.textMuted : T.textSec,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "var(--font-source), sans-serif", fontSize: 13, fontWeight: active ? 600 : 400,
        transition: "background 150ms, color 150ms",
      }}
    >{children}</button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px" }}>
      <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: T.textSec }}>
        Страница {current} из {total}
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        {btn(false, current === 1, () => onChange(current - 1), <><Ic.ChevronLeft /> Назад</>)}
        {pages.map((p, i) => p === "..." ? (
          <span key={`e${i}`} style={{ display: "flex", alignItems: "center", padding: "0 4px", color: T.textMuted, fontSize: 13 }}>…</span>
        ) : btn(p === current, false, () => onChange(p as number), p))}
        {btn(false, current === total, () => onChange(current + 1), <>Вперёд <Ic.ChevronRight /></>)}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Футер
   ──────────────────────────────────────────────────────────────────────── */
function Footer() {
  const links = ["О платформе", "Условия использования", "Политика конфиденциальности", "Поддержка", "Контакты"];
  return (
    <footer style={{ background: T.text, marginTop: 48 }}>
      <div style={{ padding: "32px 32px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 24, height: 24, background: T.blueCta, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" fill="none" stroke="white" strokeWidth="1.5"/><line x1="12" y1="4" x2="12" y2="1" stroke="white" strokeWidth="2"/></svg>
              </div>
              <span style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 15, fontWeight: 700, color: "white" }}>EOSpatial</span>
            </div>
            <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: "#94A3B8", maxWidth: 280, lineHeight: 1.6, margin: 0 }}>
              Маркетплейс инженерных изысканий для Казахстана. Геодезия, геология, геофизика.
            </p>
          </div>
          <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>Платформа</p>
              {["О проекте", "Как работает", "Верификация"].map(l => (
                <div key={l} style={{ marginBottom: 6 }}>
                  <a href="#" style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: "#94A3B8", textDecoration: "none", transition: "color 150ms" }}>{l}</a>
                </div>
              ))}
            </div>
            <div>
              <p style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>Поддержка</p>
              {["Справочный центр", "Контакты", "Telegram"].map(l => (
                <div key={l} style={{ marginBottom: 6 }}>
                  <a href="#" style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: "#94A3B8", textDecoration: "none" }}>{l}</a>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #1E293B", marginTop: 24, paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, color: "#475569" }}>© 2026 EOSpatial. Все права защищены.</span>
          <div style={{ display: "flex", gap: 20 }}>
            {links.slice(0, 3).map(l => (
              <a key={l} href="#" style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, color: "#475569", textDecoration: "none" }}>{l}</a>
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
export default function InstitutionalScreen() {
  const [search, setSearch]             = useState("");
  const [filterType, setFilterType]     = useState("all");
  const [filterCity, setFilterCity]     = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPrice, setFilterPrice]   = useState("all");
  const [page, setPage]                 = useState(1);
  const PER = 10;

  const filtered = ALL.filter(r => {
    if (search && !r.type.toLowerCase().includes(search.toLowerCase()) && !r.client.toLowerCase().includes(search.toLowerCase()) && !r.city.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== "all" && !r.type.toLowerCase().includes(filterType)) return false;
    if (filterCity !== "all" && r.city !== filterCity) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterPrice === "under500"  && r.price >= 500000)  return false;
    if (filterPrice === "500to1000" && (r.price < 500000 || r.price > 1000000)) return false;
    if (filterPrice === "over1000"  && r.price <= 1000000) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));
  const pageRows   = filtered.slice((page - 1) * PER, page * PER);
  const hasActive  = search !== "" || filterType !== "all" || filterCity !== "all" || filterStatus !== "all" || filterPrice !== "all";

  const reset = () => { setSearch(""); setFilterType("all"); setFilterCity("all"); setFilterStatus("all"); setFilterPrice("all"); setPage(1); };

  return (
    <div style={{ fontFamily: "var(--font-source), sans-serif", background: T.bgPage, minHeight: "100vh" }}>
      <TopNav />
      <PageHeader total={ALL.length} />

      <main style={{ padding: "24px 32px", maxWidth: 1440, margin: "0 auto" }}>
        {/* Блок фильтров */}
        <FilterBar
          search={search} setSearch={setSearch}
          filterType={filterType} setFilterType={setFilterType}
          filterCity={filterCity} setFilterCity={setFilterCity}
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterPrice={filterPrice} setFilterPrice={setFilterPrice}
          onReset={reset} hasActive={hasActive}
        />

        {/* Таблица */}
        <div style={{ marginTop: 16 }}>
          <RequestTable rows={pageRows} totalCount={filtered.length} />
        </div>

        {/* Пагинация */}
        <Pagination current={page} total={totalPages} onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </main>

      <Footer />
    </div>
  );
}
