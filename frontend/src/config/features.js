/**
 * VoiceFlow AI SaaS - Feature Configuration
 * Standalone Voice AI platform with white-label support
 */

export const defaultFeatures = {
  productName: 'VoiceFlow AI',
  modules: {
    voiceAI: { enabled: true, name: 'Voice AI', icon: 'Mic', description: 'AI voice agents & analytics' },
  },
  regional: {
    languages: ['en', 'hi', 'ta'],
    dialects: { tamil: ['kongu', 'chennai', 'madurai', 'tirunelveli'] },
    genZSupport: true,
    emotionDetection: true,
  },
};

export function isModuleEnabled(features, moduleName) {
  return features?.modules?.[moduleName]?.enabled ?? false;
}

export function getEnabledModules(features) {
  return Object.entries(features?.modules || {})
    .filter(([_, config]) => config.enabled)
    .map(([key, config]) => ({ id: key, ...config }));
}

export function getTenantFeatures(tenantId) {
  return defaultFeatures;
}
