import { useContext } from "react";

import { BackendContext, type BackendContextValue } from "./BackendContext";

export function useBackend(): BackendContextValue {
  const context = useContext(BackendContext);

  if (!context) {
    throw new Error("useBackend must be used inside <BackendProvider>");
  }

  return context;
}
