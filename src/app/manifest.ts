import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Comedor Digital",
    short_name: "Comedor",
    description: "Tiquetes digitales, validación QR y trazabilidad para el comedor de tu empresa.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f5f2ea",
    theme_color: "#0b2b25",
    lang: "es-CO",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Validar comedor", url: "/app/operador", description: "Escanear un QR o validar con PIN" },
      { name: "Mi QR", url: "/app/mi-qr", description: "Abrir mi tiquete digital" },
      { name: "Reportes", url: "/app/reportes", description: "Consultar consumos y exportar" },
    ],
  };
}
