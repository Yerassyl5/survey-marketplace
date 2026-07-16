"use client";

/* ────────────────────────────────────────────────────────────────────────
   InfoTooltip.tsx — иконка «?» (button, в tab-order) + всплывающая подсказка
   по hover/focus. Открывается по mouseenter/focus, закрывается по
   mouseleave/blur/Escape; onClick — явный toggle-фолбэк для тача (фокус по
   тапу на iOS Safari не всегда надёжен), заодно закрывает по повторному
   тапу на саму иконку.

   Позиционирование: компонент НЕ создаёт свой position:relative-враппер под
   размер иконки — панель подсказки (position:absolute; left:0; right:0)
   позиционируется относительно БЛИЖАЙШЕГО спозиционированного предка.
   Вызывающая сторона оборачивает иконку в контейнер с position:"relative"
   той ширины, на которую должна растянуться подсказка (см.
   MyBidStatusPanel — строка heading+иконка, растянутая на всю ширину
   баннера по умолчанию flex-column align-items:stretch) — так подсказка в
   узком сайдбаре 320px всегда влезает по горизонтали, без центрирования
   относительно иконки и риска обрезания сбоку.

   visibility/opacity вместо условного рендера — id не исчезает из DOM,
   aria-describedby не рвётся. pointer-events:none ПОСТОЯННО (не только при
   закрытом состоянии): внутри панели нет интерактивного контента, ловить
   мышь/клики ей незачем в любом состоянии — открытие/закрытие держится на
   событиях самой кнопки-иконки, не на наведении на панель.
   ──────────────────────────────────────────────────────────────────────── */

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";

export interface InfoTooltipProps {
  text: string;
  /** Куда раскрывается панель относительно иконки. По умолчанию вниз. */
  placement?: "top" | "bottom";
}

export function InfoTooltip({ text, placement = "bottom" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      e.currentTarget.blur();
    }
  }

  return (
    <>
      <button
        type="button"
        aria-describedby={id}
        aria-label="Почему так?"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "1px solid currentColor",
          background: "transparent",
          color: "inherit",
          fontFamily: "var(--ds-font-body)",
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
          cursor: "pointer",
          padding: 0,
        }}
      >
        ?
      </button>
      <span
        id={id}
        role="tooltip"
        aria-hidden={!open}
        style={{
          position: "absolute",
          [placement === "bottom" ? "top" : "bottom"]: "calc(100% + 8px)",
          left: 0,
          right: 0,
          visibility: open ? "visible" : "hidden",
          opacity: open ? 1 : 0,
          pointerEvents: "none",
          transition: "opacity 120ms ease",
          zIndex: "var(--ds-z-modal)",
          padding: "10px 12px",
          borderRadius: "var(--ds-r-md)",
          background: "var(--ds-bg-white)",
          border: "1px solid var(--ds-border)",
          boxShadow: "var(--ds-shadow-lg)",
          color: "var(--ds-text-sec)",
          fontFamily: "var(--ds-font-body)",
          fontSize: 12,
          fontWeight: 400,
          lineHeight: 1.5,
        }}
      >
        {text}
      </span>
    </>
  );
}
