import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import InstallApp from './InstallApp.jsx'
import arrowLeft from '@iconify-icons/solar/alt-arrow-left-bold-duotone'

export default function Preferences({ open, onClose, enabled, onToggle, onErase, error }) {
  const heading = useRef(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setConfirm(false)
    const previousFocus = document.activeElement
    heading.current?.focus({ preventScroll: true })
    return () => previousFocus?.focus({ preventScroll: true })
  }, [open])
  const perform = async action => {
    setBusy(true)
    try { await action(); setConfirm(false) } finally { setBusy(false) }
  }
  return <main className="preferences-page view-enter" hidden={!open} aria-labelledby="preferences-title">
    <button className="text-button preferences-back" onClick={onClose}><Icon icon={arrowLeft} width="20" aria-hidden="true" /> Volver a mi música</button>
    <header className="preferences-header"><span className="section-kicker">A TU MANERA</span><h1 id="preferences-title" ref={heading} tabIndex={-1}>Tu experiencia</h1><p>Tu música, tus preferencias y tu espacio.</p></header>
    {error && <p className="notice error" role="status">{error}</p>}
    <div className="preferences-grid">
      <section className="preference-card install-card" aria-labelledby="install-title"><span className="section-kicker">EN ESTE DISPOSITIVO</span><h2 id="install-title">Lleva Sonora contigo</h2><p>Abre tu música desde la pantalla de inicio, sin buscar la pestaña.</p><InstallApp /><p className="settings-footnote">El audio puede continuar con la pantalla apagada. Para ver videos, mantén la app visible.</p></section>
      <section className="preference-card" aria-labelledby="recommendations-title"><span className="section-kicker">A TU GUSTO</span><h2 id="recommendations-title">Descubre más de lo que te gusta</h2><p>Sonora aprende de lo que escuchas, descargas y marcas como favorito.</p><button className="preference-toggle" role="switch" aria-checked={enabled} disabled={busy} onClick={() => perform(onToggle)}><span>Recomendaciones personales<small>{enabled ? 'Activadas en este navegador' : 'Desactivadas; tus gustos se conservan'}</small></span><span className="switch-track" aria-hidden="true"><span /></span></button></section>
      <section className="preference-card" aria-labelledby="privacy-title"><span className="section-kicker">TUS DATOS</span><h2 id="privacy-title">Tú tienes el control</h2><dl className="privacy-details"><div><dt>Actividad de escucha</dt><dd>Se conserva 90 días.</dd></div><div><dt>Favoritos y canciones descartadas</dt><dd>Se guardan hasta que los borres.</dd></div><div><dt>Perfil y descargas</dt><dd>Pertenecen a este navegador. No se comparten con otros dispositivos.</dd></div></dl></section>
      <section className="preference-card erase-section" aria-labelledby="erase-title"><span className="section-kicker">EMPEZAR DE NUEVO</span><h2 id="erase-title">Dale otro rumbo a tu música</h2><p>Borra tus gustos y recomendaciones y desactiva el aprendizaje. Esta acción no se puede deshacer.</p>{confirm ? <div className="erase-confirm"><p>¿Quieres borrar tus gustos y recomendaciones?</p><div><button className="text-button" disabled={busy} onClick={() => setConfirm(false)}>Cancelar</button><button className="danger-button" disabled={busy} onClick={() => perform(onErase)}>{busy ? 'Borrando…' : 'Sí, borrar mis gustos'}</button></div></div> : <button className="danger-button" disabled={busy} onClick={() => setConfirm(true)}>Borrar mis gustos</button>}</section>
    </div>
  </main>
}
