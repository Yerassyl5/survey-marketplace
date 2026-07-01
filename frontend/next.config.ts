import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// В деве браузер всегда стучится на свой origin (/api/...), Next.js
// сам проксирует запрос на backend по внутреннему docker-адресу.
// Так же ведёт себя прод (там /api роутит Coolify, минуя Next.js) —
// фронтенд-коду не нужно знать разницу между окружениями и не нужен CORS.
const internalApiUrl = process.env.INTERNAL_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Django-эндпоинты требуют завершающий слэш (APPEND_SLASH). Без этого флага
  // Next.js сам 308-редиректит /api/.../ → /api/... до применения rewrite,
  // а Django в ответ редиректит обратно — бесконечный пинг-понг между ними.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          // ":path*" при реконструкции destination теряет завершающий слэш —
          // добавляем его явно литералом, все эндпоинты Django его требуют.
          source: "/api/:path*",
          destination: `${internalApiUrl}/api/:path*/`,
        },
      ],
    };
  },
};

export default withNextIntl(nextConfig);
