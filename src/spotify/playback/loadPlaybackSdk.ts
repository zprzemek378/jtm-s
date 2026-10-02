// Loading the Web Playback SDK.
//
// The SDK is a script served by Spotify, not an npm package: it registers a
// player device inside this tab and hands audio over to a DRM-capable browser.
// It announces itself by calling `window.onSpotifyWebPlaybackSDKReady`, so the
// callback has to be in place before the script runs.

import { SPOTIFY_SDK_URL } from '@/constants/spotify'

let loader: Promise<void> | null = null

/** Resolves once `window.Spotify` is usable. Safe to call repeatedly. */
export function loadPlaybackSdk(): Promise<void> {
  if (loader) {
    return loader
  }

  loader = new Promise<void>((resolve, reject) => {
    if (window.Spotify) {
      resolve()

      return
    }

    window.onSpotifyWebPlaybackSDKReady = () => resolve()

    const script = document.createElement('script')
    script.src = SPOTIFY_SDK_URL
    script.async = true
    script.onerror = () => {
      // Let a later attempt retry from scratch, e.g. after the network returns.
      loader = null
      reject(new Error('Could not load the Spotify Web Playback SDK'))
    }

    document.head.append(script)
  })

  return loader
}
