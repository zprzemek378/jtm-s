import { useContext } from "react";

import { SpotifyContext, type SpotifyContextValue } from "./SpotifyContext";

export function useSpotify(): SpotifyContextValue {
  const context = useContext(SpotifyContext);

  if (!context) {
    throw new Error("useSpotify must be used inside <SpotifyProvider>");
  }

  return context;
}
