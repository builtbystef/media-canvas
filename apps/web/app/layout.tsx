import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { RecheckOnRestore } from "./recheck-on-restore";

// The face the shadcn preset ships. `next/font` self-hosts it — the browser
// fetches nothing from Google — and defines this variable on the document
// element, which is what `globals.css` points Tailwind's `font-sans` at.
//
// Its own name, not `--font-sans`: the theme block already declares that one,
// on this same element, and a custom property whose value resolves to itself
// is a cycle CSS answers by dropping the property altogether.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Media Canvas",
  description: "Design static visual assets, and generate them in bulk.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      {/* Every page is one block on an otherwise empty field: a card the width
          of its content, or the editor spread as wide as it is allowed. */}
      <body className="grid min-h-screen place-items-center px-4 py-8">
        <RecheckOnRestore />
        {children}
      </body>
    </html>
  );
}
