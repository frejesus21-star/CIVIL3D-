import React, { useEffect, useState } from 'react';

// Banner para instalar la PWA. Captura el evento beforeinstallprompt (Android/Chrome)
// y, si no está disponible (iOS), muestra una guía breve.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [esIOS, setEsIOS] = useState(false);

  useEffect(() => {
    // Si ya está instalada, no mostrar
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (standalone) return;
    if (localStorage.getItem('install_dismissed')) return;

    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
    setEsIOS(ios);

    function onPrompt(e) {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    }
    window.addEventListener('beforeinstallprompt', onPrompt);

    // En iOS no hay beforeinstallprompt: mostrar guía tras un momento
    let t;
    if (ios) t = setTimeout(() => setVisible(true), 1500);

    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); clearTimeout(t); };
  }, []);

  async function instalar() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    setDeferred(null);
    setVisible(false);
  }

  function cerrar() {
    setVisible(false);
    localStorage.setItem('install_dismissed', '1');
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-40 print:hidden">
      <div className="card shadow-lg border-brand-200 flex items-start gap-3">
        <div className="text-2xl">📲</div>
        <div className="flex-1">
          <p className="font-semibold text-sm">Instala RemesasVE</p>
          {esIOS ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Toca <span className="font-medium">Compartir</span> y luego <span className="font-medium">"Agregar a inicio"</span> para usarla como app.</p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Úsala como app en tu celular, con acceso directo y pantalla completa.</p>
          )}
          <div className="flex gap-2 mt-2">
            {!esIOS && <button onClick={instalar} className="btn-primary text-xs py-1.5 px-3">Instalar</button>}
            <button onClick={cerrar} className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-300 py-1.5 px-2">Ahora no</button>
          </div>
        </div>
      </div>
    </div>
  );
}
