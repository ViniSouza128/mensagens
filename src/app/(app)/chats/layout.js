'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import ChatList from '@/components/chat/ChatList';
import styles from './chats.module.css';
import useMediaQuery from '@/hooks/useMediaQuery';

export default function ChatsLayout({ children }) {
  const pathname = usePathname();
  const onChatPage = /^\/chats\/[^/]+/.test(pathname || '');
  const isMobile = useMediaQuery('(max-width: 880px)');
  // for mobile: show list when no chat opened; show thread otherwise.
  const showList = !isMobile || !onChatPage;
  const showThread = !isMobile || onChatPage;

  return (
    <div className={styles.split}>
      {showList ? <aside className={styles.list}><ChatList /></aside> : null}
      {showThread ? <section className={styles.thread}>{children}</section> : null}
    </div>
  );
}
