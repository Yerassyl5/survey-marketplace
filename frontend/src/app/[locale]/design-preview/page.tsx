import {
  Lexend,
  Source_Sans_3,
  Plus_Jakarta_Sans,
  Poppins,
  Open_Sans,
} from "next/font/google";
import DesignPreviewClient from "./DesignPreviewClient";

const lexend = Lexend({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-lexend",
});

const sourceSans3 = Source_Sans_3({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-source",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-jakarta",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
});

const openSans = Open_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-open",
});

export default function DesignPreviewPage() {
  const fontVars = [
    lexend.variable,
    sourceSans3.variable,
    plusJakarta.variable,
    poppins.variable,
    openSans.variable,
  ].join(" ");

  return (
    <div className={fontVars}>
      <DesignPreviewClient />
    </div>
  );
}
