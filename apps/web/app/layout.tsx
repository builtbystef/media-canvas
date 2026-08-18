import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { RecheckOnRestore } from "./recheck-on-restore";

export const metadata: Metadata = {
  title: "Media Canvas",
  description: "Design static visual assets, and generate them in bulk.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RecheckOnRestore />
        {children}
      </body>
    </html>
  );
}
