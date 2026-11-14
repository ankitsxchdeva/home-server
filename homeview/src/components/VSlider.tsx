import { useEffect, useRef, useState } from "react";

interface Props {
  value: number; // 0..100
  onCommit: (v: number) => void;
  label: string;
  fill?: string;
  track?: string;
  showValue?: (v: number) => string;
}

/** The tall pill slider from Apple Home's light controls. Drag anywhere on it. */
export function VSlider({ value, onCommit, label, fill = "white", track, showValue }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [local, setLocal] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startV: number } | null>(null);
  const v = local ?? value;

  // Drop the local value once Home Assistant reports the change back.
  useEffect(() => setLocal(null), [value]);

  const fromDelta = (dy: number) => {
    const h = ref.current?.clientHeight ?? 300;
    return Math.max(0, Math.min(100, Math.round(drag.current!.startV - (dy / h) * 100)));
  };

  return (
    <div
      ref={ref}
      className="vslider"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      tabIndex={0}
      style={{ background: track }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        drag.current = { startY: e.clientY, startV: v };
      }}
      onPointerMove={(e) => {
        if (drag.current) setLocal(fromDelta(e.clientY - drag.current.startY));
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        const moved = Math.abs(e.clientY - drag.current.startY) > 3;
        let next = fromDelta(e.clientY - drag.current.startY);
        if (!moved) {
          // A tap jumps to where you tapped.
          const rect = ref.current!.getBoundingClientRect();
          next = Math.round(((rect.bottom - e.clientY) / rect.height) * 100);
          next = Math.max(0, Math.min(100, next));
        }
        drag.current = null;
        setLocal(next);
        onCommit(next);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setLocal(null);
      }}
      onKeyDown={(e) => {
        const step = e.key === "ArrowUp" ? 5 : e.key === "ArrowDown" ? -5 : 0;
        if (step) {
          const next = Math.max(0, Math.min(100, v + step));
          setLocal(next);
          onCommit(next);
        }
      }}
    >
      <div className="vslider-fill" style={{ height: `${v}%`, background: fill }} />
      {showValue && <div className="vslider-value">{showValue(v)}</div>}
    </div>
  );
}
