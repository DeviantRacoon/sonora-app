import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import InstallApp from './InstallApp.jsx'
import close from '@iconify-icons/solar/close-circle-bold-duotone'

export default function Preferences({ open, onClose, enabled, onToggle, onErase, error }) {
  const dialog = useRef(null)
  const [closing, setClosing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) { dialog.current.close(); return }
    setClosing(false)
    setConfirm(false)
    dialog.current.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])
  const finishClose = () => { dialog.current.close(); setClosing(false); onClose() }
  useEffect(() => {
    if (!closing) return
    // Fallback si el navegador o una hoja externa desactiva la animación.
    const timer = setTimeout(finishClose, 350)
    return () => clearTimeout(timer)
  }, [closing])
  const requestClose = () => setClosing(true)
  const perform = async action => {
    setBusy(true)
    try { await action(); setConfirm(false) } finally { setBusy(false) }
  }
  return <dialog ref={dialog} className={`preferences-dialog ${closing ? 'is-closing' : ''}`} onClose={() => { if (!dialog.current.open) { setClosing(false); onClose() } }} onCancel={e => { e.preventDefault(); requestClose() }} onAnimationEnd={e => { if (closing && e.target === dialog.current && e.animationName === 'preferences-exit') finishClose() }} onClick={e => { if (e.target === dialog.current) requestClose() }} aria-labelledby="preferences-title">
    <div className="preferences-inner">
      <header><div><span className="section-kicker">A TU MANERA</span><h2 id="preferences-title">Tu experiencia</h2></div><button className="icon-button" onClick={requestClose} aria-label="Cerrar ajustes" autoFocus><Icon icon={close} width="24" /></button></header>
      <section><h3>Sonora en tu dispositivo</h3><p>Instala la app para abrirla desde tu pantalla de inicio. Tus descargas pertenecen a este navegador. El audio puede seguir con la pantalla apagada; el video requiere mantener la app visible.</p><InstallApp /></section>
      <section><h3>Recomendaciones personales</h3><p>Una selección que aprende de lo que escuchas, descargas y marcas como favorito en este navegador.</p><button className="preference-toggle" role="switch" aria-checked={enabled} disabled={busy} onClick={() => perform(onToggle)}><span>Personalizar mi música</span><span className="switch-track" aria-hidden="true"><span /></span></button></section>
      <section className="privacy-note"><h3>Tú tienes el control</h3><p>Tu actividad se conserva 90 días. Los gustos y las canciones que descartes se guardan hasta que los borres. Este perfil pertenece a este navegador.</p></section>
      <section className="erase-section"><h3>Empezar de nuevo</h3><p>Borra tus gustos y recomendaciones y desactiva el aprendizaje.</p>{confirm ? <div className="erase-confirm"><p>¿Borrar tus gustos? Esta acción no se puede deshacer.</p><div><button className="text-button" disabled={busy} onClick={() => setConfirm(false)}>Cancelar</button><button className="danger-button" disabled={busy} onClick={() => perform(onErase)}>{busy ? 'Borrando…' : 'Sí, borrar mis gustos'}</button></div></div> : <button className="text-button" disabled={busy} onClick={() => setConfirm(true)}>Borrar mis gustos</button>}</section>
      {error && <p className="notice error" role="status">{error}</p>}
    </div>
  </dialog>
}
