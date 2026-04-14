/**
 * BillingPage - Light Theme Indian-focused Pricing & Billing
 * White pricing cards, indigo accents, clean design
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  CreditCard, Check, Zap, Crown, Building2, ArrowRight,
  Download, ChevronDown, Clock, Phone, Bot, Star, Shield,
  Sparkles, TrendingUp, ExternalLink, IndianRupee, Receipt
} from 'lucide-react';

/* ─── Plans Data ───────────────────────────────────────────────── */

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for small businesses getting started with Voice AI',
    priceMonthly: 2999,
    priceAnnual: 2399,
    icon: Zap,
    gradient: 'from-emerald-500 to-teal-600',
    popular: false,
    features: [
      { text: '2 AI Agents', included: true },
      { text: '500 minutes/month', included: true },
      { text: '5 languages', included: true },
      { text: 'Basic analytics', included: true },
      { text: 'Email support', included: true },
      { text: 'Widget embedding', included: true },
      { text: 'Knowledge base (5 docs)', included: true },
      { text: 'Emotion detection', included: false },
      { text: 'Custom voice cloning', included: false },
      { text: 'API access', included: false },
      { text: 'White-label', included: false },
    ],
    limits: { minutes: 500, agents: 2, documents: 5 },
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'For growing teams that need advanced Voice AI capabilities',
    priceMonthly: 9999,
    priceAnnual: 7999,
    icon: Crown,
    gradient: 'from-indigo-500 to-violet-600',
    popular: true,
    features: [
      { text: '10 AI Agents', included: true },
      { text: '5,000 minutes/month', included: true },
      { text: '11 languages + dialects', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Priority support (24h)', included: true },
      { text: 'Widget embedding', included: true },
      { text: 'Knowledge base (50 docs)', included: true },
      { text: 'Emotion detection', included: true },
      { text: 'Custom voice cloning', included: true },
      { text: 'API access', included: true },
      { text: 'White-label', included: false },
    ],
    limits: { minutes: 5000, agents: 10, documents: 50 },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with custom Voice AI requirements',
    priceMonthly: 24999,
    priceAnnual: 19999,
    icon: Building2,
    gradient: 'from-amber-500 to-orange-600',
    popular: false,
    features: [
      { text: 'Unlimited AI Agents', included: true },
      { text: '25,000 minutes/month', included: true },
      { text: 'All languages + dialects', included: true },
      { text: 'Enterprise analytics + reports', included: true },
      { text: 'Dedicated support manager', included: true },
      { text: 'Widget embedding', included: true },
      { text: 'Unlimited knowledge base', included: true },
      { text: 'Emotion detection + GenZ', included: true },
      { text: 'Custom voice cloning', included: true },
      { text: 'Full API access + webhooks', included: true },
      { text: 'White-label + custom domain', included: true },
    ],
    limits: { minutes: 25000, agents: 999, documents: 999 },
  },
];

/* ─── Current Usage Mock ───────────────────────────────────────── */

const CURRENT_PLAN = 'professional';
const CURRENT_USAGE = {
  minutesUsed: 3842,
  minutesLimit: 5000,
  agentsCreated: 4,
  agentsLimit: 10,
  docsUploaded: 12,
  docsLimit: 50,
  billingCycleEnd: '2026-04-30',
};

const INVOICES = [
  { id: 'INV-2026-003', date: '2026-03-01', amount: 9999, status: 'paid', plan: 'Professional' },
  { id: 'INV-2026-002', date: '2026-02-01', amount: 9999, status: 'paid', plan: 'Professional' },
  { id: 'INV-2026-001', date: '2026-01-01', amount: 2999, status: 'paid', plan: 'Starter' },
  { id: 'INV-2025-012', date: '2025-12-01', amount: 2999, status: 'paid', plan: 'Starter' },
  { id: 'INV-2025-011', date: '2025-11-01', amount: 2999, status: 'paid', plan: 'Starter' },
];

/* ─── Price Formatter ──────────────────────────────────────────── */

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN').format(amount);
}

/* ─── Usage Meter ──────────────────────────────────────────────── */

function UsageMeter({ label, used, limit, icon: Icon, color }) {
  const pct = Math.min((used / limit) * 100, 100);
  const isHigh = pct >= 80;
  const limitText = limit >= 999 ? 'Unlimited' : limit.toLocaleString();

  return (
    <div className="p-5 rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${color} shadow-sm`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-medium text-slate-900">{label}</span>
        </div>
        <span className={`text-xs font-semibold ${isHigh ? 'text-amber-600' : 'text-slate-500'}`}>
          {used.toLocaleString()} / {limitText}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-gradient-to-r from-amber-500 to-red-500' : `bg-gradient-to-r ${color}`}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-slate-400 mt-2">{Math.round(pct)}% used &middot; Resets {usage.billingCycleEnd}</p>
    </div>
  );
}

/* ─── Plan Card ────────────────────────────────────────────────── */

function PlanCard({ plan, isAnnual, isCurrent, onSelect }) {
  const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;
  const annualSavings = isAnnual ? (plan.priceMonthly - plan.priceAnnual) * 12 : 0;

  return (
    <div className={`relative rounded-2xl border overflow-hidden transition-all duration-300 shadow-sm hover:shadow-lg ${
      plan.popular
        ? 'border-indigo-300 bg-white shadow-md shadow-indigo-100'
        : isCurrent
          ? 'border-emerald-300 bg-white'
          : 'border-gray-200 bg-white hover:border-gray-300'
    }`}>
      {/* Popular badge */}
      {plan.popular && (
        <div className="absolute top-0 left-0 right-0">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-bold uppercase tracking-wider text-center py-1.5">
            Most Popular
          </div>
        </div>
      )}

      <div className={`p-6 ${plan.popular ? 'pt-10' : ''}`}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${plan.gradient} shadow-md`}>
            <plan.icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
            {isCurrent && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <Check className="w-3 h-3" /> Current Plan
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-5">{plan.description}</p>

        {/* Price */}
        <div className="mb-5">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-slate-900">
              <span className="text-lg">&#8377;</span>{formatINR(price)}
            </span>
            <span className="text-sm text-slate-500">/mo</span>
          </div>
          {isAnnual && annualSavings > 0 && (
            <p className="text-xs text-emerald-600 mt-1 font-medium">
              Save &#8377;{formatINR(annualSavings)}/year
            </p>
          )}
        </div>

        {/* CTA */}
        {isCurrent ? (
          <button
            disabled
            className="w-full py-3 rounded-xl border border-emerald-200 text-sm font-semibold text-emerald-600 bg-emerald-50 cursor-not-allowed"
          >
            Current Plan
          </button>
        ) : (
          <button
            onClick={() => onSelect(plan)}
            className={`w-full py-3 rounded-xl text-sm font-semibold text-white transition-all shadow-lg ${
              plan.popular
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-indigo-200'
                : `bg-gradient-to-r ${plan.gradient} hover:opacity-90`
            }`}
          >
            {PLANS.indexOf(plan) > PLANS.findIndex((p) => p.id === CURRENT_PLAN) ? 'Upgrade' : 'Downgrade'}
          </button>
        )}

        {/* Divider */}
        <div className="border-t border-gray-100 my-5" />

        {/* Features */}
        <ul className="space-y-2.5">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                f.included ? 'bg-emerald-50' : 'bg-slate-50'
              }`}>
                {f.included ? (
                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                )}
              </div>
              <span className={`text-xs ${f.included ? 'text-slate-700' : 'text-slate-400'}`}>{f.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────── */

export default function BillingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [usage, setUsage] = useState(CURRENT_USAGE);
  const [invoices, setInvoices] = useState(INVOICES);
  const [subscribing, setSubscribing] = useState(null);

  // Fetch real billing data
  useEffect(() => {
    const token = localStorage.getItem('swetha_token');
    const headers = token && token !== 'demo-token-123' ? { Authorization: `Bearer ${token}` } : {};

    // Fetch usage
    fetch('/api/v1/billing/usage', { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUsage(prev => ({ ...prev, ...data })); })
      .catch(() => {});

    // Fetch invoices
    fetch('/api/v1/billing/invoices', { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && Array.isArray(data) && data.length > 0) setInvoices(data); })
      .catch(() => {});
  }, []);

  const handleSelectPlan = async (plan) => {
    setSubscribing(plan.id);
    try {
      const token = localStorage.getItem('swetha_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token && token !== 'demo-token-123') headers.Authorization = `Bearer ${token}`;

      const resp = await fetch('/api/v1/billing/subscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          plan_id: plan.id,
          billing_cycle: isAnnual ? 'annual' : 'monthly',
          amount: isAnnual ? plan.priceAnnual : plan.priceMonthly,
          currency: 'INR',
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        // If Razorpay order returned, open checkout
        if (data.razorpay_order_id && window.Razorpay) {
          const rzp = new window.Razorpay({
            key: data.razorpay_key_id,
            amount: data.amount,
            currency: 'INR',
            name: 'VoiceFlow AI',
            description: `${plan.name} Plan - ${isAnnual ? 'Annual' : 'Monthly'}`,
            order_id: data.razorpay_order_id,
            handler: () => toast.success(`${plan.name} plan activated!`),
            prefill: { email: data.email || '' },
            theme: { color: '#6366f1' },
          });
          rzp.open();
        } else {
          toast.success(`${plan.name} plan subscription initiated!`);
        }
      } else {
        toast.success(`${plan.name} plan selected (configure Razorpay keys to enable payments)`);
      }
    } catch {
      toast.success(`${plan.name} plan selected (backend unavailable — demo mode)`);
    }
    setSubscribing(null);
  };

  const handleDownloadInvoice = (invoice) => {
    toast.success(`Downloading ${invoice.id}...`);
    // In production: window.open(`/api/v1/billing/invoices/${invoice.id}/pdf`)
  };

  return (
    <div className="-mx-4 lg:-mx-6 -mt-6 lg:-mt-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-[#fafbfe] min-h-screen px-4 lg:px-6 py-6 lg:py-8"
      >
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Plans & Billing</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            Choose the right plan for your business. All plans include core Voice AI features.
          </p>

          {/* Annual toggle */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-slate-900' : 'text-slate-400'}`}>Monthly</span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${isAnnual ? 'bg-emerald-500' : 'bg-red-400'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-in-out ${isAnnual ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className={`text-sm font-medium ${isAnnual ? 'text-slate-900' : 'text-slate-400'}`}>
              Annual
              <span className="ml-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                -20%
              </span>
            </span>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isAnnual={isAnnual}
              isCurrent={plan.id === CURRENT_PLAN}
              onSelect={handleSelectPlan}
            />
          ))}
        </div>

        {/* Usage Meters */}
        <div className="max-w-5xl mx-auto mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Current Usage</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UsageMeter
              label="Minutes Used"
              used={usage.minutesUsed}
              limit={usage.minutesLimit}
              icon={Clock}
              color="from-indigo-500 to-violet-600"
            />
            <UsageMeter
              label="Agents Created"
              used={usage.agentsCreated}
              limit={usage.agentsLimit}
              icon={Bot}
              color="from-emerald-500 to-teal-600"
            />
            <UsageMeter
              label="Documents Uploaded"
              used={usage.docsUploaded}
              limit={usage.docsLimit}
              icon={Receipt}
              color="from-amber-500 to-orange-600"
            />
          </div>
        </div>

        {/* Invoice History */}
        <div className="max-w-5xl mx-auto">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Invoice History</h2>
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Invoice</th>
                    <th className="px-6 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Plan</th>
                    <th className="px-6 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-50 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-900">{inv.id}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-500">
                          {new Date(inv.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-700">{inv.plan}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-semibold text-slate-900">&#8377;{formatINR(inv.amount)}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                          inv.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : inv.status === 'pending'
                              ? 'bg-amber-50 text-amber-600 border border-amber-200'
                              : 'bg-red-50 text-red-600 border border-red-200'
                        }`}>
                          {inv.status === 'paid' && <Check className="w-3 h-3" />}
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDownloadInvoice(inv)}
                          className="p-2 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-slate-50 transition-all"
                          title="Download Invoice"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment method note */}
          <div className="mt-6 p-4 rounded-xl border border-gray-200 bg-white flex items-center gap-3 shadow-sm">
            <Shield className="w-5 h-5 text-indigo-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-600">
                Payments are securely processed via <span className="text-indigo-600 font-semibold">Razorpay</span>.
                We support UPI, Credit/Debit Cards, Net Banking, and Wallets.
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">All prices are in INR and inclusive of applicable taxes.</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
