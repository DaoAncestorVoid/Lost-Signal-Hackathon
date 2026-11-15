import type { CSSProperties } from "react";
import Image from "next/image";

const LOST = "Lost";
const SIGNAL = "Signal";

function letters(word: string, offset: number) {
  return [...word].map((char, index) => (
    <span key={index} className="wm-letter" style={{ "--i": offset + index } as CSSProperties}>{char}</span>
  ));
}

/** LostSignal wordmark: site logo, name, then a red magnifier that sweeps across the name once per page load and settles on the right. */
export function BrandWordmark() {
  return <span className="wordmark">
    <Image className="wm-logo" src="/icon.svg" alt="" width={38} height={38} priority />
    <span className="wm-text" aria-hidden="true">{letters(LOST, 0)}<span className="brand-accent">{letters(SIGNAL, LOST.length)}</span></span>
    <span className="wm-glass" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <circle className="wm-ping" cx="13" cy="13" r="9" />
        <circle className="wm-lens" cx="13" cy="13" r="9" />
        <line className="wm-handle" x1="20" y1="20" x2="28" y2="28" />
      </svg>
    </span>
  </span>;
}
