'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const Ctx = createContext({
  theme: 'auto', effective: 'light', setTheme: () => {},
  accent: 'indigo', setAccent: () => {},
  font: 'normal', setFont: () => {},
  density: 'comfortable', setDensity: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('auto');
  const [accent, setAccentState] = useState('indigo');
  const [font, setFontState] = useState('normal');
  const [density, setDensityState] = useState('comfortable');
  const [effective, setEffective] = useState('light');

  useEffect(() => {
    try {
      const t = localStorage.getItem('m_theme') || 'auto';
      const a = localStorage.getItem('m_accent') || 'indigo';
      const f = localStorage.getItem('m_font') || 'normal';
      const d = localStorage.getItem('m_density') || 'comfortable';
      setThemeState(t);
      setAccentState(a);
      setFontState(f);
      setDensityState(d);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const applyEffective = () => {
      const eff = theme === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;
      setEffective(eff);
      document.documentElement.dataset.theme = eff;
    };
    applyEffective();
    document.documentElement.dataset.accent = accent;
    document.documentElement.dataset.font = font;
    document.documentElement.dataset.density = density;
    if (theme === 'auto') {
      const m = window.matchMedia('(prefers-color-scheme: dark)');
      m.addEventListener('change', applyEffective);
      return () => m.removeEventListener('change', applyEffective);
    }
  }, [theme, accent, font, density]);

  const setTheme = useCallback((t) => { setThemeState(t); try { localStorage.setItem('m_theme', t); } catch {} }, []);
  const setAccent = useCallback((a) => { setAccentState(a); try { localStorage.setItem('m_accent', a); } catch {} }, []);
  const setFont = useCallback((f) => { setFontState(f); try { localStorage.setItem('m_font', f); } catch {} }, []);
  const setDensity = useCallback((d) => { setDensityState(d); try { localStorage.setItem('m_density', d); } catch {} }, []);

  return (
    <Ctx.Provider value={{ theme, effective, setTheme, accent, setAccent, font, setFont, density, setDensity }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() { return useContext(Ctx); }
