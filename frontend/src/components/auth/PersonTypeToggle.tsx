"use client";

/* ────────────────────────────────────────────────────────────────────────
   PersonTypeToggle.tsx — переключатель "Физическое лицо / Юридическое лицо".
   От выбора зависит, какое поле показывается ниже (ИИН / БИН) — см.
   backend/apps/accounts/serializers.py::BaseRegistrationSerializer.validate.
   ──────────────────────────────────────────────────────────────────────── */

export type PersonTypeValue = "individual" | "legal";

export interface PersonTypeToggleProps {
  value: PersonTypeValue;
  onChange: (value: PersonTypeValue) => void;
}

const OPTIONS: { value: PersonTypeValue; label: string }[] = [
  { value: "individual", label: "Физическое лицо" },
  { value: "legal", label: "Юридическое лицо" },
];

export function PersonTypeToggle({ value, onChange }: PersonTypeToggleProps) {
  return (
    <div role="radiogroup" aria-label="Тип лица" style={{ display: "flex", gap: 8 }}>
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--ds-r-md)",
              border: `1px solid ${active ? "var(--ds-blue)" : "var(--ds-border-str)"}`,
              background: active ? "var(--ds-blue)" : "var(--ds-bg-white)",
              color: active ? "#FFFFFF" : "var(--ds-text-sec)",
              fontFamily: "var(--ds-font-body)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 150ms, border-color 150ms, color 150ms",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
