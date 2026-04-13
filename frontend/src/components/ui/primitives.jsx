/**
 * Design System Primitives — Tendent CRM
 * Modern SaaS aesthetic (Linear / Vercel inspired)
 *
 * All components are tenant-brand aware via CSS variables:
 *   --brand-primary, --brand-secondary, --brand-accent
 *
 * Drop-in usage:
 *   import { Card, Stat, Button, Input, Badge, PageHeader, EmptyState, DataTable } from '@/components/ui/primitives';
 */

import React, { forwardRef } from 'react';
import { ChevronRight, Loader2, Search, ArrowUpRight, ArrowDownRight, Inbox } from 'lucide-react';

const cn = (...classes) => classes.filter(Boolean).join(' ');

/* ───────────────────────────────────────────────────── Card ── */
export const Card = ({ className = '', children, hover = false, ...rest }) => (
  <div
    className={cn(
      'relative bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl',
      'shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]',
      'dark:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.4)]',
      hover && 'transition-[box-shadow,border-color] duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06),0_16px_32px_-12px_rgba(15,23,42,0.12)]',
      className
    )}
    {...rest}
  >
    {children}
  </div>
);

export const CardHeader = ({ title, subtitle, action, className = '' }) => (
  <div className={cn('flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 dark:border-slate-800', className)}>
    <div className="min-w-0">
      <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white truncate">{title}</h3>
      {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</p>}
    </div>
    {action && <div className="flex-shrink-0">{action}</div>}
  </div>
);

export const CardBody = ({ className = '', children }) => (
  <div className={cn('px-6 py-5', className)}>{children}</div>
);

/* ───────────────────────────────────────────────────── Stat ── */
export const Stat = ({ label, value, change, changeType, icon: Icon, accent = 'var(--brand-primary)', accentTo }) => {
  const positive = changeType === 'up';
  const to = accentTo || accent;
  return (
    <Card hover className="p-5 overflow-hidden group">
      {/* Cheap corner tint (no blur filter) */}
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-15 group-hover:opacity-25 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, ${to}, transparent 65%)`,
        }}
      />
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-5 right-5 h-px opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="relative flex items-start justify-between">
        {Icon && (
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${to})`,
              color: 'white',
              boxShadow: `0 8px 20px -6px ${accent}80`,
            }}
          >
            <Icon className="w-5 h-5" strokeWidth={2.5} />
          </div>
        )}
        {change && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-bold px-2.5 py-1 rounded-full ring-1',
              positive
                ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 ring-emerald-200/60 dark:from-emerald-500/10 dark:to-teal-500/10 dark:text-emerald-400 dark:ring-emerald-500/20'
                : 'bg-gradient-to-r from-rose-50 to-pink-50 text-rose-700 ring-rose-200/60 dark:from-rose-500/10 dark:to-pink-500/10 dark:text-rose-400 dark:ring-rose-500/20'
            )}
          >
            {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {change}
          </span>
        )}
      </div>
      <div className="relative mt-5">
        <div className="text-[30px] leading-none font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
          {value}
        </div>
        <div className="text-[13px] text-slate-500 dark:text-slate-400 mt-2 font-medium">{label}</div>
      </div>
    </Card>
  );
};

/* ─────────────────────────────────────────────────── Button ── */
const buttonVariants = {
  primary:
    'text-white shadow-[0_4px_14px_-4px_var(--brand-primary)] hover:shadow-[0_8px_20px_-4px_var(--brand-primary)] hover:-translate-y-0.5 active:translate-y-0',
  secondary:
    'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm dark:hover:bg-slate-800',
  ghost:
    'text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white',
  danger:
    'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-[0_4px_14px_-4px_rgba(244,63,94,0.6)] hover:shadow-[0_8px_20px_-4px_rgba(244,63,94,0.7)] hover:-translate-y-0.5',
  success:
    'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_4px_14px_-4px_rgba(16,185,129,0.6)] hover:shadow-[0_8px_20px_-4px_rgba(16,185,129,0.7)] hover:-translate-y-0.5',
  outline:
    'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 hover:border-slate-300 dark:hover:bg-slate-800',
};

const buttonSizes = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  icon: 'h-9 w-9',
};

export const Button = forwardRef(
  ({ variant = 'primary', size = 'md', leftIcon: Left, rightIcon: Right, loading, className = '', children, style, ...rest }, ref) => {
    const isPrimary = variant === 'primary';
    return (
      <button
        ref={ref}
        disabled={loading || rest.disabled}
        className={cn(
          'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 ease-out',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950',
          'disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
          buttonVariants[variant],
          buttonSizes[size],
          className
        )}
        style={
          isPrimary
            ? {
                background:
                  'linear-gradient(135deg, var(--brand-primary), color-mix(in oklab, var(--brand-primary) 70%, var(--brand-accent, var(--brand-primary))))',
                ...style,
              }
            : style
        }
        {...rest}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Left && <Left className="w-4 h-4" />}
        {children}
        {Right && !loading && <Right className="w-4 h-4" />}
      </button>
    );
  }
);
Button.displayName = 'Button';

/* ──────────────────────────────────────────────────── Input ── */
export const Input = forwardRef(({ leftIcon: Left, className = '', ...rest }, ref) => (
  <div className="relative">
    {Left && (
      <Left className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    )}
    <input
      ref={ref}
      className={cn(
        'w-full h-9 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white',
        'border border-slate-200 dark:border-slate-800 placeholder:text-slate-400',
        'focus:outline-none focus:ring-2 focus:ring-offset-0',
        'transition',
        Left ? 'pl-9 pr-3' : 'px-3',
        className
      )}
      style={{ '--tw-ring-color': 'color-mix(in oklab, var(--brand-primary) 35%, transparent)' }}
      {...rest}
    />
  </div>
));
Input.displayName = 'Input';

export const Select = forwardRef(({ className = '', children, ...rest }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-9 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white px-3',
      'border border-slate-200 dark:border-slate-800',
      'focus:outline-none focus:ring-2',
      className
    )}
    style={{ '--tw-ring-color': 'color-mix(in oklab, var(--brand-primary) 35%, transparent)' }}
    {...rest}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export const Textarea = forwardRef(({ className = '', ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white px-3 py-2',
      'border border-slate-200 dark:border-slate-800 placeholder:text-slate-400',
      'focus:outline-none focus:ring-2 resize-none',
      className
    )}
    style={{ '--tw-ring-color': 'color-mix(in oklab, var(--brand-primary) 35%, transparent)' }}
    {...rest}
  />
));
Textarea.displayName = 'Textarea';

export const Field = ({ label, hint, required, error, children }) => (
  <label className="block">
    {label && (
      <span className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
    )}
    {children}
    {error ? (
      <span className="block text-xs text-rose-600 mt-1">{error}</span>
    ) : hint ? (
      <span className="block text-xs text-slate-500 mt-1">{hint}</span>
    ) : null}
  </label>
);

/* ──────────────────────────────────────────────────── Badge ── */
const badgeTones = {
  default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  brand: '',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/10',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 ring-1 ring-inset ring-amber-600/10',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 ring-1 ring-inset ring-rose-600/10',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400 ring-1 ring-inset ring-sky-600/10',
  purple: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 ring-1 ring-inset ring-purple-600/10',
};

export const Badge = ({ tone = 'default', children, className = '', dot = false }) => {
  const isBrand = tone === 'brand';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        badgeTones[tone] || badgeTones.default,
        className
      )}
      style={
        isBrand
          ? {
              backgroundColor: 'color-mix(in oklab, var(--brand-primary) 12%, transparent)',
              color: 'var(--brand-primary)',
            }
          : undefined
      }
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
};

/* Status badge that maps common CRM statuses to tones */
const statusToneMap = {
  new: 'info',
  open: 'info',
  contacted: 'warning',
  in_progress: 'warning',
  qualified: 'success',
  won: 'success',
  closed_won: 'success',
  active: 'success',
  lost: 'danger',
  closed_lost: 'danger',
  inactive: 'default',
  pending: 'warning',
  draft: 'default',
};
export const StatusBadge = ({ status }) => {
  const tone = statusToneMap[(status || '').toLowerCase()] || 'default';
  return (
    <Badge tone={tone} dot>
      {String(status || '').replace(/_/g, ' ')}
    </Badge>
  );
};

/* ─────────────────────────────────────────────── PageHeader ── */
export const PageHeader = ({ title, subtitle, breadcrumbs, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
    <div className="min-w-0">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              {b.href ? (
                <a href={b.href} className="hover:text-slate-900 dark:hover:text-white">
                  {b.label}
                </a>
              ) : (
                <span>{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

/* ─────────────────────────────────────────────── EmptyState ── */
export const EmptyState = ({ icon: Icon = Inbox, title, description, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
    <div
      className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
      style={{
        background: 'color-mix(in oklab, var(--brand-primary) 8%, transparent)',
        color: 'var(--brand-primary)',
      }}
    >
      <Icon className="w-7 h-7" />
    </div>
    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
    {description && <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

/* ─────────────────────────────────────────────────── Modal ── */
export const Modal = ({ open, onClose, title, children, footer, size = 'md' }) => {
  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden',
          sizes[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          </div>
        )}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────── Avatar ── */
export const Avatar = ({ name = '', size = 36, src }) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
  if (src)
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background:
          'linear-gradient(135deg, var(--brand-primary), var(--brand-accent, var(--brand-primary)))',
      }}
    >
      {initials}
    </div>
  );
};

/* ──────────────────────────────────────────────── DataTable ── */
/**
 * Lightweight, header-styled table.
 *  columns: [{ key, header, render?, className?, align? }]
 *  rows:    array of records
 */
export const DataTable = ({ columns, rows, onRowClick, empty }) => {
  if (!rows || rows.length === 0) {
    return empty || <EmptyState title="No data" description="There's nothing here yet." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-6 py-3 text-left',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                  c.className
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={() => onRowClick?.(row)}
              className={cn(
                'border-b border-slate-50 dark:border-slate-800/60 last:border-0',
                'transition-colors',
                onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40'
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-6 py-3.5 text-slate-700 dark:text-slate-300 align-middle',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.className
                  )}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ─────────────────────────────────────────── SearchInput ── */
export const SearchInput = (props) => <Input leftIcon={Search} placeholder="Search..." {...props} />;

/* ─────────────────────────────────────────── Skeleton ── */
export const Skeleton = ({ className = '' }) => (
  <div className={cn('animate-pulse rounded-md bg-slate-200/70 dark:bg-slate-800', className)} />
);

/* ─────────────────────────────────────────── Tabs (segmented) ── */
export const Segmented = ({ options, value, onChange }) => (
  <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          onClick={() => onChange?.(opt.value)}
          className={cn(
            'px-3 h-8 text-xs font-medium rounded-md transition-all',
            active
              ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);
