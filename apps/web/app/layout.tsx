import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { RecheckOnRestore } from "./recheck-on-restore";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Media Canvas",
  description: "Design static visual assets, and generate them in bulk.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="grid min-h-screen place-items-center px-4 py-8">
        <RecheckOnRestore />
        {children}
      </body>
    </html>
  );
}
