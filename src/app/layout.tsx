import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "Comedor Digital",
    template: "%s · Comedor Digital",
  },
  description:
    "Tiquetes digitales, validación QR y trazabilidad para el comedor de tu empresa. Sin filas, sin papeles y sin fraude.",
  applicationName: "Comedor Digital",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Comedor Digital",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0b2b25",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
