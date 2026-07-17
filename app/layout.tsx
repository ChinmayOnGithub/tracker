import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import ThemeScript from "@/components/ThemeScript";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Operations Tracker",
  description: "Track monthly, weekly, daily, and yearly activities, subscriptions, habits, and workouts in one place.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tracker",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased subpixel-antialiased dark"
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} min-h-full flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 selection:bg-slate-200 dark:selection:bg-zinc-800 selection:text-slate-900 dark:selection:text-white transition-colors duration-200`}>
        {children}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(
                  function(reg) {
                    console.log('SW registered:', reg.scope);
                  },
                  function(err) {
                    console.log('SW registration failed:', err);
                  }
                );
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
