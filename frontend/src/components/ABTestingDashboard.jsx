/**
 * A/B Testing Dashboard & Analytics Components
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  Beaker,
  Play,
  Pause,
  Trophy,
  ChevronRight,
  Plus,
  Settings,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Percent
} from 'lucide-react';

// ==================== A/B Testing Components ====================

// Experiment Card Component
const ExperimentCard = ({ experiment, onStart, onStop, onView }) => {
  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-700',
      running: 'bg-green-100 text-green-700',
      paused: 'bg-yellow-100 text-yellow-700',
      completed: 'bg-blue-100 text-blue-700'
    };
    return styles[status] || styles.draft;
  };
  
  const winningVariant = experiment.variants?.reduce((best, current) => 
    (current.conversionRate > (best?.conversionRate || 0)) ? current : best
  , null);
  
  return (
    <div className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Beaker className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold">{experiment.name}</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">{experiment.description}</p>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(experiment.status)}`}>
          {experiment.status}
        </span>
      </div>
      
      {/* Variants Overview */}
      <div className="mt-4 space-y-2">
        {experiment.variants?.slice(0, 2).map((variant) => (
          <div key={variant.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {winningVariant?.id === variant.id && experiment.status === 'completed' && (
                <Trophy className="w-4 h-4 text-yellow-500" />
              )}
              <span className={variant.id === winningVariant?.id ? 'font-medium' : ''}>
                {variant.name}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-500">{variant.impressions} impressions</span>
              <span className="font-medium text-indigo-600">{variant.conversionRate}%</span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Actions */}
      <div className="mt-4 pt-4 border-t flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {experiment.totalImpressions} total calls
        </div>
        <div className="flex gap-2">
          {experiment.status === 'draft' && (
            <button
              onClick={() => onStart(experiment.id)}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm flex items-center gap-1 hover:bg-green-700"
            >
              <Play className="w-3 h-3" />
              Start
            </button>
          )}
          {experiment.status === 'running' && (
            <button
              onClick={() => onStop(experiment.id)}
              className="px-3 py-1 bg-yellow-600 text-white rounded text-sm flex items-center gap-1 hover:bg-yellow-700"
            >
              <Pause className="w-3 h-3" />
              Stop
            </button>
          )}
          <button
            onClick={() => onView(experiment)}
            className="px-3 py-1 border rounded text-sm flex items-center gap-1 hover:bg-gray-50"
          >
            View Details
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Variant Comparison Chart
const VariantComparison = ({ variants }) => {
  const maxConversion = Math.max(...variants.map(v => v.conversionRate || 0), 1);
  
  return (
    <div className="space-y-4">
      {variants.map((variant, index) => (
        <div key={variant.id}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">{variant.name}</span>
            <span className="text-sm text-gray-500">
              {variant.conversionRate}% ({variant.conversions}/{variant.impressions})
            </span>
          </div>
          <div className="w-full h-8 bg-gray-100 rounded-lg overflow-hidden relative">
            <div
              className={`h-full ${index === 0 ? 'bg-indigo-500' : 'bg-purple-500'} transition-all duration-500`}
              style={{ width: `${(variant.conversionRate / maxConversion) * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
              {variant.conversionRate}%
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Create Experiment Modal
const CreateExperimentModal = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [variants, setVariants] = useState([
    { name: 'Control', script: '' },
    { name: 'Variant A', script: '' }
  ]);
  
  const addVariant = () => {
    setVariants([...variants, { name: `Variant ${String.fromCharCode(65 + variants.length - 1)}`, script: '' }]);
  };
  
  const updateVariant = (index, field, value) => {
    const updated = [...variants];
    updated[index][field] = value;
    setVariants(updated);
  };
  
  const handleCreate = () => {
    onCreate({ name, description, variants });
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Create A/B Test</h2>
        </div>
        
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Experiment Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="e.g., Opening Script Test"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              rows={2}
              placeholder="What are you testing?"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Variants
              </label>
              <button
                onClick={addVariant}
                className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Variant
              </button>
            </div>
            
            <div className="space-y-3">
              {variants.map((variant, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <input
                    type="text"
                    value={variant.name}
                    onChange={(e) => updateVariant(index, 'name', e.target.value)}
                    className="w-full border-0 border-b pb-2 mb-2 font-medium focus:ring-0"
                    placeholder="Variant name"
                  />
                  <textarea
                    value={variant.script}
                    onChange={(e) => updateVariant(index, 'script', e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    rows={3}
                    placeholder="Script content..."
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name || variants.length < 2}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            Create Experiment
          </button>
        </div>
      </div>
    </div>
  );
};

// A/B Testing Dashboard
export const ABTestingDashboard = () => {
  const [experiments, setExperiments] = useState([
    {
      id: '1',
      name: 'Opening Script Test',
      description: 'Testing formal vs casual opening',
      status: 'running',
      totalImpressions: 450,
      variants: [
        { id: 'a', name: 'Formal Opening', impressions: 225, conversions: 45, conversionRate: 20 },
        { id: 'b', name: 'Casual Opening', impressions: 225, conversions: 54, conversionRate: 24 }
      ]
    },
    {
      id: '2',
      name: 'Price Anchor Test',
      description: 'Testing price presentation order',
      status: 'completed',
      totalImpressions: 1000,
      variants: [
        { id: 'a', name: 'High to Low', impressions: 500, conversions: 85, conversionRate: 17 },
        { id: 'b', name: 'Low to High', impressions: 500, conversions: 120, conversionRate: 24 }
      ]
    }
  ]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState(null);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">A/B Testing</h1>
          <p className="text-gray-500">Test and optimize your call scripts</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 hover:bg-indigo-700"
        >
          <Plus className="w-5 h-5" />
          New Experiment
        </button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Active Tests</span>
            <Beaker className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold mt-2">
            {experiments.filter(e => e.status === 'running').length}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Total Calls</span>
            <Users className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-2xl font-bold mt-2">
            {experiments.reduce((sum, e) => sum + e.totalImpressions, 0)}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Avg Improvement</span>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-2xl font-bold mt-2 text-green-600">+18%</div>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Completed Tests</span>
            <CheckCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold mt-2">
            {experiments.filter(e => e.status === 'completed').length}
          </div>
        </div>
      </div>
      
      {/* Experiments List */}
      <div className="grid gap-4">
        {experiments.map((experiment) => (
          <ExperimentCard
            key={experiment.id}
            experiment={experiment}
            onStart={(id) => console.log('Start', id)}
            onStop={(id) => console.log('Stop', id)}
            onView={setSelectedExperiment}
          />
        ))}
      </div>
      
      {/* Create Modal */}
      <CreateExperimentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={(data) => console.log('Create:', data)}
      />
    </div>
  );
};


// ==================== Analytics Components ====================

// Sentiment Trend Chart
export const SentimentTrendChart = ({ data, period = '30d' }) => {
  // Mock data visualization
  const mockData = [
    { date: '1', positive: 65, negative: 15, neutral: 20 },
    { date: '2', positive: 70, negative: 12, neutral: 18 },
    { date: '3', positive: 62, negative: 18, neutral: 20 },
    { date: '4', positive: 75, negative: 10, neutral: 15 },
    { date: '5', positive: 68, negative: 14, neutral: 18 },
    { date: '6', positive: 72, negative: 11, neutral: 17 },
    { date: '7', positive: 78, negative: 8, neutral: 14 },
  ];
  
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Sentiment Trend</h3>
        <select className="text-sm border rounded px-2 py-1">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>
      
      {/* Simple bar chart representation */}
      <div className="flex items-end gap-1 h-32">
        {mockData.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end">
            <div
              className="bg-red-400 rounded-t"
              style={{ height: `${d.negative}%` }}
            />
            <div
              className="bg-gray-300"
              style={{ height: `${d.neutral}%` }}
            />
            <div
              className="bg-green-400 rounded-b"
              style={{ height: `${d.positive}%` }}
            />
          </div>
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-sm">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-400 rounded" />
          <span>Positive</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gray-300 rounded" />
          <span>Neutral</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-400 rounded" />
          <span>Negative</span>
        </div>
      </div>
    </div>
  );
};

// Competitor Mentions Widget
export const CompetitorMentionsWidget = () => {
  const competitors = [
    { name: 'SharyX', mentions: 24, sentiment: 'negative', trend: 'up' },
    { name: 'Bolna AI', mentions: 18, sentiment: 'neutral', trend: 'down' },
    { name: 'SquadStack', mentions: 12, sentiment: 'positive', trend: 'stable' },
    { name: 'Exotel', mentions: 8, sentiment: 'neutral', trend: 'up' },
  ];
  
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Competitor Mentions</h3>
        <button className="text-sm text-indigo-600 hover:text-indigo-700">
          View Details
        </button>
      </div>
      
      <div className="space-y-3">
        {competitors.map((comp) => (
          <div key={comp.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">{comp.name}</span>
              {comp.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
              {comp.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{comp.mentions} mentions</span>
              <span className={`w-2 h-2 rounded-full ${
                comp.sentiment === 'positive' ? 'bg-green-500' :
                comp.sentiment === 'negative' ? 'bg-red-500' : 'bg-gray-400'
              }`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Analytics Dashboard
export const AnalyticsDashboard = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-gray-500">Call sentiment and competitive insights</p>
        </div>
        <button className="px-4 py-2 border rounded-lg flex items-center gap-2 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center gap-2 text-green-600">
            <TrendingUp className="w-5 h-5" />
            <span className="text-sm font-medium">Positive Rate</span>
          </div>
          <div className="text-2xl font-bold mt-2">72%</div>
          <div className="text-sm text-gray-500">+5% vs last week</div>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center gap-2 text-red-600">
            <TrendingDown className="w-5 h-5" />
            <span className="text-sm font-medium">Negative Rate</span>
          </div>
          <div className="text-2xl font-bold mt-2">12%</div>
          <div className="text-sm text-gray-500">-3% vs last week</div>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center gap-2 text-blue-600">
            <Target className="w-5 h-5" />
            <span className="text-sm font-medium">Conversion Rate</span>
          </div>
          <div className="text-2xl font-bold mt-2">24%</div>
          <div className="text-sm text-gray-500">+2% vs last week</div>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center gap-2 text-purple-600">
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">Total Calls</span>
          </div>
          <div className="text-2xl font-bold mt-2">1,247</div>
          <div className="text-sm text-gray-500">This week</div>
        </div>
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <SentimentTrendChart />
        <CompetitorMentionsWidget />
      </div>
      
      {/* Top Issues */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-semibold mb-4">Top Issues from Negative Calls</h3>
        <div className="space-y-3">
          {[
            { issue: 'Pricing concerns', count: 34, trend: 'up' },
            { issue: 'Product availability', count: 28, trend: 'stable' },
            { issue: 'Support response time', count: 22, trend: 'down' },
            { issue: 'Feature requests', count: 18, trend: 'up' },
            { issue: 'Billing issues', count: 12, trend: 'down' },
          ].map((item) => (
            <div key={item.issue} className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{item.issue}</span>
                  <span className="text-sm text-gray-500">{item.count} calls</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-400 rounded-full"
                    style={{ width: `${(item.count / 34) * 100}%` }}
                  />
                </div>
              </div>
              {item.trend === 'up' && <TrendingUp className="w-4 h-4 text-red-500" />}
              {item.trend === 'down' && <TrendingDown className="w-4 h-4 text-green-500" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ABTestingDashboard;
