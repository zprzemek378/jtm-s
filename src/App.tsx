import { RouterProvider } from "react-router-dom";

import { LanguageProvider } from "./i18n/LanguageProvider";
import { router } from "./routes/router";
import { ThemeProvider } from "./theme/ThemeProvider";

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <RouterProvider router={router} />
      </LanguageProvider>
    </ThemeProvider>
  );
}
