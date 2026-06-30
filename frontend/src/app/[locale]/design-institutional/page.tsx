import { Lexend, Source_Sans_3 } from "next/font/google";
import InstitutionalScreen from "../institutional/Screen";

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

export default function DesignInstitutionalPage() {
  return (
    <div className={`${lexend.variable} ${sourceSans3.variable}`}>
      <InstitutionalScreen />
    </div>
  );
}
