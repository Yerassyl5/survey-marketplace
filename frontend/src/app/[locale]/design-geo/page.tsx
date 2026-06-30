import { Plus_Jakarta_Sans } from "next/font/google";
import GeoScreen from "./Screen";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

export default function DesignGeoPage() {
  return (
    <div className={plusJakarta.variable}>
      <GeoScreen />
    </div>
  );
}
