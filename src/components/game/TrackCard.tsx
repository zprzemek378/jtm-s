import { formatDuration } from '@/helpers/format'
import type { PooledTrack } from '@/helpers/trackUnion'
import { useLanguage } from '@/i18n/useLanguage'

import styles from './TrackCard.module.scss'

type TrackCardProps = {
  track: PooledTrack
  /** Where the snippet started, shown so the table can see how far in it was. */
  startPositionMs?: number
}

/** The answer: cover art, title, artist and where the track came from. */
export function TrackCard({ track, startPositionMs }: TrackCardProps) {
  const { t } = useLanguage()
  const { playlistNames } = track

  return (
    <div className={styles.card}>
      {track.albumImageUrl ? (
        <img className={styles.cover} src={track.albumImageUrl} alt="" width={96} height={96} />
      ) : (
        <span className={styles.coverFallback} aria-hidden="true">
          ♪
        </span>
      )}

      <div className={styles.text}>
        <strong className={styles.title}>{track.name}</strong>
        <span className={styles.artists}>{track.artists}</span>
        <span className={styles.meta}>
          {track.albumName ? `${track.albumName} · ` : ''}
          {startPositionMs === undefined
            ? formatDuration(track.durationMs)
            : `${formatDuration(startPositionMs)} / ${formatDuration(track.durationMs)}`}
        </span>

        {playlistNames.length > 0 ? (
          <span className={styles.source}>
            {t(playlistNames.length === 1 ? 'game.fromPlaylist' : 'game.fromPlaylists', {
              names: playlistNames.join(', '),
            })}
          </span>
        ) : null}
      </div>
    </div>
  )
}
