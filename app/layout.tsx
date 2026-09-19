import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import ThemeScript from "@/components/ThemeScript";
import ClientProviders from "@/components/ClientProviders";
import { verifySession } from "@/lib/session";
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
  title: "Tracker",
  description: "Track monthly, weekly, daily, and yearly activities, subscriptions, habits, and workouts in one place.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tracker",
  },
  formatDetection: {
    telephone: false,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the authenticated userId without a DB round-trip.
  // verifySession() uses HMAC — it is safe to call here.
  // The userId is only used to key the StoreProvider (client-state isolation for #57).
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session_token')?.value
  const session = verifySession(sessionToken)
  const sessionUserId = session?.userId ?? null

  return (
    <html
      lang="en"
      className="h-full antialiased subpixel-antialiased dark"
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} min-h-full flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 selection:bg-slate-200 dark:selection:bg-zinc-800 selection:text-slate-900 dark:selection:text-white`}>
        <ClientProviders userId={sessionUserId}>
          {children}
        </ClientProviders>
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              if (window.location.hostname === 'localhost') {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  if (registrations.length === 0) return;
                  if (sessionStorage.getItem('sw-cleanup')) return;
                  sessionStorage.setItem('sw-cleanup', '1');
                  Promise.all(registrations.map(function(r) { return r.unregister(); }))
                    .then(function() {
                      console.log('Unregistered all service workers on localhost.');
                      sessionStorage.removeItem('sw-cleanup');
                      window.location.reload();
                    });
                });
              } else {
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
            }
          `}
        </Script>
      </body>
    </html>
  );
}
