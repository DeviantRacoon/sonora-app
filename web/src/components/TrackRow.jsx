import { Icon } from '@iconify/react'
import play from '@iconify-icons/solar/play-bold-duotone'
import heart from '@iconify-icons/solar/heart-bold'
import close from '@iconify-icons/solar/close-circle-bold-duotone'
import download from '@iconify-icons/solar/arrow-down-to-line-bold-duotone'
import { fmt } from '../api.js'

export default function TrackRow({ t, number, checked, onToggle, onPreview, playing, onDownload, onLike, liked, onExclude, excluded }) {
  return <div className={`track-row ${checked ? 'selected' : ''}`}>
    <label className="track-check"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Seleccionar ${t.title}`} /><span>{String(number).padStart(2, '0')}</span></label>
    <button className="track-art" onClick={onPreview} aria-label={`Reproducir ${t.title}`}>{t.thumb && <img src={t.thumb} alt="" loading="lazy" />}<span><Icon icon={play} width="20" aria-hidden="true" /></span></button>
    <div className="track-details"><strong>{t.title}</strong><small>{t.channel || 'Artista desconocido'}</small></div>
    {playing && <span className="playing-label">REPRODUCIENDO</span>}
    <div className="track-preferences">
      {onLike && <button className="text-button track-preference" onClick={onLike} aria-pressed={!!liked} aria-label={`${liked ? 'Quitar me gusta de' : 'Me gusta'} ${t.title}`}><span className="desktop-preference" aria-hidden="true">{liked ? '♥' : '♡'}</span><span className="mobile-preference"><Icon icon={heart} width="20" aria-hidden="true" /><span>Me gusta</span></span></button>}
      {onExclude && <button className="text-button track-preference" onClick={onExclude} aria-pressed={!!excluded} aria-label={`${excluded ? 'Volver a recomendar' : 'No me interesa'} ${t.title}`}><span className="desktop-preference" aria-hidden="true">×</span><span className="mobile-preference"><Icon icon={close} width="20" aria-hidden="true" /><span>No me interesa</span></span></button>}
    </div>
    <span className="duration">{fmt(t.duration) || '—'}</span>
    <button className="track-download" onClick={onDownload} aria-label={`Descargar ${t.title}`} title="Descargar"><Icon icon={download} width="20" aria-hidden="true" /></button>
  </div>
}
