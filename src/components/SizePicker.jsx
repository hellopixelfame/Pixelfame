import { useState } from 'react';
import { SIZE_OPTIONS, MAX_CUSTOM_SIZE, priceFor, formatInr } from '../lib/pricing';

export default function SizePicker({ size, onChange }) {
  const [customOpen, setCustomOpen] = useState(!SIZE_OPTIONS.includes(size));
  const [customValue, setCustomValue] = useState(String(size));

  function pick(n) {
    setCustomOpen(false);
    onChange(n);
  }

  function commitCustom(value) {
    const n = Math.max(1, Math.min(MAX_CUSTOM_SIZE, parseInt(value, 10) || 1));
    setCustomValue(String(n));
    onChange(n);
  }

  return (
    <div id="size-picker" className="mono">
      {SIZE_OPTIONS.map((n) => (
        <button
          key={n}
          type="button"
          className={'size-chip' + (!customOpen && size === n ? ' active' : '')}
          onClick={() => pick(n)}
        >
          {n}×{n} {formatInr(priceFor(n))}
        </button>
      ))}
      <button
        type="button"
        className={'size-chip' + (customOpen ? ' active' : '')}
        onClick={() => setCustomOpen(true)}
      >
        {customOpen ? (
          <>
            <input
              type="number"
              min={1}
              max={MAX_CUSTOM_SIZE}
              value={customValue}
              autoFocus
              onChange={(e) => setCustomValue(e.target.value)}
              onBlur={(e) => commitCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCustom(e.currentTarget.value);
              }}
              onClick={(e) => e.stopPropagation()}
            />
            × {formatInr(priceFor(parseInt(customValue, 10) || 1))}
          </>
        ) : (
          'custom…'
        )}
      </button>
    </div>
  );
}
