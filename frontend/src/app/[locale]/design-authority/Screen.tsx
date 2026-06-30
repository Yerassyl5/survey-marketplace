"use client";

import { useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   Токены — Авторитет (ui-ux-pro-max: premium dark + gold CTA #CA8A04)
   ──────────────────────────────────────────────────────────────────────── */
const A = {
  bgPage:   "#0A0907",
  bgSide:   "#060402",
  bgCard:   "#1C1917",
  bgCardHov:"#231F1C",
  border:   "#292524",
  borderStr:"#3F3A36",
  text:     "#FAFAF9",
  textSec:  "#A8A29E",
  textMuted:"#57534E",
  gold:     "#CA8A04",
  goldLight:"#FEF9C3",
  goldBg:   "#1C1500",
  sky:      "#0EA5E9",
  skyLight: "#E0F2FE",
  green:    "#16A34A",
  greenBg:  "#052E16",
  red:      "#DC2626",
  sideW:    280,
};

const STATUS_A: Record<string, { bg: string; color: string }> = {
  "Новая":             { bg: "#1E3A5F", color: "#7DD3FC" },
  "Активна":           { bg: "#052E16", color: "#4ADE80" },
  "Выбор исполнителя": { bg: "#1C0F00", color: "#FCD34D" },
  "Завершена":         { bg: "#1C1917", color: "#78716C" },
};

/* ────────────────────────────────────────────────────────────────────────
   Данные
   ──────────────────────────────────────────────────────────────────────── */
type Status = "Новая" | "Активна" | "Выбор исполнителя" | "Завершена";

interface Request {
  id: number; type: string; short: string; client: string;
  city: string; price: number; priceDisplay: string;
  deadline: number; status: Status; verified: boolean; bids: number;
}

const ALL: Request[] = [
  { id: 1,  type: "Инженерно-геодезические работы",         short: "Геодезия",  client: "ТОО «КазСтрой»",      city: "Алматы",  price: 850000,  priceDisplay: "850 000 ₸",   deadline: 15, status: "Активна",             verified: true,  bids: 4  },
  { id: 2,  type: "Инженерно-геологические изыскания",      short: "Геология",  client: "АО «ПроектСтандарт»", city: "Астана",  price: 1200000, priceDisplay: "1 200 000 ₸", deadline: 30, status: "Выбор исполнителя",   verified: true,  bids: 7  },
  { id: 3,  type: "Геофизическая съёмка участка",           short: "Геофизика", client: "ТОО «ДевСтрой»",      city: "Шымкент", price: 650000,  priceDisplay: "650 000 ₸",   deadline: 20, status: "Новая",               verified: false, bids: 0  },
  { id: 4,  type: "Топографическая съёмка территории",      short: "Геодезия",  client: "ИП Сидоров А. Н.",    city: "Алматы",  price: 450000,  priceDisplay: "450 000 ₸",   deadline: 10, status: "Активна",             verified: true,  bids: 2  },
  { id: 5,  type: "Инженерно-экологические изыскания",      short: "Экология",  client: "ТОО «ЭкоПроект»",     city: "Алматы",  price: 320000,  priceDisplay: "320 000 ₸",   deadline: 25, status: "Активна",             verified: true,  bids: 3  },
  { id: 6,  type: "Государственная геодезическая привязка", short: "Геодезия",  client: "АО «ГосПроект КЗ»",   city: "Астана",  price: 2400000, priceDisplay: "2 400 000 ₸", deadline: 45, status: "Активна",             verified: true,  bids: 11 },
  { id: 7,  type: "Инженерно-сейсмологические изыскания",   short: "Геофизика", client: "ТОО «СтройКонсалт»",  city: "Алматы",  price: 980000,  priceDisplay: "980 000 ₸",   deadline: 60, status: "Новая",               verified: false, bids: 0  },
  { id: 8,  type: "Геодезические работы для ЖК «Арман»",   short: "Геодезия",  client: "ТОО «УрбанГрупп»",    city: "Астана",  price: 750000,  priceDisplay: "750 000 ₸",   deadline: 12, status: "Выбор исполнителя",   verified: true,  bids: 5  },
  { id: 9,  type: "Литологическое бурение и опробование",   short: "Геология",  client: "АО «ГеоМастер»",      city: "Актобе",  price: 1850000, priceDisplay: "1 850 000 ₸", deadline: 90, status: "Активна",             verified: true,  bids: 6  },
  { id: 10, type: "Мониторинг деформаций здания",           short: "Геофизика", client: "ТОО «ТехНадзор»",     city: "Алматы",  price: 420000,  priceDisplay: "420 000 ₸",   deadline: 7,  status: "Активна",             verified: true,  bids: 2  },
];

/* ────────────────────────────────────────────────────────────────────────
   Сайдбар
   ──────────────────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { label: "Лента заявок",  active: true  },
  { label: "Мои отклики",   active: false },
  { label: "Договоры",      active: false },
  { label: "Аналитика",     active: false },
  { label: "Профиль",       active: false },
];

function Sidebar() {
  const stats = [
    { n: 94,  label: "Открытых заявок",  color: A.sky  },
    { n: 4,   label: "Ваших откликов",   color: A.gold },
    { n: 12,  label: "Новых сегодня",    color: "#4ADE80" },
  ];
  return (
    <aside style={{ width: A.sideW, flexShrink: 0, background: A.bgSide, borderRight: `1px solid ${A.border}`, display: "flex", flexDirection: "column", minHeight: "100vh", position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
      {/* Логотип */}
      <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${A.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 32, height: 32, background: A.gold, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={A.bgSide} strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>
              <line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 15, fontWeight: 700, color: A.text }}>EOSpatial</div>
            <div style={{ fontSize: 10, color: A.textMuted, fontFamily: "var(--font-source), sans-serif" }}>Платформа изысканий</div>
          </div>
        </div>
      </div>

      {/* Навигация */}
      <nav style={{ padding: "12px 10px", flex: 1 }}>
        {NAV_ITEMS.map(item => (
          <div key={item.label} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 12px", borderRadius: 8, marginBottom: 2,
            cursor: "pointer", transition: "background 150ms",
            background: item.active ? "rgba(202,138,4,0.12)" : "transparent",
            borderLeft: item.active ? `3px solid ${A.gold}` : "3px solid transparent",
          }}>
            <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, fontWeight: item.active ? 600 : 400, color: item.active ? A.gold : A.textSec }}>
              {item.label}
            </span>
          </div>
        ))}
      </nav>

      {/* Статистика */}
      <div style={{ padding: "16px 20px", borderTop: `1px solid ${A.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: A.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-source), sans-serif", marginBottom: 12 }}>
          Активность
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stats.map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: A.bgCard, borderRadius: 8, border: `1px solid ${A.border}` }}>
              <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, color: A.textSec }}>{s.label}</span>
              <span style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 18, fontWeight: 700, color: s.color }}>{s.n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Профиль + вход */}
      <div style={{ padding: "16px 20px", borderTop: `1px solid ${A.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 34, height: 34, background: A.gold, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-lexend), sans-serif", fontSize: 13, fontWeight: 700, color: A.bgSide }}>Н</div>
          <div>
            <div style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 13, fontWeight: 600, color: A.text }}>Нурланов Е.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: A.gold, fontFamily: "var(--font-source), sans-serif" }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Верифицирован
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <input readOnly placeholder="Email или телефон" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 12, fontFamily: "var(--font-source), sans-serif", background: A.bgCard, border: `1px solid ${A.border}`, borderRadius: 7, color: A.text, outline: "none" }}/>
        </div>
        <button style={{ width: "100%", padding: "9px", background: A.gold, color: A.bgSide, border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, fontFamily: "var(--font-lexend), sans-serif", cursor: "pointer" }}>
          Войти
        </button>
      </div>
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Горизонтальная карточка заявки
   ──────────────────────────────────────────────────────────────────────── */
function AuthorityCard({ r }: { r: Request }) {
  const [hov, setHov] = useState(false);
  const sc = STATUS_A[r.status];
  const isGold = r.verified;
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 0,
        background: hov ? A.bgCardHov : A.bgCard,
        borderRadius: 10, overflow: "hidden", cursor: "pointer",
        border: `1px solid ${isGold ? "rgba(202,138,4,0.35)" : A.border}`,
        borderLeft: `4px solid ${isGold ? A.gold : A.border}`,
        boxShadow: isGold ? "0 0 0 1px rgba(202,138,4,0.08)" : "none",
        transition: "background 150ms, box-shadow 150ms",
      }}
    >
      {/* Левая колонка: тип + название + заказчик */}
      <div style={{ flex: 1, minWidth: 0, padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ padding: "2px 8px", borderRadius: 100, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-source), sans-serif", background: A.bgPage, color: A.sky, border: `1px solid rgba(14,165,233,0.25)` }}>
            {r.short}
          </span>
          <span style={{ padding: "2px 8px", borderRadius: 100, fontSize: 10, fontWeight: 600, fontFamily: "var(--font-source), sans-serif", background: sc.bg, color: sc.color }}>
            {r.status}
          </span>
          {isGold && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 100, fontSize: 10, fontWeight: 700, color: A.gold, background: A.goldBg, border: `1px solid rgba(202,138,4,0.3)`, fontFamily: "var(--font-source), sans-serif" }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Верифицирован
            </span>
          )}
        </div>
        <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-lexend), sans-serif", fontSize: 14, fontWeight: 600, color: A.text, lineHeight: 1.35 }}>
          {r.type}
        </h3>
        <span style={{ fontSize: 12, color: A.textSec, fontFamily: "var(--font-source), sans-serif" }}>
          {r.client}
          <span style={{ color: A.textMuted, margin: "0 6px" }}>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {r.city}
          </span>
        </span>
      </div>

      {/* Средняя колонка: срок + отклики */}
      <div style={{ width: 140, padding: "16px 0", textAlign: "center", borderLeft: `1px solid ${A.border}`, borderRight: `1px solid ${A.border}` }}>
        <div style={{ fontFamily: "var(--font-lexend), sans-serif", fontSize: 20, fontWeight: 700, color: A.text }}>{r.deadline}</div>
        <div style={{ fontSize: 11, color: A.textMuted, fontFamily: "var(--font-source), sans-serif", marginBottom: 8 }}>дней</div>
        <div style={{ fontSize: 11, color: A.textSec, fontFamily: "var(--font-source), sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
          {r.bids} откликов
        </div>
      </div>

      {/* Правая колонка: цена + действие */}
      <div style={{ width: 200, padding: "16px 20px", textAlign: "right" }}>
        <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: isGold ? A.gold : A.text, marginBottom: 10 }}>
          {r.priceDisplay}
        </div>
        {!isGold && (
          <div style={{ fontSize: 11, color: A.red, marginBottom: 8, fontFamily: "var(--font-source), sans-serif", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Не верифицирован
          </div>
        )}
        <button style={{ padding: "8px 18px", background: hov ? A.gold : "transparent", color: hov ? A.bgSide : A.gold, border: `1.5px solid ${A.gold}`, borderRadius: 7, fontSize: 12, fontWeight: 700, fontFamily: "var(--font-lexend), sans-serif", cursor: "pointer", transition: "all 150ms", whiteSpace: "nowrap" }}>
          Откликнуться
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Главный экран — split layout
   ──────────────────────────────────────────────────────────────────────── */
export default function AuthorityScreen() {
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort]                 = useState("date");
  const [page, setPage]                 = useState(1);
  const PER = 10;

  let filtered = ALL.filter(r => !verifiedOnly || r.verified);
  if (sort === "price_asc")  filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (sort === "price_desc") filtered = [...filtered].sort((a, b) => b.price - a.price);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));
  const pageRows   = filtered.slice((page - 1) * PER, page * PER);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: A.bgPage }}>
      <Sidebar />

      {/* Основной контент */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Шапка контента */}
        <div style={{ padding: "18px 28px", borderBottom: `1px solid ${A.border}`, display: "flex", alignItems: "center", gap: 16, background: A.bgPage, position: "sticky", top: 0, zIndex: 20 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-lexend), sans-serif", fontSize: 20, fontWeight: 700, color: A.text }}>
            Лента заявок
          </h1>
          <span style={{ padding: "3px 10px", background: A.bgCard, border: `1px solid ${A.border}`, borderRadius: 100, fontSize: 12, color: A.textSec, fontFamily: "var(--font-source), sans-serif" }}>
            {filtered.length}
          </span>

          <div style={{ flex: 1 }} />

          {/* Только верифицированные */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "var(--font-source), sans-serif", fontSize: 13, color: A.textSec }}>
            <div
              onClick={() => { setVerifiedOnly(!verifiedOnly); setPage(1); }}
              style={{ width: 36, height: 20, borderRadius: 100, background: verifiedOnly ? A.gold : A.border, position: "relative", transition: "background 200ms", cursor: "pointer", flexShrink: 0 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: verifiedOnly ? 19 : 3, transition: "left 200ms" }} />
            </div>
            Только верифицированные
          </label>

          {/* Сортировка */}
          <select value={sort} onChange={e => setSort(e.target.value)} style={{ padding: "6px 28px 6px 10px", fontSize: 12, fontFamily: "var(--font-source), sans-serif", background: A.bgCard, border: `1px solid ${A.border}`, borderRadius: 7, color: A.textSec, cursor: "pointer", outline: "none", appearance: "none" }}>
            <option value="date">По дате ↓</option>
            <option value="price_asc">Цена: возрастание</option>
            <option value="price_desc">Цена: убывание</option>
          </select>

          <button style={{ padding: "8px 18px", background: A.gold, color: A.bgSide, border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, fontFamily: "var(--font-lexend), sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
            + Разместить заявку
          </button>
        </div>

        {/* Список карточек */}
        <div style={{ padding: "20px 28px", flex: 1 }}>
          {/* Подзаголовок */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: A.border }} />
            <span style={{ fontSize: 11, color: A.textMuted, fontFamily: "var(--font-source), sans-serif", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
              Золотая рамка — верифицированный заказчик
            </span>
            <div style={{ flex: 1, height: 1, background: A.border }} />
          </div>

          {pageRows.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: A.textMuted, fontSize: 15, fontFamily: "var(--font-source), sans-serif" }}>
              Нет заявок по выбранным фильтрам
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pageRows.map(r => <AuthorityCard key={r.id} r={r} />)}
            </div>
          )}

          {/* Пагинация */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 6, paddingTop: 28 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${p === page ? A.gold : A.border}`, background: p === page ? A.gold : "transparent", color: p === page ? A.bgSide : A.textSec, cursor: "pointer", fontSize: 13, fontWeight: p === page ? 700 : 400, fontFamily: "var(--font-source), sans-serif", transition: "all 150ms" }}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Нижний бар */}
        <div style={{ padding: "14px 28px", borderTop: `1px solid ${A.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-source), sans-serif", fontSize: 12, color: A.textMuted }}>
            © 2026 EOSpatial · Маркетплейс инженерных изысканий Казахстана
          </span>
          <div style={{ display: "flex", gap: 20 }}>
            {["Условия", "Конфиденциальность", "Поддержка"].map(l => (
              <a key={l} href="#" style={{ fontSize: 12, color: A.textMuted, textDecoration: "none", fontFamily: "var(--font-source), sans-serif" }}>{l}</a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
