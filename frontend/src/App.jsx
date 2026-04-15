/**
 * VoiceFlow AI SaaS - App Router
 *
 * Standalone Voice AI platform with white-label support.
 * Routes: Voice AI Dashboard, Agents, Campaigns, Analytics, Admin Console
 */

import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import DashboardLayout from './layouts/DashboardLayout'
import SuperAdminLayout from './layouts/SuperAdminLayout'
import ProtectedRoute, { SuperAdminRoute, TenantRoute } from './components/ProtectedRoute'

// Eager-load Login
import Login from './pages/Login'
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const GoogleCallback = lazy(() => import('./pages/GoogleCallback'))

// ── Voice AI Module ──
const VoiceDashboardV2Page = lazy(() => import('./modules/voice-ai/pages/Dashboard'))
const VoiceAgentsListPage = lazy(() => import('./modules/voice-ai/pages/AgentsListPage'))
const VoiceAgentBuilderPage = lazy(() => import('./modules/voice-ai/pages/AgentBuilder'))
const VoiceKnowledgeBasePage = lazy(() => import('./modules/voice-ai/KnowledgeBase'))
const VoiceStudioPage = lazy(() => import('./modules/voice-ai/VoiceStudio'))
const PhoneNumbersPage = lazy(() => import('./modules/voice-ai/pages/PhoneNumbers'))
const ChannelsPage = lazy(() => import('./modules/voice-ai/pages/Channels'))
const CampaignsPage = lazy(() => import('./modules/voice-ai/Campaigns'))
const CallLogsPage = lazy(() => import('./modules/voice-ai/CallLogs'))
const LiveCallsPage = lazy(() => import('./modules/voice-ai/LiveCalls'))
const VoiceAnalyticsDashboardPage = lazy(() => import('./modules/voice-ai/pages/AnalyticsDashboard'))
const RecordingsPage = lazy(() => import('./modules/voice-ai/Recordings'))
const TestingPage = lazy(() => import('./modules/voice-ai/pages/Testing'))
const QualityDashboardPage = lazy(() => import('./modules/voice-ai/pages/QualityDashboard'))
const IntegrationsPage = lazy(() => import('./modules/voice-ai/pages/Integrations'))
const ApiDeveloperPage = lazy(() => import('./modules/voice-ai/pages/ApiDeveloper'))
const VoiceBillingPage = lazy(() => import('./modules/voice-ai/pages/BillingPage'))
const WalletBillingPage = lazy(() => import('./modules/voice-ai/pages/WalletBilling'))
const TenantPricingPage = lazy(() => import('./modules/voice-ai/pages/TenantPricing'))
const TeamPage = lazy(() => import('./modules/voice-ai/pages/TeamPage'))
const AgencyPricingPage = lazy(() => import('./modules/admin/AgencyPricingPage'))

// ── Settings ──
const Settings = lazy(() => import('./pages/Settings'))

// ── Super Admin (Platform Console) ──
const SuperAdminDashboard = lazy(() => import('./modules/admin/SuperAdminDashboard'))
const TenantsListPage = lazy(() => import('./modules/admin/TenantsListPage'))
const TenantDetail = lazy(() => import('./modules/admin/TenantDetail'))
const PlatformTicketsInbox = lazy(() => import('./modules/admin/PlatformTicketsInbox'))
const PlatformTicketDetail = lazy(() => import('./modules/admin/PlatformTicketDetail'))
const CrossTenantUsersPage = lazy(() => import('./modules/admin/CrossTenantUsersPage'))
// Plans page removed — VoiceFlow AI is prepaid wallet only
// Feature Flags page removed — per-tenant feature toggles live on Tenant Detail
const SuperAdminSettingsPage = lazy(() => import('./modules/admin/SuperAdminSettingsPage'))

const PlatformSupport = lazy(() => import('./pages/PlatformSupport'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

const S = ({ children }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>

function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<S><ForgotPassword /></S>} />
        <Route path="/reset-password" element={<S><ResetPassword /></S>} />
        <Route path="/auth/google/callback" element={<S><GoogleCallback /></S>} />

        {/* ═══════════════════════════════════════════════════
            SUPER ADMIN — Platform Console
            ═══════════════════════════════════════════════════ */}
        <Route
          path="/admin"
          element={
            <SuperAdminRoute>
              <SuperAdminLayout />
            </SuperAdminRoute>
          }
        >
          <Route index element={<S><SuperAdminDashboard /></S>} />
          <Route path="tenants" element={<S><TenantsListPage /></S>} />
          <Route path="tenants/:tenantId" element={<S><TenantDetail /></S>} />
          <Route path="tickets" element={<S><PlatformTicketsInbox /></S>} />
          <Route path="tickets/:ticketId" element={<S><PlatformTicketDetail /></S>} />
          <Route path="users" element={<S><CrossTenantUsersPage /></S>} />
          <Route path="settings" element={<S><SuperAdminSettingsPage /></S>} />
          <Route path="pricing" element={<S><AgencyPricingPage /></S>} />
        </Route>

        {/* ═══════════════════════════════════════════════════
            VOICE AI — Main Application
            ═══════════════════════════════════════════════════ */}
        <Route
          path="/"
          element={
            <TenantRoute>
              <DashboardLayout />
            </TenantRoute>
          }
        >
          <Route index element={<Navigate to="/voice/dashboard-v2" replace />} />

          {/* Voice AI Pages */}
          <Route path="voice/dashboard-v2" element={<S><VoiceDashboardV2Page /></S>} />
          <Route path="voice/agents-list" element={<S><VoiceAgentsListPage /></S>} />
          <Route path="voice/agent-builder" element={<S><VoiceAgentBuilderPage /></S>} />
          <Route path="voice/agent-builder/:agentId" element={<S><VoiceAgentBuilderPage /></S>} />
          <Route path="voice/knowledge" element={<S><VoiceKnowledgeBasePage /></S>} />
          <Route path="voice/studio" element={<S><VoiceStudioPage /></S>} />
          <Route path="voice/phone-numbers" element={<S><PhoneNumbersPage /></S>} />
          <Route path="voice/channels" element={<S><ChannelsPage /></S>} />
          <Route path="voice/campaigns" element={<S><CampaignsPage /></S>} />
          <Route path="voice/call-logs" element={<S><CallLogsPage /></S>} />
          <Route path="voice/live-calls" element={<S><LiveCallsPage /></S>} />
          <Route path="voice/analytics-dashboard" element={<S><VoiceAnalyticsDashboardPage /></S>} />
          <Route path="voice/recordings" element={<S><RecordingsPage /></S>} />
          <Route path="voice/testing" element={<S><TestingPage /></S>} />
          <Route path="voice/quality" element={<S><QualityDashboardPage /></S>} />
          <Route path="voice/integrations" element={<S><IntegrationsPage /></S>} />
          <Route path="voice/api" element={<S><ApiDeveloperPage /></S>} />
          <Route path="voice/billing" element={<S><VoiceBillingPage /></S>} />
          <Route path="voice/wallet" element={<S><WalletBillingPage /></S>} />
          <Route path="voice/tenant-pricing" element={<S><TenantPricingPage /></S>} />
          <Route path="voice/team" element={<S><TeamPage /></S>} />

          {/* Settings & Support */}
          <Route path="settings" element={<S><Settings /></S>} />
          <Route path="platform-support" element={<S><PlatformSupport /></S>} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/voice/dashboard-v2" replace />} />
      </Routes>
    </>
  )
}

export default App
