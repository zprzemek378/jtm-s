import { BackendProvider } from "@/backend/BackendProvider";
import { SpotifyProvider } from "@/spotify/SpotifyProvider";

import { AppLayout } from "./AppLayout";

/**
 * The route element for everything inside the app. The Spotify provider sits
 * above the layout, so the sidebar can show the connection state, and inside
 * the router, so it can send the browser back to the right page after the
 * Spotify redirect.
 *
 * Our own backend sits inside Spotify's provider, because the only account
 * anybody has here is their Spotify one: signing in to the backend means
 * proving that, so it needs a connected Spotify to do it with.
 */
export function AppShell() {
  return (
    <SpotifyProvider>
      <BackendProvider>
        <AppLayout />
      </BackendProvider>
    </SpotifyProvider>
  );
}
