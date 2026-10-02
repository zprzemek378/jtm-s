import { SpotifyProvider } from '@/spotify/SpotifyProvider'

import { AppLayout } from './AppLayout'

/**
 * The route element for everything inside the app. The Spotify provider sits
 * above the layout, so the sidebar can show the connection state, and inside
 * the router, so it can send the browser back to the right page after the
 * Spotify redirect.
 */
export function AppShell() {
  return (
    <SpotifyProvider>
      <AppLayout />
    </SpotifyProvider>
  )
}
