import { useState } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';

// ============================================
// LOADING SPINNER
// ============================================
export function Spinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };
  
  return (
    <Loader2 className={`animate-spin text-brand-600 ${sizes[size]} ${className}`} />
  );
}

// ============================================
// LOADING OVERLAY
// ============================================
export function LoadingOverlay({ message = 'Loading...' }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4">
        <Spinner size="xl" />
        <p className="text-gray-600 font-medium">{message}</p>
      </div>
    </div>
  );
}

// ============================================
// EMPTY STATE
// ============================================
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-12">
      {Icon && (
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <Icon className="w-8 h-8 text-gray-400" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      {description && <p className="text-gray-500 mb-4">{description}</p>}
      {action && action}
    </div>
  );
}

// ============================================
// ALERT/TOAST
// ============================================
export function Alert({ type = 'info', title, message, onClose }) {
  const config = {
    info: { icon: Info, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', iconColor: 'text-blue-500' },
    success: { icon: CheckCircle, bg: 'bg-success-50', border: 'border-success-200', text: 'text-success-800', iconColor: 'text-success-500' },
    warning: { icon: AlertTriangle, bg: 'bg-warning-50', border: 'border-warning-200', text: 'text-warning-800', iconColor: 'text-warning-500' },
    error: { icon: AlertCircle, bg: 'bg-danger-50', border: 'border-danger-200', text: 'text-danger-800', iconColor: 'text-danger-500' },
  };
  
  const { icon: Icon, bg, border, text, iconColor } = config[type];
  
  return (
    <div className={`${bg} ${border} border rounded-xl p-4 flex items-start gap-3`}>
      <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1">
        {title && <p className={`font-semibold ${text}`}>{title}</p>}
        {message && <p className={`text-sm ${text} opacity-80`}>{message}</p>}
      </div>
      {onClose && (
        <button onClick={onClose} className={`${text} hover:opacity-70`}>
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

// ============================================
// MODAL
// ============================================
export function Modal({ isOpen, onClose, title, children, size = 'md', footer }) {
  if (!isOpen) return null;
  
  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl w-full ${sizes[size]} max-h-[90vh] overflow-hidden flex flex-col animate-slide-up`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-display font-bold text-gray-900">{title}</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
        
        {/* Footer */}
        {footer && (
          <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// CONFIRM DIALOG
// ============================================
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger' }) {
  const variants = {
    danger: 'btn-danger',
    warning: 'btn bg-warning-500 text-white hover:bg-warning-600',
    primary: 'btn-primary',
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-gray-600">{message}</p>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="btn btn-secondary">
          {cancelText}
        </button>
        <button onClick={onConfirm} className={`btn ${variants[variant]}`}>
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}

// ============================================
// TABS
// ============================================
export function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="flex gap-2 border-b border-gray-100 pb-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'bg-brand-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
              activeTab === tab.id ? 'bg-white/20' : 'bg-gray-200'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ============================================
// AVATAR
// ============================================
export function Avatar({ name, src, size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };
  
  const initials = name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-xl object-cover ${sizes[size]} ${className}`}
      />
    );
  }
  
  return (
    <div className={`rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-semibold ${sizes[size]} ${className}`}>
      {initials}
    </div>
  );
}

// ============================================
// BADGE
// ============================================
export function Badge({ children, variant = 'default', dot = false }) {
  const variants = {
    default: 'bg-gray-100 text-gray-600',
    primary: 'bg-brand-50 text-brand-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    danger: 'bg-danger-50 text-danger-600',
    info: 'bg-blue-50 text-blue-600',
  };
  
  const dotColors = {
    default: 'bg-gray-400',
    primary: 'bg-brand-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
    info: 'bg-blue-500',
  };
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${variants[variant]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}

// ============================================
// DROPDOWN
// ============================================
export function Dropdown({ trigger, items, align = 'right' }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className={`absolute z-50 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}>
            {items.map((item, index) => (
              item.divider ? (
                <div key={index} className="border-t border-gray-100 my-1" />
              ) : (
                <button
                  key={index}
                  onClick={() => {
                    item.onClick?.();
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 ${
                    item.danger ? 'text-danger-600' : 'text-gray-700'
                  }`}
                >
                  {item.icon && <item.icon className="w-4 h-4" />}
                  {item.label}
                </button>
              )
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// SKELETON LOADER
// ============================================
export function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
  );
}

export function SkeletonCard() {
  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-20" />
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex gap-4 p-4 border-b border-gray-100">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="w-20 h-8 rounded-full" />
        </div>
      ))}
    </div>
  );
}
