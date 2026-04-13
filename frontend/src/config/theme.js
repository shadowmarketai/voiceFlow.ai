/**
 * Swetha Structures CRM - Theme Configuration
 * Amber/Orange branding for PEB/Steel company
 */

export const defaultTheme = {
  brand: {
    name: 'Swetha Structures CRM',
    tagline: 'CRM + Voice AI + PEB Quotation',
    logo: null,
  },
  colors: {
    primary: { 50: '#fffbeb', 100: '#fef3c7', 500: '#D97706', 600: '#B45309', 700: '#92400E' },
    secondary: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a' },
  },
}

export function getTenantTheme(config) {
  return { ...defaultTheme, ...config }
}
