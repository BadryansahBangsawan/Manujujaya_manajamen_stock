import { Toaster } from "@Manujujaya-Manajemen-stock/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import Header from "@/components/header";
import { LanguageProvider } from "@/components/language-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "Manujujaya Analytics",
      },
      {
        name: "description",
        content: "Dashboard analitik stok spare part dan bengkel dengan rekomendasi pembelian.",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        forcedTheme="light"
        enableSystem={false}
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <LanguageProvider>
          <div className="min-h-svh bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.16),_transparent_36%),linear-gradient(180deg,_rgba(248,250,252,1),_rgba(241,245,249,1))] text-foreground dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_32%),linear-gradient(180deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]">
            <Header />
            <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-8 lg:px-6">
              <Outlet />
            </main>
          </div>
          <Toaster richColors />
        </LanguageProvider>
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
    </>
  );
}
