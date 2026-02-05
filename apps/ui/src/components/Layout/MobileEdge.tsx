import { useRef } from 'react';
import { useMobileNav } from '../../state/mobile-nav';

export function MobileEdge() {
  const { open, setOpen } = useMobileNav();
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  return (
    <div
      className="sm:hidden fixed left-0 top-0 z-30 h-full w-4"
      onTouchStart={(e) => {
        if (open) return;
        const t = e.touches[0];
        startX.current = t.clientX;
        startY.current = t.clientY;
      }}
      onTouchMove={(e) => {
        if (open) return;
        const t = e.touches[0];
        const sx = startX.current;
        const sy = startY.current;
        if (sx == null || sy == null) return;
        const dx = t.clientX - sx;
        const dy = Math.abs(t.clientY - sy);
        if (dx > 60 && dy < 40 && sx < 24) {
          setOpen(true);
          startX.current = null;
          startY.current = null;
        }
      }}
      onTouchEnd={() => {
        startX.current = null;
        startY.current = null;
      }}
    />
  );
}
