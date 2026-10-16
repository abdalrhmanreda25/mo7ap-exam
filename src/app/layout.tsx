import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "mo7ap exam",
    template: "%s | mo7ap exam",
  },
  description: "منصة امتحانات مُحاب للثانوية العامة",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" dir="rtl" />
      </body>
    </html>
  );
}
