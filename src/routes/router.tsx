import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { GamePage } from "@/pages/GamePage";
import { HomePage } from "@/pages/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SettingsPage } from "@/pages/SettingsPage";

import { ROUTES } from "./paths";

export const router = createBrowserRouter(
  [
    {
      path: ROUTES.home,
      element: <AppShell />,
      errorElement: <NotFoundPage />,
      children: [
        { index: true, element: <HomePage /> },
        { path: ROUTES.game, element: <GamePage /> },
        { path: ROUTES.settings, element: <SettingsPage /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ],
  // On GitHub Pages the app is served from /<repo>/, which Vite exposes here.
  { basename: import.meta.env.BASE_URL },
);
