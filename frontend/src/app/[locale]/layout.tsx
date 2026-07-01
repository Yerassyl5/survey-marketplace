import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { Lexend, Source_Sans_3 } from "next/font/google";

import { routing } from "@/i18n/routing";
import { AuthProvider } from "@/contexts/AuthContext";
import "../globals.css";

/* Шрифты загружаются один раз на уровне root layout.
   CSS-переменные --font-lexend и --font-source доступны всем дочерним компонентам.
   Страницы НЕ должны импортировать шрифты повторно. */
const lexend = Lexend({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lexend",
  display: "swap",
});

const sourceSans3 = Source_Sans_3({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-source",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ПроГео",
  description: "Маркетплейс инженерных изысканий · Казахстан",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${lexend.variable} ${sourceSans3.variable}`}
    >
      <body>
        <NextIntlClientProvider>
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
