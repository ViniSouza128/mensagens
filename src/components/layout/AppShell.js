'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import ShortcutsModal from './ShortcutsModal';
import { useApp } from '@/store/AppStateProvider';
import { useTheme } from './ThemeProvider';
import styles from './AppShell.module.css';

export default function AppShell({ children }) {
  const { user } = useApp();
  const { setTheme, setAccent, setFont, setDensity } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Apply user preferences from their profile
  useEffect(() => {
    if (!user) return;
    if (user.theme) setTheme(user.theme);
    if (user.accent) setAccent(user.accent);
    if (user.font_size) setFont(user.font_size);
    if (user.density) setDensity(user.density);
  }, [user, setTheme, setAccent, setFont, setDensity]);

  // Apply wallpaper as a CSS var so chats can read it
  useEffect(() => {
    const wp = user?.wallpaper;
    const root = document.documentElement;
    if (!wp) {
      root.style.removeProperty('--chat-wallpaper');
      return;
    }
    if (typeof wp === 'string' && wp.startsWith('preset:')) {
      const id = wp.slice('preset:'.length);
      const map = {
        'soft-dawn': 'linear-gradient(135deg, #fef3c7, #fbcfe8)',
        'ocean': 'linear-gradient(135deg, #bae6fd, #c7d2fe)',
        'mint': 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
        'lavender': 'linear-gradient(135deg, #ede9fe, #fbcfe8)',
        'graphite': 'linear-gradient(135deg, #1f2937, #0f172a)',
        'dots': 'radial-gradient(circle at 25% 25%, currentColor 1px, transparent 1px) 0 0/20px 20px',
      };
      root.style.setProperty('--chat-wallpaper', map[id] || 'none');
    } else {
      root.style.setProperty('--chat-wallpaper', `url(/api/files/${wp}) center/cover`);
    }
  }, [user?.wallpaper]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Ignore when typing in form fields
      const tag = e.target?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        if (pathname === '/search') return;
        e.preventDefault();
        router.push('/search');
        return;
      }
      if (!isEditable && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, pathname]);

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>{children}</div>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
