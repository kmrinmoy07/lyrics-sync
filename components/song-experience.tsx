"use client";

import type HlsType from "hls.js";
import Image from "next/image";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type TimedLyric = {
  time: number;
  text: string;
};

export type Song = {
  id: string;
  title: string;
  artist: string;
  release: string;
  audioUrl: string;
  imageUrl: string | null;
  timedLyrics: TimedLyric[];
  plainLyrics: string;
};

type LoadState = "idle" | "loading" | "ready" | "error";

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

function SearchIcon() {
  return (
    <Icon size={18}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16.2 16.2 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </Icon>
  );
}

function MusicIcon({ size = 20 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M9 18V6.8l10-2V16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <circle cx="6.5" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </Icon>
  );
}

function BackIcon() {
  return (
    <Icon>
      <path d="m15 18-6-6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </Icon>
  );
}

function PlayIcon() {
  return (
    <Icon size={25}>
      <path d="m9 7 8 5-8 5V7Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
    </Icon>
  );
}

function PauseIcon() {
  return (
    <Icon size={24}>
      <path d="M9 7v10M15 7v10" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
    </Icon>
  );
}

function SkipBackIcon() {
  return (
    <Icon>
      <path d="M6 6v12M18 7l-8 5 8 5V7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </Icon>
  );
}

function SkipForwardIcon() {
  return (
    <Icon>
      <path d="M18 6v12M6 7l8 5-8 5V7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </Icon>
  );
}

function VolumeIcon() {
  return (
    <Icon size={18}>
      <path d="M5 10v4h3l4 3V7l-4 3H5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M15 9.2a4 4 0 0 1 0 5.6M17.5 7a7 7 0 0 1 0 10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </Icon>
  );
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function audioSource(url: string) {
  return `/api/audio?url=${encodeURIComponent(url)}`;
}

function hashSong(song: Song) {
  const value = `${song.id}:${song.title}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function SongArtwork({ song, size = "small" }: { song: Song; size?: "small" | "large" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hash = hashSong(song);
  const style = {
    "--cover-hue-a": `${hash % 360}`,
    "--cover-hue-b": `${(hash + 72 + (hash % 58)) % 360}`,
  } as CSSProperties;
  const initial = Array.from(song.title.trim())[0] || "♪";

  useEffect(() => setImageFailed(false), [song.imageUrl]);

  if (song.imageUrl && !imageFailed) {
    return (
      <div className={`song-artwork artwork-${size}`}>
        {/* A plain image supports any future image_url host without config changes. */}
        <img
          alt={`${song.title} cover`}
          loading={size === "small" ? "lazy" : "eager"}
          onError={() => setImageFailed(true)}
          src={song.imageUrl}
        />
      </div>
    );
  }

  return (
    <div
      aria-label={`Generated artwork for ${song.title}`}
      className={`song-artwork artwork-${size} artwork-generated`}
      role="img"
      style={style}
    >
      <span className="artwork-ring" />
      <span className="artwork-initial">{initial}</span>
      <span className="artwork-note"><MusicIcon size={size === "large" ? 24 : 14} /></span>
    </div>
  );
}

function findActiveLyric(lines: TimedLyric[], currentTime: number) {
  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].time <= currentTime + 0.08) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}

export function SongExperience({ songs }: { songs: Song[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [playerError, setPlayerError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const lyricRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingAutoplay = useRef(false);

  const selectedSong = useMemo(
    () => songs.find((song) => song.id === selectedId) ?? null,
    [selectedId, songs],
  );

  const filteredSongs = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return songs;
    return songs.filter((song) =>
      `${song.title} ${song.artist} ${song.release}`.toLocaleLowerCase().includes(term),
    );
  }, [query, songs]);

  const activeLyric = useMemo(
    () => findActiveLyric(selectedSong?.timedLyrics ?? [], currentTime),
    [currentTime, selectedSong],
  );

  const writeSongToUrl = useCallback((songId: string | null) => {
    const url = new URL(window.location.href);
    if (songId) url.searchParams.set("song", songId);
    else url.searchParams.delete("song");
    window.history.replaceState({}, "", url);
  }, []);

  const chooseSong = useCallback(
    (songId: string | null, shouldAutoplay = false) => {
      pendingAutoplay.current = shouldAutoplay;
      setSelectedId(songId);
      writeSongToUrl(songId);
    },
    [writeSongToUrl],
  );

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("song");
    if (requestedId && songs.some((song) => song.id === requestedId)) {
      setSelectedId(requestedId);
    }
  }, [songs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !selectedSong) return;

    let cancelled = false;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadState("loading");
    setPlayerError("");
    lyricRefs.current = [];

    const attachAudio = async () => {
      const { default: Hls } = await import("hls.js");
      if (cancelled) return;

      if (!Hls.isSupported()) {
        if (audio.canPlayType("application/vnd.apple.mpegurl")) {
          audio.src = audioSource(selectedSong.audioUrl);
          audio.load();
          return;
        }

        setLoadState("error");
        setPlayerError("This browser cannot play the song stream.");
        return;
      }

      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(audioSource(selectedSong.audioUrl));
      hls.attachMedia(audio);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setLoadState("error");
        setPlayerError("The audio stream could not be loaded. Try another song or check your connection.");
        hls.destroy();
      });
    };

    attachAudio().catch(() => {
      if (!cancelled) {
        setLoadState("error");
        setPlayerError("The audio player could not be initialized.");
      }
    });

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [selectedSong]);

  useEffect(() => {
    if (activeLyric < 0) return;
    lyricRefs.current[activeLyric]?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
  }, [activeLyric]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || loadState === "error") return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlayerError("Playback was blocked. Tap play once more when the song is ready.");
      }
    } else {
      audio.pause();
    }
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const moveInQueue = useCallback(
    (direction: -1 | 1, autoplay = isPlaying) => {
      if (!selectedSong) return;
      const index = songs.findIndex((song) => song.id === selectedSong.id);
      const nextIndex = (index + direction + songs.length) % songs.length;
      chooseSong(songs[nextIndex].id, autoplay);
    },
    [chooseSong, isPlaying, selectedSong, songs],
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Image
          alt="Baahi"
          className="brand-mark"
          height={44}
          priority
          src="/baahi-logo.png"
          width={44}
        />
        <div className="brand-copy">
          <strong>Baahi Sync</strong>
          <span>Listen between the lines</span>
        </div>
        <div className="catalog-pill">
          <span className="live-dot" />
          {songs.length} songs · synced from Excel
        </div>
      </header>

      <main className={`workspace ${selectedSong ? "has-selection" : ""}`}>
        <aside className="library-pane" aria-label="Song library">
          <div className="library-heading">
            <div>
              <span className="eyebrow">Your library</span>
              <h1>Find your song</h1>
            </div>
            <span className="song-total">{filteredSongs.length}</span>
          </div>

          <label className="search-box">
            <SearchIcon />
            <span className="sr-only">Search songs or artists</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search songs or artists"
              type="search"
              value={query}
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery("")} type="button">×</button>
            )}
          </label>

          <div className="song-list" role="list">
            {filteredSongs.map((song, index) => (
              <button
                aria-current={song.id === selectedId ? "true" : undefined}
                className="song-row"
                key={song.id}
                onClick={() => chooseSong(song.id)}
                role="listitem"
                type="button"
              >
                <span className="track-number">{String(index + 1).padStart(2, "0")}</span>
                <SongArtwork song={song} />
                <span className="song-row-copy">
                  <strong>{song.title}</strong>
                  <span>{song.artist.replaceAll(",", " · ")}</span>
                </span>
                <span className="song-row-play"><PlayIcon /></span>
              </button>
            ))}

            {!filteredSongs.length && (
              <div className="empty-search">
                <MusicIcon size={28} />
                <strong>No songs found</strong>
                <span>Try a title, artist, or release name.</span>
              </div>
            )}
          </div>
        </aside>

        <section className="detail-pane" aria-label="Now playing">
          {selectedSong ? (
            <>
              <div className="player-hero">
                <button className="mobile-back" onClick={() => chooseSong(null)} type="button">
                  <BackIcon /> Library
                </button>

                <SongArtwork size="large" song={selectedSong} />

                <div className="song-heading">
                  <div className="release-line">
                    <span>{selectedSong.release}</span>
                    {selectedSong.timedLyrics.length > 0 && <span className="sync-chip">Synced lyrics</span>}
                  </div>
                  <h2>{selectedSong.title}</h2>
                  <p>{selectedSong.artist.replaceAll(",", " · ")}</p>
                </div>

                <div className="player-controls">
                  <div className="main-controls">
                    <button aria-label="Previous song" className="control-button" onClick={() => moveInQueue(-1)} type="button">
                      <SkipBackIcon />
                    </button>
                    <button
                      aria-label={isPlaying ? "Pause" : "Play"}
                      className="play-button"
                      disabled={loadState === "error"}
                      onClick={togglePlayback}
                      type="button"
                    >
                      {isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </button>
                    <button aria-label="Next song" className="control-button" onClick={() => moveInQueue(1)} type="button">
                      <SkipForwardIcon />
                    </button>
                  </div>

                  <div className="timeline">
                    <span>{formatTime(currentTime)}</span>
                    <input
                      aria-label="Song progress"
                      max={duration || 0}
                      min="0"
                      onChange={(event) => seekTo(Number(event.target.value))}
                      step="0.01"
                      style={{ "--range-progress": `${progress}%` } as CSSProperties}
                      type="range"
                      value={Math.min(currentTime, duration || 0)}
                    />
                    <span>{formatTime(duration)}</span>
                  </div>

                  <label className="volume-control">
                    <VolumeIcon />
                    <span className="sr-only">Volume</span>
                    <input
                      max="1"
                      min="0"
                      onChange={(event) => {
                        const nextVolume = Number(event.target.value);
                        setVolume(nextVolume);
                        if (audioRef.current) audioRef.current.volume = nextVolume;
                      }}
                      step="0.05"
                      style={{ "--range-progress": `${volume * 100}%` } as CSSProperties}
                      type="range"
                      value={volume}
                    />
                  </label>
                </div>

                <audio
                  crossOrigin="anonymous"
                  onCanPlay={() => {
                    setLoadState("ready");
                    if (pendingAutoplay.current) {
                      pendingAutoplay.current = false;
                      audioRef.current?.play().catch(() => undefined);
                    }
                  }}
                  onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
                  onEnded={() => moveInQueue(1, true)}
                  onError={() => {
                    if (loadState !== "idle") {
                      setLoadState("error");
                      setPlayerError("The audio stream is unavailable right now.");
                    }
                  }}
                  onPause={() => setIsPlaying(false)}
                  onPlay={() => {
                    setIsPlaying(true);
                    setPlayerError("");
                  }}
                  onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                  preload="metadata"
                  ref={audioRef}
                />
              </div>

              <div className="lyrics-card">
                <div className="lyrics-titlebar">
                  <div>
                    <span className="eyebrow">Live lyrics</span>
                    <h3>{selectedSong.timedLyrics.length ? "Follow along" : "Lyrics"}</h3>
                  </div>
                  <span className={`player-status status-${loadState}`}>
                    <i />
                    {loadState === "loading" ? "Loading audio" : loadState === "error" ? "Audio unavailable" : isPlaying ? "Playing now" : "Ready"}
                  </span>
                </div>

                {playerError && <p className="player-error" role="alert">{playerError}</p>}

                {selectedSong.timedLyrics.length ? (
                  <div className="lyrics-scroll" aria-live="off">
                    <div className="lyrics-spacer" />
                    {selectedSong.timedLyrics.map((line, index) => (
                      <button
                        aria-current={index === activeLyric ? "true" : undefined}
                        className={`lyric-line ${index === activeLyric ? "active" : ""} ${index < activeLyric ? "passed" : ""}`}
                        key={`${line.time}-${index}`}
                        onClick={() => seekTo(line.time)}
                        ref={(element) => { lyricRefs.current[index] = element; }}
                        type="button"
                      >
                        <span>{line.text}</span>
                        <small>{formatTime(line.time)}</small>
                      </button>
                    ))}
                    <div className="lyrics-spacer" />
                  </div>
                ) : (
                  <div className="plain-lyrics">
                    <p className="sync-note">Timed lyrics are not available for this song yet.</p>
                    {selectedSong.plainLyrics.split(/\r?\n/).filter(Boolean).map((line, index) => (
                      <p key={`${line}-${index}`}>{line}</p>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="welcome-state">
              <div className="vinyl-visual" aria-hidden="true">
                <span className="vinyl-groove groove-one" />
                <span className="vinyl-groove groove-two" />
                <span className="vinyl-center">
                  <Image alt="" className="welcome-brand-logo" height={72} src="/baahi-logo.png" width={72} />
                </span>
              </div>
              <span className="eyebrow">The words move with you</span>
              <h2>Pick a song.<br />Catch every line.</h2>
              <p>Select a track from the library to start listening with lyrics timed to the music.</p>
              <div className="welcome-stats">
                <span><strong>{songs.length}</strong> songs</span>
                <span><strong>{songs.filter((song) => song.timedLyrics.length).length}</strong> synced</span>
                <span><strong>HLS</strong> audio</span>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
