import React from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root.jsx';
import { AuthProvider } from './AuthContext.jsx';
import './fonts.css';
import { initInstall } from './installApp.js';

initInstall(); // app instalável (celular/PC pelo navegador)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>,
);
