import { Lexend, Source_Sans_3 } from "next/font/google";
import LandingScreen from "./Screen";

const lexend = Lexend({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lexend",
});
const sourceSans3 = Source_Sans_3({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-source",
});

export default function LandingPage() {
  return (
    <div className={`${lexend.variable} ${sourceSans3.variable}`}>
      <LandingScreen />
    </div>
  );
}
