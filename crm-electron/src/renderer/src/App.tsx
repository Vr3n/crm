import { lazy, Suspense } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell/AppShell";
import { PlaceholderPage } from "@/components/app-shell/PlaceholderPage";
import { TooltipProvider } from "@/components/ui/tooltip";

const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function page(label: string) {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <PlaceholderPage title={label} />
    </Suspense>
  );
}

const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
            <DashboardPage />
          </Suspense>
        ),
      },
      { path: "leads", element: page("Leads") },
      { path: "clients", element: page("Clients") },
      { path: "accounting/sales", element: page("Membership Sales") },
      { path: "accounting/receipts", element: page("Receipts") },
      { path: "logistics/services", element: page("Services") },
      { path: "logistics/products", element: page("Products") },
      { path: "logistics/inventory", element: page("Inventory") },
      { path: "settings", element: page("Settings") },
    ],
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
