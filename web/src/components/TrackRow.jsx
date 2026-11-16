import { Icon } from '@iconify/react'
import play from '@iconify-icons/solar/play-bold-duotone'
import download from '@iconify-icons/solar/arrow-down-to-line-bold-duotone'
import { fmt } from '../api.js'

export default function TrackRow({ t, number, checked, onToggle, onPreview, playing, onDownload }) {
  return <div className={`track-row ${checked ? 'selected' : ''}`}>
    <label className="track-check"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Seleccionar ${t.title}`} /><span>{String(number).padStart(2, '0')}</span></label>
    <button className="track-art" onClick={onPreview} aria-label={`Reproducir ${t.title}`}>{t.thumb && <img src={t.thumb} alt="" loading="lazy" />}<span><Icon icon={play} width="20" aria-hidden="true" /></span></button>
    <div className="track-details"><strong>{t.title}</strong><small>{t.channel || 'Artista desconocido'}</small></div>
    {playing && <span className="playing-label">REPRODUCIENDO</span>}
    <span className="duration">{fmt(t.duration) || '—'}</span>
    <button className="track-download" onClick={onDownload} aria-label={`Descargar ${t.title}`} title="Descargar"><Icon icon={download} width="20" aria-hidden="true" /></button>
  </div>
}
