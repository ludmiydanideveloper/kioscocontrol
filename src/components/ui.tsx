import React from 'react';
import { X } from 'lucide-react';

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { pad?: boolean }> = ({
  className,
  pad,
  ...rest
}) => (
  <div
    className={cx('bg-surface border border-line rounded-xl card-shadow', pad && 'p-4 sm:p-5', className)}
    {...rest}
  />
);

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink/90 active:bg-ink',
  secondary: 'bg-surface border border-line-strong text-ink hover:bg-surface-2',
  ghost: 'text-ink-soft hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger/90',
  success: 'bg-brand text-white hover:bg-brand/90',
};
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-1.5 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
> = ({ variant = 'secondary', size = 'md', className, ...rest }) => (
  <button
    className={cx(
      'inline-flex items-center justify-center font-medium transition-colors select-none',
      'disabled:opacity-45 disabled:pointer-events-none',
      BTN_SIZE[size],
      BTN_VARIANT[variant],
      className,
    )}
    {...rest}
  />
);

export const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
> = ({ variant = 'secondary', className, ...rest }) => (
  <button
    className={cx(
      'inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors shrink-0',
      'disabled:opacity-45 disabled:pointer-events-none',
      BTN_VARIANT[variant],
      className,
    )}
    {...rest}
  />
);

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
const FIELD_BASE =
  'w-full bg-surface border border-line-strong rounded-lg px-3 text-sm text-ink placeholder:text-muted ' +
  'outline-none transition-shadow focus:border-ink/30 focus:ring-2 focus:ring-ink/10';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...rest
}) => <input className={cx(FIELD_BASE, 'h-9', className)} {...rest} />;

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  ...rest
}) => <select className={cx(FIELD_BASE, 'h-9 pr-8 appearance-none bg-no-repeat', className)} {...rest} />;

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...rest
}) => <textarea className={cx(FIELD_BASE, 'py-2', className)} {...rest} />;

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({
  className,
  ...rest
}) => <label className={cx('block text-[13px] font-medium text-ink-soft mb-1.5', className)} {...rest} />;

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div>
    <Label>{label}</Label>
    {children}
    {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
  </div>
);

// ---------------------------------------------------------------------------
// Badge / pill
// ---------------------------------------------------------------------------
type Tone = 'neutral' | 'green' | 'red' | 'amber' | 'blue';
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-soft border-line',
  green: 'bg-brand-soft text-brand border-brand/20',
  red: 'bg-danger-soft text-danger border-danger/20',
  amber: 'bg-warn-soft text-warn border-warn/20',
  blue: 'bg-[#eef3fb] text-info border-info/20',
};

export const Badge: React.FC<{ tone?: Tone; className?: string; children: React.ReactNode }> = ({
  tone = 'neutral',
  className,
  children,
}) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium nums',
      TONE[tone],
      className,
    )}
  >
    {children}
  </span>
);

// ---------------------------------------------------------------------------
// Section heading (eyebrow)
// ---------------------------------------------------------------------------
export const SectionTitle: React.FC<{
  icon?: React.ElementType;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, children, right, className }) => (
  <div className={cx('flex items-center justify-between gap-3', className)}>
    <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
      {Icon && <Icon className="h-4 w-4 text-ink-soft" strokeWidth={2} />}
      {children}
    </h3>
    {right}
  </div>
);

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'positive' | 'negative';
  icon?: React.ElementType;
}> = ({ label, value, hint, tone = 'default', icon: Icon }) => (
  <Card className="p-3.5">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      {Icon && <Icon className="h-4 w-4 text-muted" strokeWidth={2} />}
    </div>
    <p
      className={cx(
        'mt-1.5 text-[22px] font-semibold tracking-tight nums leading-none',
        tone === 'positive' && 'text-brand',
        tone === 'negative' && 'text-danger',
      )}
    >
      {value}
    </p>
    {hint && <p className="mt-1.5 text-xs text-muted nums">{hint}</p>}
  </Card>
);

// ---------------------------------------------------------------------------
// Segmented control (filtros tipo pestaña)
// ---------------------------------------------------------------------------
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-3 h-7 text-[13px] font-medium transition-colors',
            value === o.value ? 'bg-surface text-ink card-shadow' : 'text-ink-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}> = ({ title, onClose, children, footer, size = 'md' }) => {
  const width = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' }[size];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className={cx(
          'w-full bg-surface border border-line rounded-t-2xl sm:rounded-2xl pop-shadow flex flex-col max-h-[92vh] sm:max-h-[88vh]',
          width,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink transition-colors -mr-1.5 p-1.5 rounded-lg hover:bg-surface-2"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line bg-surface-2/50 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export const Empty: React.FC<{ icon?: React.ElementType; title: string; hint?: string }> = ({
  icon: Icon,
  title,
  hint,
}) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-6">
    {Icon && <Icon className="h-8 w-8 text-muted mb-3" strokeWidth={1.5} />}
    <p className="text-sm font-medium text-ink">{title}</p>
    {hint && <p className="mt-1 text-[13px] text-muted max-w-xs">{hint}</p>}
  </div>
);
