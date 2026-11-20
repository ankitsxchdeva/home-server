import { useRef } from "react";

/** Tap vs press-and-hold, the way Apple Home tiles behave. */
export function usePress(onTap: () => void, onHold: () => void, holdMs = 450) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      held.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = window.setTimeout(() => {
        held.current = true;
        navigator.vibrate?.(10);
        onHold();
      }, holdMs);
    },
    onPointerMove: (e: React.PointerEvent) => {
      // Scrolling the page shouldn't count as a tap or a hold.
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) {
        clear();
        start.current = null;
      }
    },
    onPointerUp: () => {
      const wasTap = timer.current !== null && !held.current && start.current !== null;
      clear();
      start.current = null;
      if (wasTap) onTap();
    },
    onPointerCancel: () => {
      clear();
      start.current = null;
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
