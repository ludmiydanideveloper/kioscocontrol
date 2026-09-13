import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Cuando el service worker de la PWA activa una versión nueva (ya viene con
// skipWaiting/clientsClaim), recargamos una vez para que la pestaña abierta
// muestre esa versión al toque, en vez de quedar mostrando la vieja hasta
// que alguien cierre y reabra la app a mano.
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
