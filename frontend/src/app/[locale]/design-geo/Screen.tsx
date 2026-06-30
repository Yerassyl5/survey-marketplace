"use client";

import { useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   Токены — Геопрофессионал (ui-ux-pro-max: teal geo + professional blue)
   ──────────────────────────────────────────────────────────────────────── */
const G = {
  bg:          "#F0FDFA",
  bgCard:      "#FFFFFF",
  bgNav:       "rgba(255,255,255,0.92)",
  border:      "#CCFBF1",
  borderStrong:"#99F6E4",
  primary:     "#0F766E",
  primaryMid:  "#14B8A6",
  primaryLight:"#CCFBF1",
  primaryXL:   "#F0FDFA",
  cta:         "#0369A1",
  text:        "#134E4A",
  textSec:     "#374151",
  textMuted:   "#6B7280",
  gold:        "#D97706",
};

const STATUS_GEO: Record<string, { border: string; badge: string; badgeText: string }> = {
  "Новая":             { border: "#3B82F6", badge: "#EFF6FF", badgeText: "#1D4ED8" },
  "Активна":           { border: "#0F766E", badge: "#CCFBF1", badgeText: "#0F766E" },
  "Выбор исполнителя": { border: "#D97706", badge: "#FEF3C7", badgeText: "#92400E" },
  "Завершена":         { border: "#9CA3AF", badge: "#F3F4F6", badgeText: "#6B7280" },
};

/* ────────────────────────────────────────────────────────────────────────
   Данные (те же 10 заявок)
   ──────────────────────────────────────────────────────────────────────── */
type Status = "Новая" | "Активна" | "Выбор исполнителя" | "Завершена";

interface Request {
  id: number; type: string; short: string; client: string;
  city: string; price: number; priceDisplay: string;
  deadline: number; status: Status; verified: boolean; bids: number;
}

const ALL: Request[] = [
  { id: 1,  type: "Инженерно-геодезические работы",         short: "Геодезия",  client: "ТОО «КазСтрой»",      city: "Алматы",  price: 850000,  priceDisplay: "850 000 ₸",   deadline: 15, status: "Активна",             verified: true,  bids: 4 },
  { id: 2,  type: "Инженерно-геологические изыскания",      short: "Геология",  client: "АО «ПроектСтандарт»", city: "Астана",  price: 1200000, priceDisplay: "1 200 000 ₸", deadline: 30, status: "Выбор исполнителя",   verified: true,  bids: 7 },
  { id: 3,  type: "Геофизическая съёмка участка",           short: "Геофизика", client: "ТОО «ДевСтрой»",      city: "Шымкент", price: 650000,  priceDisplay: "650 000 ₸",   deadline: 20, status: "Новая",               verified: false, bids: 0 },
  { id: 4,  type: "Топографическая съёмка территории",      short: "Геодезия",  client: "ИП Сидоров А. Н.",    city: "Алматы",  price: 450000,  priceDisplay: "450 000 ₸",   deadline: 10, status: "Активна",             verified: true,  bids: 2 },
  { id: 5,  type: "Инженерно-экологические изыскания",      short: "Экология",  client: "ТОО «ЭкоПроект»",     city: "Алматы",  price: 320000,  priceDisplay: "320 000 ₸",   deadline: 25, status: "Активна",             verified: true,  bids: 3 },
  { id: 6,  type: "Государственная геодезическая привязка", short: "Геодезия",  client: "АО «ГосПроект КЗ»",   city: "Астана",  price: 2400000, priceDisplay: "2 400 000 ₸", deadline: 45, status: "Активна",             verified: true,  bids: 11 },
  { id: 7,  type: "Инженерно-сейсмологические изыскания",   short: "Геофизика", client: "ТОО «СтройКонсалт»",  city: "Алматы",  price: 980000,  priceDisplay: "980 000 ₸",   deadline: 60, status: "Новая",               verified: false, bids: 0 },
  { id: 8,  type: "Геодезические работы для ЖК «Арман»",   short: "Геодезия",  client: "ТОО «УрбанГрупп»",    city: "Астана",  price: 750000,  priceDisplay: "750 000 ₸",   deadline: 12, status: "Выбор исполнителя",   verified: true,  bids: 5 },
  { id: 9,  type: "Литологическое бурение и опробование",   short: "Геология",  client: "АО «ГеоМастер»",      city: "Актобе",  price: 1850000, priceDisplay: "1 850 000 ₸", deadline: 90, status: "Активна",             verified: true,  bids: 6 },
  { id: 10, type: "Мониторинг деформаций здания",           short: "Геофизика", client: "ТОО «ТехНадзор»",     city: "Алматы",  price: 420000,  priceDisplay: "420 000 ₸",   deadline: 7,  status: "Активна",             verified: true,  bids: 2 },
];

/* ────────────────────────────────────────────────────────────────────────
   SVG — топографические визуализации по типу работ
   ──────────────────────────────────────────────────────────────────────── */
function MapViz({ short }: { short: string }) {
  if (short === "Геодезия") {
    return (
      <svg width="100%" height="100%" viewBox="0 0 320 148" preserveAspectRatio="xMidYMid slice">
        <rect width="320" height="148" fill="#D1FAF5"/>
        <ellipse cx="160" cy="80" rx="140" ry="62" fill="none" stroke="#99F6E4" strokeWidth="10"/>
        <ellipse cx="160" cy="80" rx="105" ry="46" fill="none" stroke="#5EEAD4" strokeWidth="8"/>
        <ellipse cx="160" cy="80" rx="70"  ry="31" fill="none" stroke="#2DD4BF" strokeWidth="6"/>
        <ellipse cx="160" cy="80" rx="38"  ry="17" fill="#14B8A6" opacity="0.35"/>
        <circle cx="160" cy="80" r="8" fill="#0F766E"/>
        <circle cx="160" cy="80" r="3" fill="white"/>
        <line x1="160" y1="0" x2="160" y2="20" stroke="#0F766E" strokeWidth="1.5" opacity="0.4"/>
        <line x1="160" y1="140" x2="160" y2="148" stroke="#0F766E" strokeWidth="1.5" opacity="0.4"/>
        <line x1="0" y1="80" x2="24" y2="80" stroke="#0F766E" strokeWidth="1.5" opacity="0.4"/>
        <line x1="296" y1="80" x2="320" y2="80" stroke="#0F766E" strokeWidth="1.5" opacity="0.4"/>
      </svg>
    );
  }
  if (short === "Геология") {
    return (
      <svg width="100%" height="100%" viewBox="0 0 320 148" preserveAspectRatio="xMidYMid slice">
        <rect width="320" height="148" fill="#F0FDFA"/>
        <rect x="0" y="12"  width="320" height="26" fill="#CCFBF1"/>
        <rect x="0" y="46"  width="320" height="22" fill="#99F6E4"/>
        <rect x="0" y="76"  width="320" height="30" fill="#5EEAD4" opacity="0.55"/>
        <rect x="0" y="114" width="320" height="22" fill="#2DD4BF" opacity="0.38"/>
        <rect x="0" y="144" width="320" height="4"  fill="#0F766E" opacity="0.18"/>
        <line x1="160" y1="0" x2="160" y2="148" stroke="#0F766E" strokeWidth="2.5" strokeDasharray="7 5"/>
        <circle cx="160" cy="74" r="9" fill="#0F766E"/>
        <circle cx="160" cy="74" r="3.5" fill="white"/>
        <text x="168" y="70" fontSize="9" fill="#0F766E" opacity="0.7" fontFamily="monospace">GR-24</text>
      </svg>
    );
  }
  if (short === "Геофизика") {
    return (
      <svg width="100%" height="100%" viewBox="0 0 320 148" preserveAspectRatio="xMidYMid slice">
        <rect width="320" height="148" fill="#F0FDFA"/>
        <path d="M0 74 Q40 30 80 74 Q120 118 160 74 Q200 30 240 74 Q280 118 320 74" fill="none" stroke="#99F6E4" strokeWidth="12"/>
        <path d="M0 74 Q40 42 80 74 Q120 106 160 74 Q200 42 240 74 Q280 106 320 74" fill="none" stroke="#5EEAD4" strokeWidth="7"/>
        <path d="M0 74 Q40 55 80 74 Q120 93 160 74 Q200 55 240 74 Q280 93 320 74" fill="none" stroke="#2DD4BF" strokeWidth="4"/>
        <line x1="0" y1="74" x2="320" y2="74" stroke="#0F766E" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.4"/>
        <circle cx="160" cy="74" r="9" fill="#0F766E"/>
        <circle cx="160" cy="74" r="3.5" fill="white"/>
        <circle cx="80"  cy="74" r="4" fill="#14B8A6" opacity="0.6"/>
        <circle cx="240" cy="74" r="4" fill="#14B8A6" opacity="0.6"/>
      </svg>
    );
  }
  /* Экология / default — точечная сетка с выделенной зоной */
  return (
    <svg width="100%" height="100%" viewBox="0 0 320 148" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="148" fill="#CCFBF1"/>
      {Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 12 }, (_, col) => (
          <circle key={`${row}-${col}`} cx={14 + col * 26} cy={18 + row * 22} r="3" fill="#5EEAD4" opacity="0.65"/>
        ))
      )}
      <rect x="80" y="30" width="160" height="88" rx="6" fill="none" stroke="#0F766E" strokeWidth="2" strokeDasharray="8 4"/>
      <rect x="80" y="30" width="160" height="88" rx="6" fill="#0F766E" opacity="0.06"/>
      <circle cx="160" cy="74" r="9" fill="#0F766E"/>
      <circle cx="160" cy="74" r="3.5" fill="white"/>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Навигация
   ──────────────────────────────────────────────────────────────────────── */
function GeoNav({ activeType, onType }: { activeType: string; onType: (t: string) => void }) {
  const types = ["Все", "Геодезия", "Геология", "Геофизика", "Экология"];
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: G.bgNav, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: `1px solid ${G.border}`, height: 62 }}>
      <div style={{ padding: "0 32px", height: "100%", display: "flex", alignItems: "center", gap: 0 }}>
        {/* Логотип */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 32 }}>
          <div style={{ width: 30, height: 30, background: G.primary, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>
              <line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/>
              <line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/>
            </svg>
          </div>
          <span style={{ fontFamily: "var(--font-jakarta), sans-serif", fontSize: 16, fontWeight: 700, color: G.text }}>EOSpatial</span>
        </div>

        {/* Фильтры-таблетки (тип работ) */}
        <div style={{ display: "flex", gap: 6, flex: 1 }}>
          {types.map(t => (
            <button key={t} onClick={() => onType(t)} style={{
              padding: "6px 14px", borderRadius: 100, fontSize: 13,
              fontFamily: "var(--font-jakarta), sans-serif", fontWeight: 500,
              cursor: "pointer", border: "none", transition: "all 150ms",
              background: activeType === t ? G.primary : "transparent",
              color: activeType === t ? "white" : G.textMuted,
            }}>
              {t}
            </button>
          ))}
        </div>

        {/* Поиск */}
        <div style={{ position: "relative", marginRight: 12 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: G.textMuted }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <input readOnly placeholder="Поиск заявок…" style={{ padding: "7px 14px 7px 30px", fontSize: 13, fontFamily: "var(--font-jakarta), sans-serif", border: `1.5px solid ${G.border}`, borderRadius: 100, background: G.bgCard, color: G.text, outline: "none", width: 210 }}/>
        </div>

        <button style={{ padding: "8px 18px", background: G.cta, color: "white", border: "none", borderRadius: 100, fontSize: 13, fontWeight: 600, fontFamily: "var(--font-jakarta), sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
          + Разместить заявку
        </button>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Субшапка: счётчик + город + сортировка
   ──────────────────────────────────────────────────────────────────────── */
function SubHeader({ count, city, onCity, sort, onSort }: {
  count: number; city: string; onCity: (c: string) => void;
  sort: string; onSort: (s: string) => void;
}) {
  const cities = ["Все города", "Алматы", "Астана", "Шымкент", "Актобе"];
  return (
    <div style={{ background: G.bgCard, borderBottom: `1px solid ${G.border}`, padding: "10px 32px", display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ fontFamily: "var(--font-jakarta), sans-serif", fontSize: 13, color: G.textMuted }}>
        <strong style={{ color: G.text }}>{count}</strong> заявок
      </span>
      <div style={{ width: 1, height: 16, background: G.border }} />

      {/* Город */}
      <div style={{ display: "flex", gap: 4 }}>
        {cities.map(c => (
          <button key={c} onClick={() => onCity(c)} style={{
            padding: "4px 12px", borderRadius: 100, fontSize: 12,
            fontFamily: "var(--font-jakarta), sans-serif", fontWeight: 500,
            cursor: "pointer", border: `1.5px solid ${city === c ? G.primary : G.border}`,
            background: city === c ? G.primaryLight : "transparent",
            color: city === c ? G.primary : G.textMuted,
            transition: "all 150ms",
          }}>
            {c}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Сортировка */}
      <div style={{ position: "relative" }}>
        <select value={sort} onChange={e => onSort(e.target.value)} style={{ padding: "5px 28px 5px 10px", fontSize: 12, fontFamily: "var(--font-jakarta), sans-serif", border: `1.5px solid ${G.border}`, borderRadius: 8, background: G.bgCard, color: G.textSec, cursor: "pointer", outline: "none", appearance: "none" }}>
          <option value="date">По дате ↓</option>
          <option value="price_asc">Цена: по возрастанию</option>
          <option value="price_desc">Цена: по убыванию</option>
        </select>
        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: G.textMuted, fontSize: 10 }}>▼</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Карточка заявки
   ──────────────────────────────────────────────────────────────────────── */
function RequestCard({ r }: { r: Request }) {
  const sc = STATUS_GEO[r.status];
  return (
    <div style={{
      background: G.bgCard,
      borderRadius: 14,
      overflow: "hidden",
      border: `1.5px solid ${G.border}`,
      borderLeft: `4px solid ${sc.border}`,
      boxShadow: "0 2px 8px rgba(15,118,110,0.06)",
      display: "flex",
      flexDirection: "column",
      cursor: "pointer",
      transition: "box-shadow 200ms, transform 200ms",
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(15,118,110,0.14)";
      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(15,118,110,0.06)";
      (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
    }}>
      {/* Карта-превью */}
      <div style={{ position: "relative", height: 148, flexShrink: 0 }}>
        <MapViz short={r.short} />
        {/* Статус */}
        <span style={{ position: "absolute", top: 10, right: 10, padding: "3px 10px", borderRadius: 100, fontSize: 11, fontWeight: 700, fontFamily: "var(--font-jakarta), sans-serif", background: sc.badge, color: sc.badgeText, backdropFilter: "blur(4px)" }}>
          {r.status}
        </span>
        {/* Город */}
        <span style={{ position: "absolute", bottom: 10, left: 12, display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 100, fontSize: 11, fontWeight: 600, color: G.primary, background: "rgba(255,255,255,0.88)", backdropFilter: "blur(6px)" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {r.city}
        </span>
      </div>

      {/* Контент */}
      <div style={{ padding: "14px 16px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Тип + срок */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ padding: "2px 9px", background: G.primaryLight, color: G.primary, borderRadius: 100, fontSize: 11, fontWeight: 700, fontFamily: "var(--font-jakarta), sans-serif" }}>
            {r.short}
          </span>
          <span style={{ fontSize: 11, color: G.textMuted, display: "flex", alignItems: "center", gap: 3, fontFamily: "var(--font-jakarta), sans-serif" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {r.deadline} дн.
          </span>
        </div>

        {/* Название */}
        <h3 style={{ margin: 0, fontFamily: "var(--font-jakarta), sans-serif", fontSize: 14, fontWeight: 600, color: G.text, lineHeight: 1.4 }}>
          {r.type}
        </h3>

        {/* Заказчик */}
        <span style={{ fontSize: 12, color: G.textMuted, fontFamily: "var(--font-jakarta), sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          {r.client}
        </span>

        {/* Отклики */}
        {r.bids > 0 && (
          <span style={{ fontSize: 12, color: G.textMuted, fontFamily: "var(--font-jakarta), sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {r.bids} {r.bids === 1 ? "отклик" : r.bids < 5 ? "отклика" : "откликов"}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Цена */}
        <p style={{ margin: 0, fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: G.text }}>
          {r.priceDisplay}
        </p>

        {/* Нижняя строка */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
          {r.verified ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#166534", fontFamily: "var(--font-jakarta), sans-serif", background: "#F0FDF4", padding: "4px 10px", borderRadius: 100, border: "1.5px solid #BBF7D0" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Верифицирован
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#B91C1C", fontFamily: "var(--font-jakarta), sans-serif", background: "#FEF2F2", padding: "4px 10px", borderRadius: 100, border: "1.5px solid #FECACA" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Не верифицирован
            </span>
          )}
          <button style={{ padding: "7px 14px", background: G.cta, color: "white", border: "none", borderRadius: 100, fontSize: 12, fontWeight: 700, fontFamily: "var(--font-jakarta), sans-serif", cursor: "pointer", whiteSpace: "nowrap", transition: "background 150ms" }}>
            Откликнуться
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Пагинация
   ──────────────────────────────────────────────────────────────────────── */
function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, padding: "32px 0 8px" }}>
      <button onClick={() => onChange(current - 1)} disabled={current === 1} style={{ width: 34, height: 34, borderRadius: 100, border: `1.5px solid ${G.border}`, background: "transparent", color: current === 1 ? G.border : G.textMuted, cursor: current === 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      {Array.from({ length: total }, (_, i) => i + 1).map(p => (
        <button key={p} onClick={() => onChange(p)} style={{ width: 34, height: 34, borderRadius: 100, border: `1.5px solid ${p === current ? G.primary : G.border}`, background: p === current ? G.primary : "transparent", color: p === current ? "white" : G.textMuted, cursor: "pointer", fontSize: 13, fontWeight: p === current ? 700 : 400, fontFamily: "var(--font-jakarta), sans-serif", transition: "all 150ms" }}>
          {p}
        </button>
      ))}
      <button onClick={() => onChange(current + 1)} disabled={current === total} style={{ width: 34, height: 34, borderRadius: 100, border: `1.5px solid ${G.border}`, background: "transparent", color: current === total ? G.border : G.textMuted, cursor: current === total ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Футер
   ──────────────────────────────────────────────────────────────────────── */
function GeoFooter() {
  return (
    <footer style={{ background: "#F0FDFA", borderTop: `1px solid ${G.border}`, padding: "28px 32px", marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 22, background: G.primary, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><line x1="12" y1="1" x2="12" y2="4"/></svg>
          </div>
          <span style={{ fontFamily: "var(--font-jakarta), sans-serif", fontSize: 14, fontWeight: 700, color: G.text }}>EOSpatial</span>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {["О платформе", "Верификация", "Поддержка", "Контакты"].map(l => (
            <a key={l} href="#" style={{ fontFamily: "var(--font-jakarta), sans-serif", fontSize: 13, color: G.textMuted, textDecoration: "none" }}>{l}</a>
          ))}
        </div>
        <span style={{ fontFamily: "var(--font-jakarta), sans-serif", fontSize: 12, color: G.textMuted }}>© 2026 EOSpatial</span>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Главный экран
   ──────────────────────────────────────────────────────────────────────── */
export default function GeoScreen() {
  const [typeFilter, setTypeFilter] = useState("Все");
  const [cityFilter, setCityFilter] = useState("Все города");
  const [sort, setSort]             = useState("date");
  const [page, setPage]             = useState(1);
  const PER = 9;

  const typeKey: Record<string, string> = { "Геодезия": "Геодезия", "Геология": "Геология", "Геофизика": "Геофизика", "Экология": "Экология" };

  let filtered = ALL.filter(r => {
    if (typeFilter !== "Все" && r.short !== typeKey[typeFilter]) return false;
    if (cityFilter !== "Все города" && r.city !== cityFilter) return false;
    return true;
  });

  if (sort === "price_asc")  filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (sort === "price_desc") filtered = [...filtered].sort((a, b) => b.price - a.price);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));
  const pageRows   = filtered.slice((page - 1) * PER, page * PER);

  return (
    <div style={{ fontFamily: "var(--font-jakarta), sans-serif", background: G.bg, minHeight: "100vh" }}>
      <GeoNav activeType={typeFilter} onType={t => { setTypeFilter(t); setPage(1); }} />
      <SubHeader count={filtered.length} city={cityFilter} onCity={c => { setCityFilter(c); setPage(1); }} sort={sort} onSort={setSort} />

      <main style={{ padding: "28px 32px", maxWidth: 1440, margin: "0 auto" }}>
        {/* Заголовок + зарегистрироваться */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-jakarta), sans-serif", fontSize: 22, fontWeight: 700, color: G.text }}>
            Лента заявок
            <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 500, color: G.textMuted }}>{filtered.length} найдено</span>
          </h1>
          <span style={{ fontSize: 13, color: G.textMuted }}>
            Исполнитель? —{" "}
            <a href="#" style={{ color: G.cta, fontWeight: 600, textDecoration: "none" }}>Зарегистрируйтесь и откликайтесь</a>
          </span>
        </div>

        {/* Сетка карточек */}
        {pageRows.length === 0 ? (
          <div style={{ padding: "80px 0", textAlign: "center", color: G.textMuted, fontSize: 15 }}>
            По выбранным фильтрам заявок не найдено
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
            {pageRows.map(r => <RequestCard key={r.id} r={r} />)}
          </div>
        )}

        <Pagination current={page} total={totalPages} onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </main>

      <GeoFooter />
    </div>
  );
}
