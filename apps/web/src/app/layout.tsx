import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tunewick",
  description: "Discover more, listen better, connect deeper.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
