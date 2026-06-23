import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeCtx = createContext(null);

function resolverInicial() {
  const guardado = localStorage.getItem('theme');
  if (guardado === 'dark' || guardado === 'light') return guardado;
  // Por defecto, respeta la preferencia del sistema
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(resolverInicial);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
    // Actualiza el color de la barra del navegador (PWA)
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#030712' : '#16a34a');
  }, [theme]);

  const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);

  return (
    <ThemeCtx.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
