import type {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-navy text-white hover:bg-[#0d2a3a]',
  secondary: 'bg-brand-green text-white hover:bg-[#0f8a72]',
  outline: 'border border-slate-300 bg-white text-brand-ink hover:bg-brand-ice',
  ghost: 'text-brand-navy hover:bg-brand-ice',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Input({
  label,
  error,
  className = '',
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  const inputId = id ?? props.name;

  return (
    <div className="grid gap-1.5">
      {label && inputId && (
        <label className="text-sm font-semibold text-brand-ink" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        className={`min-h-11 w-full rounded-lg border bg-white px-3 text-sm text-brand-ink placeholder:text-brand-muted ${error ? 'border-red-500' : 'border-slate-300'} ${className}`}
        {...props}
      />
      {error && (
        <span className="text-sm text-red-700" id={inputId ? `${inputId}-error` : undefined}>
          {error}
        </span>
      )}
    </div>
  );
}

export function Select({
  label,
  className = '',
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const selectId = id ?? props.name;

  return (
    <div className="grid gap-1.5">
      {label && selectId && (
        <label className="text-sm font-semibold text-brand-ink" htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-brand-ink ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function Card({
  title,
  description,
  className = '',
  children,
}: {
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-slate-100 bg-white p-5 shadow-card sm:p-6 ${className}`}>
      {(title || description) && (
        <header className="mb-5">
          {title && <h2 className="text-lg font-bold text-brand-ink">{title}</h2>}
          {description && <p className="mt-1 text-sm text-brand-muted">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-muted">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function DemoNotice() {
  return (
    <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Ambiente de demonstração — não há dados reais carregados. Ações que exigem serviços estão desativadas.
    </p>
  );
}

export function MetricCard({
  label,
  value = '—',
  detail = 'Aguardando integração',
  icon = '•',
}: {
  label: string;
  value?: string;
  detail?: string;
  icon?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">{label}</p>
          <p className="mt-3 text-2xl font-extrabold tracking-tight text-[#153b50] sm:text-3xl">{value}</p>
        </div>
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#dff0ff] text-lg font-bold text-[#006b57]">{icon}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const badgeVariants: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-brand-ice text-brand-navy',
  neutral: 'bg-slate-100 text-slate-700',
};

export function Badge({
  variant = 'neutral',
  className = '',
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badgeVariants[variant]} ${className}`}>
      {children}
    </span>
  );
}

export function Table({ className = '', ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left text-sm ${className}`} {...props} />
    </div>
  );
}

export function TableHead({ className = '', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`border-b border-slate-200 px-4 py-3 font-semibold text-brand-ink ${className}`} {...props} />;
}

export function TableCell({ className = '', ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`border-b border-slate-100 px-4 py-3 text-brand-ink ${className}`} {...props} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <h2 className="font-bold text-brand-ink">{title}</h2>
      <p className="max-w-md text-sm text-brand-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

export function Toast({
  message,
  variant = 'info',
  onDismiss,
}: {
  message: string;
  variant?: Exclude<BadgeVariant, 'neutral'>;
  onDismiss?: () => void;
}) {
  const role = variant === 'danger' ? 'alert' : 'status';
  const colors: Record<Exclude<BadgeVariant, 'neutral'>, string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
  };

  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${colors[variant]}`} role={role}>
      <span>{message}</span>
      {onDismiss && (
        <Button aria-label="Dispensar aviso" className="min-h-7 px-2" onClick={onDismiss} type="button" variant="ghost">
          ×
        </Button>
      )}
    </div>
  );
}
