import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gestao.gcp.ad - gestão operacional",
  description: "gestao.gcp.ad - gestão operacional"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
