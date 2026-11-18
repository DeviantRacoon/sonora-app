import { Icon } from '@iconify/react'
import sun from '@iconify-icons/solar/sun-bold-duotone'
import moon from '@iconify-icons/solar/moon-bold-duotone'
import download from '@iconify-icons/solar/arrow-down-to-line-bold-duotone'
import searchIcon from '@iconify-icons/solar/magnifer-line-duotone'
import arrowUp from '@iconify-icons/solar/arrow-right-up-line-duotone'
import arrowLeft from '@iconify-icons/solar/alt-arrow-left-bold-duotone'
import play from '@iconify-icons/solar/play-bold-duotone'
import pause from '@iconify-icons/solar/pause-bold-duotone'
import next from '@iconify-icons/solar/skip-next-bold-duotone'
import previous from '@iconify-icons/solar/skip-previous-bold-duotone'
import close from '@iconify-icons/solar/close-circle-bold-duotone'
import heart from '@iconify-icons/solar/heart-bold'
import checkCircle from '@iconify-icons/solar/check-circle-bold'
import { useEffect, useRef, useState } from 'react'
import { searchApi, playlistApi, downloadApi, batchFileUrl, audioUrl, fmt, useJobs } from './api.js'
import { cached } from './cache.js'
import settings from '@iconify-icons/solar/settings-bold-duotone'
import home from '@iconify-icons/solar/home-2-bold-duotone'
import { transitionView } from './motion.js'
import Home from './components/Home.jsx'
import Preferences from './components/Preferences.jsx'
import TrackRow from './components/TrackRow.jsx'
import DownloadQueue from './components/DownloadQueue.jsx'

import { profileRequest, recordTaste, recordDownloads, setPersonalization, eraseProfile, personalizationEnabled } from './personalization.js'

import Logo from './components/MotionLogo.jsx'

function updateUrl(query, playlist = '') {
  const url = new URL(window.location.href)
  query ? url.searchParams.set('q', query) : url.searchParams.delete('q')
  playlist ? url.searchParams.set('playlist', playlist) : url.searchParams.delete('playlist')
  if (url.href !== window.location.href) window.history.pushState(null, '', url)
}

export default function App() {
  const [recommendations, setRecommendations] = useState({ tracks: [], preferences: {}, state: 'learning' })
  const [personalized, setPersonalized] = useState(personalizationEnabled)
  const [settingsOpen, setSettingsOpen] = useState(() => new URLSearchParams(window.location.search).get('view') === 'settings')
  const openSettings = () => {
    if (settingsOpen) return
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'settings')
    window.history.pushState({ settings: true }, '', url)
    setSettingsOpen(true); window.scrollTo(0, 0)
  }
  const closeSettings = () => {
    if (window.history.state?.settings) window.history.back()
    else {
      const url = new URL(window.location.href)
      url.searchParams.delete('view')
      window.history.replaceState(null, '', url)
      setSettingsOpen(false)
    }
  }
  const [profileError, setProfileError] = useState('')
  const refreshRecommendations = () => profileRequest('/recommendations').then(setRecommendations).catch(() => setProfileError('Las recomendaciones no están disponibles por ahora.'))
  useEffect(() => {
    if (!personalized) return
    let active = true
    const refresh = () => profileRequest('/recommendations').then(data => { if (active) { setRecommendations(data); setProfileError('') } }).catch(() => { if (active) setProfileError('Las recomendaciones no están disponibles por ahora.') })
    refresh()
    const timer = setInterval(refresh, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [personalized])
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [searched, setSearched] = useState('')
  const [album, setAlbum] = useState(null)
  const [sel, setSel] = useState(new Map())
  const [pending, setPending] = useState('')
  const [searchingQuery, setSearchingQuery] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState({ title: '', detail: '' })
  const [error, setError] = useState('')
  const [queueOpen, setQueueOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [playerExpanded, setPlayerExpanded] = useState(false)
  const [playQueue, setPlayQueue] = useState([])
  const [playing, setPlaying] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const audio = useRef(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const player = useRef(null)
  const playerPanel = useRef(null)
  const collapseButton = useRef(null)
  const previousFocus = useRef(null)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem('sonora-searches') || '[]') } catch { return [] } })
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const input = useRef(null)
  const request = useRef(0)
  const cache = useRef({ searches: new Map(), playlists: new Map() })
  const { jobs, batches } = useJobs()
  const [initiated, setInitiated] = useState([])
  const downloaded = useRef(new Set())
  const [queueMessage, setQueueMessage] = useState(null)
  const toastId = useRef(0)
  const showToast = (text) => setQueueMessage({ text, id: ++toastId.current })
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'downloading').length

  useEffect(() => {
    for (const batch of batches) {
      if (!initiated.includes(batch.bid) || !batch.ready || downloaded.current.has(batch.bid)) continue
      downloaded.current.add(batch.bid)
      if (batch.available) {
        const link = document.createElement('a')
        link.href = batchFileUrl(batch.bid)
        link.download = ''
        document.body.appendChild(link)
        link.click()
        link.remove()
        showToast('Tu descarga está lista.')
        if (batch.failed) setError('Algunas canciones fallaron. Revisa la cola para reintentar.')
      } else setError('No se pudo completar la descarga. Revisa la cola para reintentar.')
    }
  }, [batches, initiated])
  useEffect(() => {
    if (!queueMessage) return
    const timer = setTimeout(() => setQueueMessage(null), 4250)
    return () => clearTimeout(timer)
  }, [queueMessage])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('sonora-theme', theme) }, [theme])
  useEffect(() => {
    const h = (e) => { if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) { e.preventDefault(); input.current?.focus() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  useEffect(() => {
    const onMessage = (event) => {
      if (!showVideo || event.origin !== 'https://www.youtube-nocookie.com' || event.source !== player.current?.contentWindow) return
      try {
        const data = JSON.parse(event.data)
        const state = data.event === 'onStateChange' ? data.info : data.info?.playerState
        if (typeof state === 'number') setPlaying(state === 1)
      } catch { /* Other player messages are not necessarily JSON. */ }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [showVideo])
  const playAudio = () => {
    setAudioError('')
    audio.current?.play().catch(error => {
      if (error.name === 'AbortError') return
      setAudioLoading(false)
      setAudioError(error.name === 'NotAllowedError' ? 'Pulsa reproducir para iniciar el audio.' : 'No se pudo reproducir la canción. Vuelve a intentarlo.')
    })
  }
  const startTrack = track => {
    setPlaying(false); setShowVideo(false); setPreview(track); setPosition(0); setDuration(0)
    audio.current.src = audioUrl(track.id)
    audio.current.load()
    playAudio()
  }
  const selectPreview = (track) => {
    setPlayQueue(tracks); startTrack(track)
    if (window.matchMedia('(max-width: 650px)').matches) { previousFocus.current = document.activeElement; setPlayerExpanded(true) }
  }
  const listened = useRef({ id: null, seconds: 0, sent: false })
  useEffect(() => {
    if (listened.current.id !== preview?.id) listened.current = { id: preview?.id, seconds: 0, sent: false }
    if (!preview || !playing) return
    const timer = setInterval(() => {
      const current = listened.current
      if (++current.seconds >= 30 && !current.sent) { current.sent = true; recordTaste(preview, 'play') }
    }, 1000)
    return () => clearInterval(timer)
  }, [preview, playing])
  const preference = async (track, kind) => {
    try { await profileRequest(`/profile/preferences/${track.id}`, 'PUT', { track: { id:track.id,title:track.title,channel:track.channel || '' }, kind: recommendations.preferences[track.id] === kind ? null : kind }); await refreshRecommendations() }
    catch { setProfileError('No se pudo guardar tu preferencia.') }
  }
  const collapsePlayer = () => { setPlayerExpanded(false); previousFocus.current?.focus() }
  useEffect(() => {
    if (!playerExpanded) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    collapseButton.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') { collapsePlayer(); return }
      if (event.key !== 'Tab') return
      const controls = [...playerPanel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), iframe:not([tabindex="-1"])')].filter((item) => item.getClientRects().length)
      if (!controls.length) return
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKey) }
  }, [playerExpanded])
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 650px)')
    const onResize = () => { if (!mobile.matches) setPlayerExpanded(false) }
    mobile.addEventListener('change', onResize)
    return () => mobile.removeEventListener('change', onResize)
  }, [])
  const playerCommand = (func) => player.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube-nocookie.com')
  const playerReady = () => {
    const target = player.current?.contentWindow
    target?.postMessage(JSON.stringify({ event: 'listening' }), 'https://www.youtube-nocookie.com')
    target?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }), 'https://www.youtube-nocookie.com')
  }

  const search = async (value, { restore = false, playlist = '' } = {}) => {
    const query = value.trim().slice(0, 200)
    if (!query || (!restore && pending === 'search' && query === searchingQuery)) return
    const id = ++request.current
    if (!restore) updateUrl(query)
    setQ(query); setSearchingQuery(query); setSuggestionsOpen(false); setLoadingMessage({ title: 'Buscando tu música', detail: `Estamos buscando “${query}”` }); setPending('search'); setError(''); setAlbum(null); setSel(new Map())
    if (!restore) {
      const next = [query, ...recent.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 6)
      setRecent(next); localStorage.setItem('sonora-searches', JSON.stringify(next))
    }
    try {
      const [data, selected] = await Promise.all([cached(cache.current.searches, query, () => searchApi(query)), playlist ? cached(cache.current.playlists, playlist, () => playlistApi(playlist)) : null])
      if (id === request.current) {
        setResults(data); setSearched(query); setAlbum(selected)
        if (selected) setSel(new Map(selected.tracks.map((t) => [t.id, t])))
      }
    } catch (e) { if (id === request.current) setError(e.message) }
    finally { if (id === request.current) setPending('') }
  }
  const openAlbum = async (p) => {
    const id = ++request.current
    updateUrl(searched, p.id)
    setLoadingMessage({ title: 'Abriendo playlist', detail: 'Estamos preparando las pistas para ti.' }); setPending('album'); setError('')
    try { const a = await cached(cache.current.playlists, p.id, () => playlistApi(p.id)); if (id === request.current) { setAlbum(a); setSel(new Map(a.tracks.map((t) => [t.id, t]))) } }
    catch (e) { if (id === request.current) setError(e.message) }
    finally { if (id === request.current) setPending('') }
  }
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search)
      const settings = params.get('view') === 'settings'
      setSettingsOpen(settings)
      if (settings) return
      const query = params.get('q')?.trim()
      if (query) search(query, { restore: true, playlist: params.get('playlist') || '' })
      else { request.current++; setQ(''); setResults(null); setSearched(''); setAlbum(null); setSel(new Map()); setPending(''); setError('') }
    }
    restore()
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  const toggle = (t) => setSel((p) => { const n = new Map(p); n.has(t.id) ? n.delete(t.id) : n.set(t.id, t); return n })
  const tracks = album ? album.tracks : results?.videos || (personalized ? recommendations.tracks : [])
  const currentTrack = playQueue.findIndex((track) => track.id === preview?.id)
  const skip = (offset) => { const track = playQueue[currentTrack + offset]; if (track) startTrack(track) }
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    if (preview && 'MediaMetadata' in window) session.metadata = new MediaMetadata({ title: preview.title, artist: preview.channel || '', album: 'Sonora', artwork: preview.thumb ? [{ src: preview.thumb }] : [] })
    else session.metadata = null
    session.playbackState = preview ? (playing ? 'playing' : 'paused') : 'none'
    const handlers = preview && !showVideo ? {
      play: playAudio, pause: () => audio.current.pause(),
      previoustrack: currentTrack > 0 ? () => skip(-1) : null,
      nexttrack: currentTrack >= 0 && currentTrack < playQueue.length - 1 ? () => skip(1) : null,
      seekto: details => { if (Number.isFinite(audio.current.duration)) audio.current.currentTime = Math.max(0, Math.min(audio.current.duration, details.seekTime)) },
    } : {}
    for (const action of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']) {
      try { session.setActionHandler(action, handlers[action] || null) } catch { /* Unsupported actions vary by browser. */ }
    }
    return () => { for (const action of Object.keys(handlers)) { try { session.setActionHandler(action, null) } catch {} } }
  }, [preview, playing, showVideo, currentTrack, playQueue])
  useEffect(() => {
    if ('audioSession' in navigator) navigator.audioSession.type = 'playback'
  }, [])
  const allOn = tracks.length > 0 && tracks.every((t) => sel.has(t.id))
  const send = async (items, albumName) => {
    if (sending) return
    if (items.length > 500) { setError('Selecciona hasta 500 canciones por descarga.'); return }
    setError(''); setSending(true)
    try { const batch = await downloadApi(items.map(({ id, title, index }) => ({ id, title, index })), albumName); recordDownloads(items); setInitiated((current) => [...current, batch.bid]); showToast('Añadido a descargas.'); setSel(new Map()) }
    catch (e) { setError(e.message) }
    finally { setSending(false) }
  }
  const suggestions = recent.filter((item) => item.toLowerCase().includes(q.toLowerCase()) && item.toLowerCase() !== q.toLowerCase())

  return <div className={`app-shell ${results || pending === 'search' || pending === 'album' ? 'is-browsing' : ''}`}>
    <header className="topbar">
      <a className="brand" href="/" aria-label="Sonora, inicio"><span className="brand-icon"><Logo /></span><span>sonora<span className="brand-dot">.</span></span></a>
      <div className="top-actions"><button className="icon-button" onClick={openSettings} aria-label="Abrir ajustes" title="Tu experiencia"><Icon icon={settings} width="22" aria-hidden="true" /></button><button className="icon-button theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro'} title="Cambiar tema"><Icon icon={theme === 'dark' ? sun : moon} width="22" aria-hidden="true" /></button><button className="queue-trigger" onClick={() => setQueueOpen(true)}><Icon icon={download} width="20" aria-hidden="true" /> Descargas <span className="count">{active}</span></button></div>
    </header>

    <audio ref={audio} preload="none" onPlaying={() => { setPlaying(true); setAudioLoading(false); setAudioError('') }} onPause={() => setPlaying(false)} onLoadStart={() => { setAudioLoading(true); setAudioError('') }} onWaiting={() => setAudioLoading(true)} onCanPlay={() => setAudioLoading(false)} onLoadedMetadata={() => setDuration(Number.isFinite(audio.current.duration) ? audio.current.duration : 0)} onTimeUpdate={() => setPosition(audio.current.currentTime)} onEnded={() => { setPlaying(false); skip(1) }} onError={() => { setPlaying(false); setAudioLoading(false); setAudioError('No se pudo cargar el audio. Pulsa reproducir para reintentar.') }} />
    <main className="workspace" hidden={settingsOpen}>
      <nav className="music-navigation" aria-label="Navegación principal"><button className={!results ? 'active' : ''} aria-label="Inicio" aria-current={!results ? 'page' : undefined} onClick={() => transitionView(() => { request.current++; updateUrl(''); setResults(null); setAlbum(null); setSel(new Map()); setQ(''); setPending(''); setError('') })}><Icon icon={home} width="20" /><span>Inicio</span></button></nav>
      <section className="search-area" aria-label="Buscar música">
        <form className="search-box" onSubmit={(e) => { e.preventDefault(); search(q) }}>
          <Icon className="search-icon" icon={searchIcon} width="24" aria-hidden="true" /><label className="sr-only" htmlFor="music-search">Canción, artista o álbum</label><input id="music-search" ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSuggestionsOpen(true) }} onFocus={() => setSuggestionsOpen(true)} onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)} autoComplete="off" placeholder="Canción o artista" /><kbd className="keyboard-shortcut">/</kbd><button className="primary-button" type="submit" disabled={!q.trim() || (pending === 'search' && q.trim().slice(0, 200) === searchingQuery)}>Buscar <Icon icon={arrowUp} width="18" aria-hidden="true" /></button>
        </form>
        {suggestionsOpen && suggestions.length > 0 && <div className="suggestions"><span>BÚSQUEDAS RECIENTES</span>{suggestions.map((item) => <button key={item} onMouseDown={(e) => e.preventDefault()} onClick={() => search(item)}><Icon icon={arrowUp} width="18" aria-hidden="true" /> <span>{item}</span></button>)}</div>}
        <p className="search-hint">Busca canciones, artistas o playlists <span className="keyboard-shortcut">· Presiona <kbd>/</kbd> para buscar</span></p>
      </section>

      {!album && results?.partial && <div className="notice" role="status">No se pudieron cargar las playlists; los resultados son parciales.</div>}
      {album?.truncated && <div className="notice" role="status">Esta playlist muestra sus primeras 500 canciones.</div>}

      {error && <div className="notice error" role="alert">{error}</div>}
      {sending && <div className="loading-line" role="status"><Logo loading /><span>Preparando descargas…</span></div>}
      <div className={`content-layout ${results ? 'has-results' : ''} ${preview ? 'has-preview' : ''} ${pending === 'search' || pending === 'album' ? 'is-searching' : ''}`}>
        <div className="results-area">
          <div className={`search-loading ${pending === 'search' || pending === 'album' ? 'is-visible' : ''}`} aria-hidden={pending !== 'search' && pending !== 'album'}><div className="loader-orbit"><span className="loader-ring" /><span className="loader-ring loader-ring-outer" /><Logo loading={pending === 'search' || pending === 'album'} /></div><span className="loading-kicker">UN MOMENTO</span><h2>{loadingMessage.title}</h2><p>{loadingMessage.detail}</p><span className="loading-dots" aria-hidden="true"><i /><i /><i /></span></div>
          <span className="sr-only" role="status">{pending === 'search' || pending === 'album' ? loadingMessage.title : ''}</span>
        <div className="results" aria-busy={pending === 'search' || pending === 'album'} inert={pending === 'search' || pending === 'album' ? '' : undefined}>
          {!results && <Home tracks={recommendations.tracks} preferences={recommendations.preferences} enabled={personalized} state={recommendations.state} unavailable={!!profileError} recent={recent} onSearch={search} onPreview={selectPreview} onDownload={t => send([t])} onPreference={preference} onFocusSearch={() => input.current?.focus()} onSettings={openSettings} playingId={playing ? preview?.id : null} />}
          {results && <div key={album?.id || searched} className="view-enter">
            <div className="section-heading"><div><span className="section-kicker">{album ? 'TU SELECCIÓN' : 'EXPLORA TU MÚSICA'}</span><h2>{album ? album.title : <>Resultados para <span>“{searched}”</span></>}</h2></div>{album && <button className="text-button" onClick={() => transitionView(() => { updateUrl(searched); setAlbum(null); setSel(new Map()) })}><Icon icon={arrowLeft} width="16" aria-hidden="true" /> Volver a resultados</button>}</div>
            {!album && results.playlists.length > 0 && <section className="playlist-section"><div className="subheading"><h3>Álbumes y playlists</h3><span>UNA COLECCIÓN PARA CADA MOMENTO</span></div><div className="playlist-grid">{results.playlists.slice(0, 4).map((p) => <button key={p.id} onClick={() => openAlbum(p)} className="playlist-card"><div className="playlist-image">{p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : <Logo />}<span className="playlist-arrow"><Icon icon={arrowUp} width="18" aria-hidden="true" /></span></div><strong>{p.title}</strong><small>{p.channel || 'Playlist'}{p.count ? ` · ${p.count} pistas` : ''}</small></button>)}</div></section>}
            {tracks.length > 0 && <section className="track-section"><div className="subheading"><h3>{album ? 'Pistas de la playlist' : 'Canciones'}</h3><button className="text-button" onClick={() => setSel(allOn ? new Map() : new Map(tracks.map((t) => [t.id, t])))}>{allOn ? 'Quitar selección' : 'Seleccionar todo'}</button></div><div className="track-list">{tracks.map((t, i) => <TrackRow key={t.id} t={t} number={i + 1} checked={sel.has(t.id)} onToggle={() => toggle(t)} onPreview={() => selectPreview(t)} playing={playing && preview?.id === t.id} onDownload={() => send([t])} onLike={personalized ? () => preference(t,'like') : undefined} liked={recommendations.preferences[t.id] === 'like'} excluded={recommendations.preferences[t.id] === 'exclude'} onExclude={personalized ? () => preference(t,'exclude') : undefined} />)}</div></section>}
            {!tracks.length && (album || !results.playlists.length) && !pending && <div className="empty-results"><h3>No encontramos resultados.</h3><p>Prueba con otro título, artista o una búsqueda más corta.</p></div>}
          </div>}
        </div>
        </div>
        <aside className={`side-column ${playerExpanded ? 'player-expanded' : ''}`} ref={playerPanel} role={playerExpanded ? 'dialog' : undefined} aria-modal={playerExpanded ? 'true' : undefined} aria-label="Reproductor">
          <div className="side-label"><button ref={collapseButton} className="player-collapse" onClick={collapsePlayer} aria-label="Volver a resultados"><Icon icon={arrowLeft} width="22" aria-hidden="true" /></button><span>{preview ? 'TU REPRODUCTOR' : 'EN REPRODUCCIÓN'}</span>{preview && <button className="player-expand" onClick={() => { previousFocus.current = document.activeElement; setPlayerExpanded(true) }} aria-label="Abrir reproductor"><Icon icon={arrowUp} width="20" aria-hidden="true" /></button>}</div>
          <div className={`player-card ${preview ? 'has-preview' : ''}`}>
            <div className={`player-placeholder ${showVideo && preview ? 'show-video' : ''}`}>
              <div className={`record ${playing ? 'record-playing' : ''}`}>
                <div className="record-label">{preview?.thumb ? <img key={preview.id} src={preview.thumb} alt="" /> : <Logo />}</div>
              </div>
              {preview && showVideo && <div className={`video-wrap ${showVideo ? 'video-visible' : ''}`} aria-hidden={!showVideo}><iframe ref={player} key={preview.id} onLoad={playerReady} tabIndex={showVideo ? 0 : -1} src={`https://www.youtube-nocookie.com/embed/${preview.id}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`} title={`Vista previa de ${preview.title}`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div>}
            </div>
            <div className="player-info">
              {preview ? <><span className="live-label"><span /> {audioLoading && !showVideo ? 'PREPARANDO AUDIO…' : playing ? 'REPRODUCIENDO' : 'EN PAUSA'}</span><h3>{preview.title}</h3><p>{preview.channel}</p>{!showVideo && <div className="player-timeline"><label className="sr-only" htmlFor="playback-position">Posición de reproducción</label><input id="playback-position" type="range" min="0" max={duration || 0} step="1" value={Math.min(position, duration)} disabled={!duration} aria-valuetext={`${fmt(position) || '0:00'} de ${fmt(duration) || '0:00'}`} onChange={event => { audio.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)) }} /><div><span>{fmt(position) || '0:00'}</span><span>{fmt(duration) || '0:00'}</span></div></div>}{audioError && !showVideo && <p className="player-error" role="alert">{audioError}</p>}<div className="player-controls" aria-label="Controles de reproducción"><button className="player-skip" onClick={() => skip(-1)} disabled={currentTrack <= 0} aria-label="Canción anterior"><Icon icon={previous} width="22" aria-hidden="true" /></button><button className="player-play" onClick={() => { if (showVideo) playerCommand(playing ? 'pauseVideo' : 'playVideo'); else if (playing) audio.current.pause(); else { if (audio.current.error) audio.current.load(); playAudio() } }} aria-label={playing ? 'Pausar reproducción' : 'Reproducir'}><Icon icon={playing ? pause : play} width="22" aria-hidden="true" /></button><button className="player-skip" onClick={() => skip(1)} disabled={currentTrack < 0 || currentTrack >= playQueue.length - 1} aria-label="Canción siguiente"><Icon icon={next} width="22" aria-hidden="true" /></button></div>{personalized && <div className="player-preferences"><button className="preference-button" aria-pressed={recommendations.preferences[preview.id] === 'like'} onClick={() => preference(preview, 'like')}><Icon icon={heart} width="20" aria-hidden="true" /><span>Me gusta</span></button><button className="preference-button" aria-pressed={recommendations.preferences[preview.id] === 'exclude'} onClick={() => preference(preview, 'exclude')}><Icon icon={close} width="20" aria-hidden="true" /><span>No me interesa</span></button><button className="preference-button" onClick={() => send([preview])} aria-label={`Descargar ${preview.title}`}><Icon icon={download} width="20" aria-hidden="true" /></button></div>}<div className="player-actions"><button className="player-video-toggle" onClick={() => { if (showVideo) { setShowVideo(false); playAudio() } else { audio.current.pause(); setPlaying(false); setShowVideo(true) } }} aria-expanded={showVideo}>{showVideo ? 'Ver disco' : 'Ver video'}</button><button className="player-dismiss" onClick={() => { audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); setAudioError(''); setAudioLoading(false); setPreview(null); setPlaying(false); setShowVideo(false); setPlayerExpanded(false) }} aria-label="Cerrar reproductor"><Icon icon={close} width="20" aria-hidden="true" /></button></div></> : <><span className="side-kicker">DALE AL PLAY</span><h3>Escucha antes<br />de guardar.</h3><p>Elige una canción para reproducir una vista previa aquí.</p></>}
            </div>
          </div>
          <div className="side-caption"><span>HECHO PARA ESCUCHAR</span><span>01 / 01</span></div>
        </aside>
      </div>
    </main>
    <div className={`selection-bar ${sel.size && !settingsOpen ? 'visible' : ''}`} aria-hidden={!sel.size || settingsOpen}><span><strong>{sel.size}</strong> {sel.size === 1 ? 'canción seleccionada' : 'canciones seleccionadas'}</span><button className="primary-button" disabled={!sel.size || sending} onClick={() => send([...sel.values()], album?.title)}>Descargar {album ? 'playlist' : 'selección'} <Icon icon={download} width="18" aria-hidden="true" /></button></div>
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">{queueMessage && <div className="toast" key={queueMessage.id}><Icon icon={checkCircle} className="toast-icon" aria-hidden="true" /><span>{queueMessage.text}</span></div>}</div>
    <Preferences open={settingsOpen} onClose={closeSettings} enabled={personalized} error={profileError} onToggle={async () => { try { await setPersonalization(!personalized); setPersonalized(!personalized); setProfileError('') } catch { setProfileError('No se pudo actualizar tu perfil. Inténtalo de nuevo.') } }} onErase={async () => { try { await eraseProfile(); setPersonalized(false); setRecommendations({ tracks: [], preferences: {}, state: 'disabled' }); setProfileError('') } catch { setProfileError('No se pudo borrar el perfil. Inténtalo de nuevo.') } }} />
    <DownloadQueue jobs={jobs} batches={batches} open={queueOpen} onClose={() => setQueueOpen(false)} />
  </div>
}
