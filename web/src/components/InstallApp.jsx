import { useEffect, useState } from 'react'

export default function InstallApp() {
  const [prompt, setPrompt] = useState(null)
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches || navigator.standalone)
  const [help, setHelp] = useState(false)
  useEffect(() => {
    const available = event => { event.preventDefault(); setPrompt(event) }
    const done = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', available)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', done) }
  }, [])
  if (installed) return <p>Sonora ya está instalada en este dispositivo.</p>
  return <><button className="primary-button" onClick={async () => {
    if (!prompt) { setHelp(!help); return }
    await prompt.prompt()
    setPrompt(null)
  }}>Instalar Sonora</button>{help && <p role="status">En iPhone o iPad, abre Sonora en Safari y elige Compartir → Añadir a pantalla de inicio. En Android o PC, abre el menú del navegador y elige Instalar aplicación o Añadir a pantalla de inicio.</p>}</>
}
