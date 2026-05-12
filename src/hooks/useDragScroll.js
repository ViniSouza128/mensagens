'use client';
import { useEffect, useRef } from 'react';

/**
 * Hook que adiciona scroll horizontal por click+drag a um elemento.
 * Uso: const ref = useDragScroll(); <div ref={ref}>...</div>
 */
export default function useDragScroll() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false, startX = 0, startScroll = 0, moved = 0;
    function onDown(e) {
      // só com mouse principal
      if (e.button !== 0) return;
      // ignora se o alvo for botão/link interativo (deixa o click acontecer)
      if (e.target.closest('button, a, input, textarea')) {
        // mas inicia drag mesmo assim — só não previne click até mover bastante
      }
      down = true;
      moved = 0;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      el.style.cursor = 'grabbing';
    }
    function onMove(e) {
      if (!down) return;
      const dx = e.clientX - startX;
      moved = Math.abs(dx);
      el.scrollLeft = startScroll - dx;
    }
    function onUp() {
      down = false;
      el.style.cursor = '';
    }
    function onClick(e) {
      // se arrastou mais que 5px, cancela o click
      if (moved > 5) { e.preventDefault(); e.stopPropagation(); }
    }
    el.style.cursor = 'grab';
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('click', onClick, true);
    };
  }, []);
  return ref;
}
