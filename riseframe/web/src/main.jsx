import React from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root.jsx';
import { AuthProvider } from './AuthContext.jsx';
import './fonts.css';
import { initInstall } from './installApp.js';
import { initDesktopStorage } from './desktopStorage.js';

// App de PC: traz de volta as preferências (Brand Kit, modelos, login) se o endereço mudou
initDesktopStorage();

initInstall(); // app instalável (celular/PC pelo navegador)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>,
);
