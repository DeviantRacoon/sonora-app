import { Icon } from '@iconify/react'
import close from '@iconify-icons/solar/close-circle-bold-duotone'
import { useEffect, useState } from 'react'
import { batchFileUrl, retryApi } from '../api.js'
import MotionLogo from './MotionLogo.jsx'
const label = { queued: 'En cola', downloading: 'Descargando', done: 'Completada', error: 'Error' }
export default function DownloadQueue({ jobs, batches, open, onClose }) {
  const [error, setError] = useState('')
  useEffect(() => { if (!open) return; const key = (e) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [open, onClose])
  const retry = async (jid) => { try { setError(''); const result = await retryApi(jid); if (!result.ok) throw new Error('No se pudo reintentar la descarga') } catch (e) { setError(e.message) } }
  return <div className={`drawer-layer ${open ? 'open' : ''}`} aria-hidden={!open} inert={!open ? '' : undefined}>
    <button className="drawer-scrim" onClick={onClose} aria-label="Cerrar descargas" tabIndex={open ? 0 : -1} />
    <aside className="drawer" aria-label="Descargas"><header><div><span className="section-kicker">TU MÚSICA</span><h2>Descargas <span>{jobs.length}</span></h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar descargas"><Icon icon={close} width="22" aria-hidden="true" /></button></header>
      {error && <p className="notice error" role="alert">{error}</p>}
      <ul>{!batches.length && <li className="queue-empty">Aún no hay descargas.<br /><span>Tu música aparecerá aquí.</span></li>}{batches.map((batch) => <li className="batch" key={batch.bid}>
        <div className="batch-heading"><strong>{batch.title}</strong><span>{batch.complete}/{batch.total}</span></div>
        <div className="progress-track" role="progressbar" aria-label={`Progreso de ${batch.title}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={batch.percent}><div style={{ width: `${batch.percent}%` }} /></div>
        <div className="job-meta"><span>{batch.ready ? (batch.failed ? `${batch.failed} con error` : 'Lista') : 'Preparando descarga'}</span>{batch.ready && batch.available && <a className="text-button" href={batchFileUrl(batch.bid)} download>Descargar {batch.total === 1 ? 'MP3' : 'ZIP'}</a>}</div>
        <ul>{jobs.filter((j) => j.bid === batch.bid).map((j) => <li className="job" key={j.jid}><div className="job-title"><span className="job-motion"><MotionLogo loading={j.status === 'downloading'} complete={j.status === 'done'} /></span><strong>{j.title}</strong><span>{j.status === 'downloading' ? `${Math.round(j.percent)}%` : ''}</span></div><div className="job-meta"><span>{label[j.status]}</span>{j.status === 'error' && <button className="text-button" onClick={() => retry(j.jid)}>Reintentar</button>}</div>{j.error && <p className="job-error">{j.error}</p>}</li>)}</ul>
      </li>)}</ul>
    </aside>
  </div>
}
