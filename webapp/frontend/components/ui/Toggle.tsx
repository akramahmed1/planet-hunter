"use client";

import { useId } from "react";

export type ToggleOption<T extends string> = { value: T; label: string; title?: string };

/**
 * A segmented control built on native radio buttons, so arrow keys, screen
 * readers and form semantics all work without extra code.
 */
export default function Toggle<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  // Always unique: same-named radios anywhere in the page form one group, so
  // two copies of a toggle would otherwise uncheck each other.
  const group = useId();
  return (
    <fieldset className="toggle">
      <legend>{legend}</legend>
      <div className="toggle-options">
        {options.map((o) => (
          <label key={o.value} className="toggle-option" title={o.title}>
            <input
              type="radio"
              name={group}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              aria-label={o.title ?? o.label}
            />
            <span aria-hidden="true">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
