import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gestao.gpc.ad - gestão operacional",
  description: "gestao.gpc.ad - gestão operacional"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
