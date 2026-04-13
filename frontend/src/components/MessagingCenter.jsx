/**
 * Messaging Center Component
 * Unified interface for WhatsApp, SMS, and Email campaigns
 */

import React, { useState, useCallback } from 'react';
import {
  MessageSquare,
  Mail,
  Phone,
  Send,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronDown,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Zap
} from 'lucide-react';

// Message Types Tab Component
const MessageTabs = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-green-600' },
    { id: 'sms', label: 'SMS', icon: Phone, color: 'text-blue-600' },
    { id: 'email', label: 'Email', icon: Mail, color: 'text-purple-600' },
  ];
  
  return (
    <div className="flex border-b">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
            activeTab === tab.id
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? tab.color : ''}`} />
          <span className="font-medium">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

// Template Selector Component
const TemplateSelector = ({ templates, onSelect, type }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  
  const handleSelect = (template) => {
    setSelected(template);
    onSelect(template);
    setIsOpen(false);
  };
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50 w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="text-sm">
            {selected ? selected.name : 'Select Template'}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
          {templates.map((template) => (
            <button
              key={template.id || template.name}
              onClick={() => handleSelect(template)}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
            >
              <div className="font-medium text-sm">{template.name}</div>
              <div className="text-xs text-gray-500 truncate">{template.preview}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Recipient Selector Component
const RecipientSelector = ({ recipients, onAdd, onRemove }) => {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const handleAdd = () => {
    if (input.trim()) {
      onAdd(input.trim());
      setInput('');
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };
  
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Recipients
      </label>
      
      <div className="border rounded-lg p-2 min-h-[80px]">
        <div className="flex flex-wrap gap-2 mb-2">
          {recipients.map((recipient, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm"
            >
              {recipient}
              <button
                onClick={() => onRemove(index)}
                className="hover:text-indigo-900"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add phone number or email..."
            className="flex-1 text-sm border-0 focus:ring-0 p-0"
          />
          <button
            onClick={handleAdd}
            className="text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-4 mt-2">
        <button className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
          <Users className="w-4 h-4" />
          Import from CRM
        </button>
        <button className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
          <FileText className="w-4 h-4" />
          Upload CSV
        </button>
      </div>
    </div>
  );
};

// WhatsApp Compose Component
const WhatsAppCompose = ({ onSend }) => {
  const [recipients, setRecipients] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [provider, setProvider] = useState('wati');
  
  const templates = [
    { name: 'Lead Follow-up', preview: 'Hi {{name}}, thank you for your interest...', params: ['name', 'product'] },
    { name: 'Appointment Reminder', preview: 'Reminder: Your appointment on {{date}}...', params: ['name', 'date', 'time'] },
    { name: 'Payment Reminder', preview: 'Payment of ₹{{amount}} is due...', params: ['name', 'amount', 'due_date'] },
    { name: 'Order Confirmation', preview: 'Your order #{{order_id}} is confirmed...', params: ['name', 'order_id'] },
  ];
  
  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setMessage(template.preview);
  };
  
  const handleSend = () => {
    onSend({
      type: 'whatsapp',
      recipients,
      message,
      template: selectedTemplate,
      provider
    });
  };
  
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="flex-1">
          <TemplateSelector
            templates={templates}
            onSelect={handleTemplateSelect}
            type="whatsapp"
          />
        </div>
        <div>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="wati">WATI</option>
            <option value="gupshup">Gupshup</option>
            <option value="twilio">Twilio</option>
          </select>
        </div>
      </div>
      
      <RecipientSelector
        recipients={recipients}
        onAdd={(r) => setRecipients([...recipients, r])}
        onRemove={(i) => setRecipients(recipients.filter((_, idx) => idx !== i))}
      />
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Type your message or select a template..."
        />
        {selectedTemplate && (
          <div className="mt-2 text-sm text-gray-500">
            Variables: {selectedTemplate.params.map(p => `{{${p}}}`).join(', ')}
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {recipients.length} recipients selected
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Schedule
          </button>
          <button
            onClick={handleSend}
            disabled={recipients.length === 0 || !message}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};

// SMS Compose Component
const SMSCompose = ({ onSend }) => {
  const [recipients, setRecipients] = useState([]);
  const [message, setMessage] = useState('');
  const [checkDND, setCheckDND] = useState(true);
  const [smsType, setSmsType] = useState('transactional');
  const [provider, setProvider] = useState('msg91');
  
  const charCount = message.length;
  const smsCount = Math.ceil(charCount / 160) || 1;
  
  const handleSend = () => {
    onSend({
      type: 'sms',
      recipients,
      message,
      checkDND,
      smsType,
      provider
    });
  };
  
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="msg91">MSG91</option>
            <option value="twilio">Twilio</option>
            <option value="textlocal">TextLocal</option>
          </select>
        </div>
        <div>
          <select
            value={smsType}
            onChange={(e) => setSmsType(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="transactional">Transactional</option>
            <option value="promotional">Promotional</option>
            <option value="otp">OTP</option>
          </select>
        </div>
      </div>
      
      <RecipientSelector
        recipients={recipients}
        onAdd={(r) => setRecipients([...recipients, r])}
        onRemove={(i) => setRecipients(recipients.filter((_, idx) => idx !== i))}
      />
      
      {smsType === 'promotional' && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          <div className="flex-1">
            <span className="text-sm text-yellow-700">
              Promotional SMS will be filtered for DND numbers
            </span>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={checkDND}
              onChange={(e) => setCheckDND(e.target.checked)}
              className="rounded text-indigo-600"
            />
            <span className="text-sm">Check DND</span>
          </label>
        </div>
      )}
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={480}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Type your SMS message..."
        />
        <div className="flex justify-between mt-1 text-sm text-gray-500">
          <span>{charCount} / 480 characters</span>
          <span>{smsCount} SMS{smsCount > 1 ? 's' : ''}</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {recipients.length} recipients × {smsCount} SMS = {recipients.length * smsCount} credits
        </div>
        <button
          onClick={handleSend}
          disabled={recipients.length === 0 || !message}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
          Send SMS
        </button>
      </div>
    </div>
  );
};

// Email Compose Component
const EmailCompose = ({ onSend }) => {
  const [recipients, setRecipients] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [provider, setProvider] = useState('sendgrid');
  
  const templates = [
    { name: 'Welcome Email', preview: 'Welcome to {{company}}!' },
    { name: 'Lead Notification', preview: 'New lead received: {{name}}' },
    { name: 'Daily Report', preview: 'Your daily call report for {{date}}' },
    { name: 'Call Summary', preview: 'Call summary with {{customer}}' },
  ];
  
  const handleSend = () => {
    onSend({
      type: 'email',
      recipients,
      subject,
      body,
      provider
    });
  };
  
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="flex-1">
          <TemplateSelector
            templates={templates}
            onSelect={(t) => {
              setSubject(t.preview);
            }}
            type="email"
          />
        </div>
        <div>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="sendgrid">SendGrid</option>
            <option value="mailgun">Mailgun</option>
            <option value="smtp">SMTP</option>
          </select>
        </div>
      </div>
      
      <RecipientSelector
        recipients={recipients}
        onAdd={(r) => setRecipients([...recipients, r])}
        onRemove={(i) => setRecipients(recipients.filter((_, idx) => idx !== i))}
      />
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Email subject..."
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Body
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Email body (HTML supported)..."
        />
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button className="px-3 py-1 text-sm border rounded hover:bg-gray-50">
            Preview
          </button>
          <button className="px-3 py-1 text-sm border rounded hover:bg-gray-50">
            Attach File
          </button>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Schedule
          </button>
          <button
            onClick={handleSend}
            disabled={recipients.length === 0 || !subject || !body}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send Email
          </button>
        </div>
      </div>
    </div>
  );
};

// Campaign History Component
const CampaignHistory = ({ campaigns }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700';
      case 'running': return 'bg-blue-100 text-blue-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'scheduled': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };
  
  const getTypeIcon = (type) => {
    switch (type) {
      case 'whatsapp': return <MessageSquare className="w-4 h-4 text-green-600" />;
      case 'sms': return <Phone className="w-4 h-4 text-blue-600" />;
      case 'email': return <Mail className="w-4 h-4 text-purple-600" />;
      default: return null;
    }
  };
  
  return (
    <div className="space-y-3">
      {campaigns.map((campaign) => (
        <div
          key={campaign.id}
          className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50"
        >
          <div className="flex-shrink-0">
            {getTypeIcon(campaign.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{campaign.name}</div>
            <div className="text-xs text-gray-500">
              {campaign.sent} sent • {campaign.delivered} delivered • {campaign.date}
            </div>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(campaign.status)}`}>
            {campaign.status}
          </span>
          <button className="p-1 hover:bg-gray-200 rounded">
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      ))}
    </div>
  );
};

// Main Messaging Center Component
export const MessagingCenter = () => {
  const [activeTab, setActiveTab] = useState('whatsapp');
  const [showHistory, setShowHistory] = useState(false);
  
  // Mock campaign history
  const campaigns = [
    { id: 1, type: 'whatsapp', name: 'Lead Follow-up Campaign', sent: 150, delivered: 145, status: 'completed', date: '2 hours ago' },
    { id: 2, type: 'sms', name: 'Payment Reminder', sent: 80, delivered: 75, status: 'completed', date: '5 hours ago' },
    { id: 3, type: 'email', name: 'Weekly Newsletter', sent: 500, delivered: 485, status: 'running', date: 'In progress' },
    { id: 4, type: 'whatsapp', name: 'Promotional Offer', sent: 0, delivered: 0, status: 'scheduled', date: 'Tomorrow 10:00 AM' },
  ];
  
  const handleSend = async (data) => {
    console.log('Sending:', data);
    // API call would go here
    alert(`Sending ${data.type} to ${data.recipients.length} recipients`);
  };
  
  return (
    <div className="bg-white rounded-xl shadow-sm">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Messaging Center</h2>
          <p className="text-sm text-gray-500">Send WhatsApp, SMS, and Email campaigns</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
              showHistory ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            History
          </button>
          <button className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm flex items-center gap-2 hover:bg-indigo-700">
            <Zap className="w-4 h-4" />
            Quick Send
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <MessageTabs activeTab={activeTab} onTabChange={setActiveTab} />
      
      {/* Content */}
      <div className="p-4">
        {showHistory ? (
          <CampaignHistory campaigns={campaigns} />
        ) : (
          <>
            {activeTab === 'whatsapp' && <WhatsAppCompose onSend={handleSend} />}
            {activeTab === 'sms' && <SMSCompose onSend={handleSend} />}
            {activeTab === 'email' && <EmailCompose onSend={handleSend} />}
          </>
        )}
      </div>
    </div>
  );
};

export default MessagingCenter;
