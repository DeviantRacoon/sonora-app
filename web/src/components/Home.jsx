import { Icon } from '@iconify/react'
import play from '@iconify-icons/solar/play-bold-duotone'
import download from '@iconify-icons/solar/arrow-down-to-line-bold-duotone'
import heart from '@iconify-icons/solar/heart-bold'
import close from '@iconify-icons/solar/close-circle-bold-duotone'
import arrowUp from '@iconify-icons/solar/arrow-right-up-line-duotone'
import search from '@iconify-icons/solar/magnifer-line-duotone'

export default function Home({ tracks, preferences, enabled, state, unavailable, recent, onSearch, onPreview, onDownload, onPreference, onFocusSearch, onSettings, playingId }) {
  return <div className="music-home view-enter">
    <header className="home-heading"><h1>Qué bueno escucharte.</h1></header>
    <section aria-labelledby="for-you-title"><div className="home-section-heading"><div><h2 id="for-you-title">Hecho para ti</h2><p>{enabled ? 'Tu próxima escucha empieza aquí.' : 'Tu música, a tu manera.'}</p></div><button className="text-button" onClick={onSettings}>Personalizar</button></div>
      {enabled && tracks.length > 0 ? <div className="recommendation-grid view-enter">{tracks.map(track => <article className="music-card" key={track.id}>
        <button className="music-cover" onClick={() => onPreview(track)} aria-label={`Reproducir ${track.title}`}><img src={track.thumb} alt="" loading="lazy" /><span className="cover-play"><Icon icon={play} width="24" /></span>{playingId === track.id && <span className="card-playing">En reproducción</span>}</button>
        <h3>{track.title}</h3><p className="card-artist">{track.artist || track.channel || 'Artista desconocido'}</p><p className="card-reason">{track.reason}</p>
        <div className="card-actions"><button className="icon-button" onClick={() => onPreference(track,'like')} aria-label={`Me gusta ${track.title}`} aria-pressed={preferences[track.id] === 'like'}><Icon icon={heart} width="19" /></button><button className="icon-button" onClick={() => onDownload(track)} aria-label={`Descargar ${track.title}`}><Icon icon={download} width="20" /></button><button className="icon-button" aria-pressed={preferences[track.id] === 'exclude'} onClick={() => onPreference(track,'exclude')} aria-label={`No me interesa ${track.title}`}><Icon icon={close} width="20" /></button></div>
      </article>)}</div> : <div className="discovery-welcome view-enter"><div className="discovery-art" aria-hidden="true"><div className="discovery-vinyl"><span /></div></div><div className="discovery-copy"><span className="section-kicker">EL COMIENZO DE ALGO BUENO</span><h3>{!enabled ? 'Haz espacio para tus favoritos.' : unavailable || state === 'unavailable' ? 'La música sigue aquí.' : state === 'building' ? 'Tu selección está tomando forma.' : 'Tu mezcla empieza contigo.'}</h3><p>{!enabled ? 'Activa las recomendaciones cuando quieras descubrir música a tu medida.' : unavailable || state === 'unavailable' ? 'Ahora no podemos cargar tu selección. Puedes seguir buscando y escuchando.' : state === 'building' ? 'Estamos buscando canciones que conecten con tus gustos. Mientras tanto, sigue explorando.' : 'Escucha, descarga o marca tres canciones que te gusten. Nosotros ponemos los próximos descubrimientos.'}</p><button className="primary-button" onClick={enabled ? onFocusSearch : onSettings}>{enabled ? (state === 'building' || unavailable || state === 'unavailable' ? 'Buscar música' : 'Encuentra tu primera canción') : 'Personalizar mi experiencia'}<Icon icon={enabled ? search : heart} width="18" /></button></div></div>}
    </section>
    {recent.length > 0 && <section className="recent-section" aria-labelledby="recent-title"><h2 id="recent-title">Vuelve a lo que te mueve</h2><div className="recent-grid">{recent.slice(0,6).map((query,i) => <button key={query} onClick={() => onSearch(query)}><span className={`recent-art recent-art-${i % 3}`}><Icon icon={search} width="24" /></span><strong>{query}</strong><Icon className="recent-arrow" icon={arrowUp} width="18" /></button>)}</div></section>}
  </div>
}
