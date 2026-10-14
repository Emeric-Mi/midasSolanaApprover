import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div className="mb-6">
      <label
        className={`mb-2 block text-sm font-semibold ${error ? 'text-red-600' : 'text-midas-ink'}`}
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-sm text-midas-muted">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  mono?: boolean;
}

export function TextInput({ value, onChange, placeholder, invalid, mono }: TextInputProps) {
  return (
    <input
      type="text"
      spellCheck={false}
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'w-full rounded-lg border px-4 py-3 text-sm outline-none transition',
        mono ? 'font-mono' : '',
        invalid
          ? 'border-red-400 bg-white focus:border-red-500'
          : 'border-midas-border bg-midas-canvas focus:border-midas-navy focus:bg-white',
      ].join(' ')}
    />
  );
}
