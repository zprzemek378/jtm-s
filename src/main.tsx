import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { applyFontChoice, readFontChoice } from "./settings/font";
import "./styles/global.scss";

// Before the first render, so the interface is never seen in one font and then
// another. The theme does the same thing from a script in index.html; a font
// can wait this long because it swaps in without moving anything.
applyFontChoice(readFontChoice());

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Could not find the #root element in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
