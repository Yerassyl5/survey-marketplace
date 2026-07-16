/* ────────────────────────────────────────────────────────────────────────
   FileLink.tsx — строка «иконка + имя + ссылка» для одного файла. Тупой
   презентационный компонент: имя и фолбэк на случай его отсутствия решает
   вызывающая сторона (у ResultFileList и блока ТЗ разные стратегии
   фолбэка — original_name с бэкенда vs имя, извлечённое из URL).
   ──────────────────────────────────────────────────────────────────────── */

export interface FileLinkProps {
  href: string;
  name: string;
}

export function FileLink({ href, name }: FileLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--ds-font-body)",
        fontSize: 14,
        fontWeight: 600,
        color: "var(--ds-blue)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {name}
    </a>
  );
}
