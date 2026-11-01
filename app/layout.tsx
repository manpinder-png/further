import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { StoreProvider } from "@/lib/client/store";
import TopBar from "@/components/shell/TopBar";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Further",
  description: "Your feed knows what keeps you scrolling. Further knows what you're trying to understand.",
};
export const viewport: Viewport = { themeColor: "#0a0a0b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable}`}>
      <body className="flex h-dvh flex-col overflow-hidden">
        <StoreProvider>
          <TopBar />
          <main className="relative min-h-0 flex-1">{children}</main>
        </StoreProvider>
      </body>
    </html>
  );
}
