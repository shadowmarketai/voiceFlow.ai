/**
 * VoiceFlow AI - Theme Configuration
 */

export const defaultTheme = {
  brand: {
    name: 'VoiceFlow AI',
    tagline: 'Voice AI Platform',
    logo: null,
  },
  colors: {
    primary: { 50: '#eef2ff', 100: '#e0e7ff', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
    secondary: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a' },
  },
}

export function getTenantTheme(config) {
  return { ...defaultTheme, ...config }
}
