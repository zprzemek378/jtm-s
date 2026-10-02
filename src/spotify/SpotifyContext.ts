import { createContext } from 'react'

import type { TranslationKey } from '@/i18n/translations'

import type { ScanProgress, ScanResult } from './playlistScan'
import type { PlaybackPosition, PlaylistSummary, PlaylistTracks, SpotifyUser } from './types'

/** How far the connection to Spotify has got. */
export const SpotifyStatus = {
  /** No Client ID is configured, so logging in is impossible. */
  Unconfigured: 'unconfigured',
  LoggedOut: 'logged-out',
  /** Exchanging the authorization code, or loading the profile. */
  Connecting: 'connecting',
  LoggedIn: 'logged-in',
} as const

export type SpotifyStatus = (typeof SpotifyStatus)[keyof typeof SpotifyStatus]

/** How far the browser player has got. */
export const PlayerStatus = {
  Idle: 'idle',
  Connecting: 'connecting',
  Ready: 'ready',
  Error: 'error',
} as const

export type PlayerStatus = (typeof PlayerStatus)[keyof typeof PlayerStatus]

/** An error the provider reports, ready to be handed to `t()`. */
export type SpotifyMessage = {
  key: TranslationKey
  params?: Record<string, string | number>
}

export type SpotifyContextValue = {
  status: SpotifyStatus
  user: SpotifyUser | null
  /** True when the account cannot stream — the SDK needs Premium. */
  needsPremium: boolean
  /** A translation key plus parameters, or null when nothing is wrong. */
  error: SpotifyMessage | null
  clearError: () => void
  login: (returnPath: string) => void
  logout: () => void
  /**
   * Re-reads the configured Client ID. The settings screen calls it after a
   * save, so a freshly entered ID takes effect without a page reload.
   */
  refreshClientId: () => void

  playerStatus: PlayerStatus
  /** Set once the browser device is registered with Spotify. */
  deviceId: string | null
  /** Boots the browser player; resolves when it is ready to receive a track. */
  connectPlayer: () => Promise<void>

  /** Starts a track on our device at the given position. */
  playTrackAt: (trackUri: string, positionMs: number) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  /** Jumps to a position in the track playing on our device. */
  seek: (positionMs: number) => Promise<void>
  /** Where playback stands right now, or null when nothing is loaded. */
  readPlayback: () => Promise<PlaybackPosition | null>

  fetchPlaylists: () => Promise<readonly PlaylistSummary[]>
  fetchPlaylistById: (playlistId: string) => Promise<PlaylistSummary>
  fetchTracks: (playlistId: string) => Promise<PlaylistTracks>

  /**
   * Reads a playlist the API will not list, by playing it silently and watching
   * the queue. Boots the browser player first, so it must be called from a user
   * gesture. Only reachable with safe mode switched off.
   */
  scanPlaylist: (
    playlistId: string,
    onProgress?: (progress: ScanProgress) => void,
  ) => Promise<ScanResult>
}

export const SpotifyContext = createContext<SpotifyContextValue | null>(null)
