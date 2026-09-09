import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import './app/globals.css';
import Home from './app/page';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
