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
      {/* Every page is one block on an otherwise empty field: a card the width
          of its content, or the editor spread as wide as it is allowed. */}
      <body className="grid min-h-screen place-items-center px-4 py-8">
        <RecheckOnRestore />
        {children}
      </body>
    </html>
  );
}
