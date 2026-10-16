import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Line } from './sim';

interface Props {
  lines: Line[];
  prompt?: { text: string; tone?: 'prompt' | 'accent' } | null;
  mask?: boolean;
  onSubmit?: (value: string) => void;
  label: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}

/** Zone de terminal : historique de lignes + ligne de saisie (flèches haut/bas = historique). */
export function Terminal({ lines, prompt, mask, onSubmit, label, inputRef }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const [value, setValue] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);

  const stick = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.(value);
      if (value.trim() && !mask) setHist((h) => [...h, value]);
      setHi(-1);
      setValue('');
    } else if (e.key === 'ArrowUp' && hist.length) {
      e.preventDefault();
      const i = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1);
      setHi(i);
      setValue(hist[i]);
    } else if (e.key === 'ArrowDown' && hi >= 0) {
      e.preventDefault();
      const i = hi + 1;
      if (i >= hist.length) { setHi(-1); setValue(''); } else { setHi(i); setValue(hist[i]); }
    }
  };

  return (
    <div className="term" ref={scroller} tabIndex={0} aria-label={label}
      onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
      onMouseUp={() => { if (!window.getSelection()?.toString()) ref.current?.focus(); }}>
      <div role="log" aria-label={label} aria-live={onSubmit ? 'polite' : 'off'}>
        {lines.map((l, i) => (
          <div key={i} className={`ln t-${l.tone}`}>{l.text || ' '}</div>
        ))}
      </div>
      {prompt && onSubmit && (
        <label className="ln input-line">
          <span className={`t-${prompt.tone ?? 'prompt'}`}>{prompt.text}</span>
          <span className="sr-only">Saisie {label}</span>
          <input
            ref={ref}
            type={mask ? 'password' : 'text'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={key}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
          />
        </label>
      )}
    </div>
  );
}
