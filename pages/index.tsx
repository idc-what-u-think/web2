import React, { useState, useEffect } from 'react';
import { Zap, Terminal, Shield, Users, Download, Github, MessageCircle, Power, Clock, Wifi, Command, CheckCircle, XCircle, Loader } from 'lucide-react';

interface Session {
  id: string;
  phoneNumber: string;
  connectedAt: number;
  lastActivity: number;
  githubUrl?: string;
}

interface PairingResult {
  success: boolean;
  code?: string;
  phone?: string;
  sessionId?: string;
  error?: string;
  connected?: boolean;
  githubUrl?: string;
}

const FirekidPairingWebsite: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<PairingResult | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Fetch user's own sessions only
  useEffect(() => {
    if (activeTab === 'sessions') {
      fetchSessions();
    }
  }, [activeTab]);

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      } else {
        setSessions([]);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      setSessions([]);
    }
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    const cleanedNumber = phoneNumber.replace(/\D/g, '');
    
    if (!cleanedNumber) {
      showNotification('Please enter a phone number', 'error');
      return;
    }
    
    if (cleanedNumber.startsWith('0')) {
      showNotification('Phone numbers cannot start with 0', 'error');
      return;
    }
    
    if (cleanedNumber.length < 10 || cleanedNumber.length > 15) {
      showNotification('Phone number must be 10-15 digits', 'error');
      return;
    }
    
    setIsSubmitting(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/request-pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanedNumber })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setResult({
          success: true,
          code: data.pairingCode,
          phone: data.phoneNumber,
          sessionId: data.sessionId
        });
        showNotification('Pairing code generated! Waiting for connection...', 'success');
        setPhoneNumber('');
        
        // Start polling for session status
        pollSessionStatus(data.sessionId);
        
        // Confetti effect
        triggerConfetti();
      } else {
        setResult({
          success: false,
          error: data.error || 'Failed to generate pairing code'
        });
        showNotification(data.error || 'Failed to generate code', 'error');
      }
    } catch (error) {
      setResult({
        success: false,
        error: 'Network error. Please try again.'
      });
      showNotification('Network error. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pollSessionStatus = async (sessionId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes (5 second intervals)
    
    const poll = setInterval(async () => {
      attempts++;
      
      try {
        const response = await fetch(`/api/session-status/${sessionId}`);
        const data = await response.json();
        
        if (data.status === 'connected') {
          clearInterval(poll);
          showNotification('Session connected! Files uploaded to GitHub ✅', 'success');
          setResult(prev => prev ? { ...prev, connected: true, githubUrl: data.githubUrl } : null);
          fetchSessions(); // Refresh sessions list
        } else if (data.status === 'failed') {
          clearInterval(poll);
          showNotification('Session connection failed', 'error');
        } else if (attempts >= maxAttempts) {
          clearInterval(poll);
          showNotification('Session connection timeout', 'error');
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000); // Poll every 5 seconds
  };

  const triggerConfetti = () => {
    const colors = ['#00d4ff', '#0099ff', '#00ffcc', '#00ff88'];
    const confettiCount = 50;
    
    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      confetti.style.cssText = `
        position: fixed;
        width: 10px;
        height: 10px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        top: -10px;
        left: ${Math.random() * 100}%;
        opacity: 1;
        transform: rotate(${Math.random() * 360}deg);
        pointer-events: none;
        z-index: 9999;
      `;
      document.body.appendChild(confetti);
      
      const animation = confetti.animate([
        { transform: `translateY(0) rotate(0deg)`, opacity: 1 },
        { transform: `translateY(${window.innerHeight + 20}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
      ], {
        duration: 3000,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      });
      
      animation.onfinish = () => confetti.remove();
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showNotification('Code copied to clipboard!', 'success');
  };

  const disconnectSession = async (sessionId: string) => {
    try {
      await fetch('/api/disconnect-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      
      setSessions(sessions.filter(s => s.id !== sessionId));
      showNotification('Session disconnected successfully', 'success');
    } catch (error) {
      showNotification('Failed to disconnect session', 'error');
    }
  };

  const formatUptime = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const commands = {
    general: [
      { cmd: 'menu', desc: 'Show this menu' },
      { cmd: 'ping', desc: 'Check response time' },
      { cmd: 'alive', desc: 'Check bot status' },
      { cmd: 'online', desc: 'Toggle auto-read' }
    ],
    admin: [
      { cmd: 'warn', desc: 'Warn users' },
      { cmd: 'resetwarning', desc: 'Clear warnings' },
      { cmd: 'kick', desc: 'Remove members' },
      { cmd: 'promote', desc: 'Make admin' },
      { cmd: 'delete', desc: 'Delete messages' },
      { cmd: 'tagall', desc: 'Mention everyone' },
      { cmd: 'tag', desc: 'Tag without list' },
      { cmd: 'mute', desc: 'Lock group chat' },
      { cmd: 'unmute', desc: 'Unlock group chat' },
      { cmd: 'setgrppp', desc: 'Set group picture' }
    ],
    group: [
      { cmd: 'antilnk', desc: 'Anti-link system' },
      { cmd: 'allowdomain', desc: 'Whitelist domains' },
      { cmd: 'left', desc: 'Leave notifications' },
      { cmd: 'join', desc: 'Join notifications' },
      { cmd: 'filter', desc: 'Word filtering' }
    ],
    media: [
      { cmd: 'vv', desc: 'Reveal view once' },
      { cmd: 'sticker', desc: 'Create sticker' },
      { cmd: 'toimg', desc: 'Sticker to image' }
    ],
    downloader: [
      { cmd: 'ttdownload', desc: 'TikTok videos' },
      { cmd: 'song', desc: 'Download songs' },
      { cmd: 'movie', desc: 'Movie details' }
    ],
    fun: [
      { cmd: 'country', desc: 'Guess the country' },
      { cmd: 'kill', desc: 'Wasted effect' },
      { cmd: 'lyrics', desc: 'Get song lyrics' },
      { cmd: 'weather', desc: 'Weather info' },
      { cmd: 'guess', desc: 'Guess the riddle' },
      { cmd: 'wcg', desc: 'Play a word game' },
      { cmd: 'quiz', desc: 'Play a quiz game' }
    ],
    owner: [
      { cmd: 'sudo', desc: 'Manage sudo users' },
      { cmd: 'block', desc: 'Block users' },
      { cmd: 'unlock', desc: 'Unblock users' },
      { cmd: 'private', desc: 'Private mode toggle' },
      { cmd: 'update', desc: 'Update commands' }
    ]
  };

  const faqs = [
    {
      q: 'How long does pairing take?',
      a: 'Pairing typically takes 1-3 minutes. Make sure you have a stable internet connection.'
    },
    {
      q: 'Can I pair multiple numbers?',
      a: 'Yes! You can pair multiple WhatsApp numbers and manage them from the Session Manager.'
    },
    {
      q: 'What if the code expires?',
      a: 'Pairing codes expire after 10 minutes. Simply generate a new code if yours expires.'
    },
    {
      q: 'Is my data safe?',
      a: 'Yes! All sessions are encrypted and stored securely on GitHub. We never store your messages.'
    },
    {
      q: 'What happens if I disconnect?',
      a: 'Your bot will stop responding. You can reconnect anytime by generating a new pairing code.'
    }
  ];

  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 text-white">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-30">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-blue-500 blur-xl"
              style={{
                width: Math.random() * 300 + 50 + 'px',
                height: Math.random() * 300 + 50 + 'px',
                left: Math.random() * 100 + '%',
                top: Math.random() * 100 + '%',
                animation: `float ${Math.random() * 10 + 10}s infinite ease-in-out`,
                animationDelay: Math.random() * 5 + 's'
              }}
            />
          ))}
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-2xl border backdrop-blur-xl animate-slideIn ${
          toastType === 'success' 
            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-100' 
            : 'bg-red-500/20 border-red-500 text-red-100'
        }`}>
          <div className="flex items-center gap-3">
            {toastType === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
            <span className="font-medium">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/30 border-b border-cyan-500/20">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Zap className="text-cyan-400" size={32} />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Firekid XMD
              </h1>
            </div>
            <nav className="flex gap-2">
              {[
                { id: 'home', label: 'Home', icon: Zap },
                { id: 'commands', label: 'Commands', icon: Terminal },
                { id: 'sessions', label: 'Sessions', icon: Users },
                { id: 'faq', label: 'FAQ', icon: MessageCircle },
                { id: 'links', label: 'Links', icon: Github }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/50'
                      : 'text-cyan-300 hover:bg-cyan-500/10'
                  }`}
                >
                  <tab.icon size={18} />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        {/* Home Tab */}
        {activeTab === 'home' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Hero Card */}
            <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 bg-cyan-500/20 rounded-xl">
                  <Shield className="text-cyan-400" size={40} />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-cyan-400">WhatsApp Pairing</h2>
                  <p className="text-cyan-200/70">Generate your pairing code to connect your bot</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-cyan-300 font-medium mb-2">Phone Number</label>
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="2348140825959"
                    className="w-full px-4 py-3 bg-slate-900/50 border border-cyan-500/30 rounded-xl text-white placeholder-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    required
                  />
                  <p className="mt-2 text-sm text-cyan-400/60 bg-cyan-500/5 p-3 rounded-lg border-l-4 border-cyan-500">
                    <strong>Format:</strong> Numbers only • No + or 0 prefix • Example: 2348140825959
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/50 hover:shadow-cyan-500/70 transition-all transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-3"
                >
                  {isSubmitting ? (
                    <>
                      <Loader className="animate-spin" size={20} />
                      Generating Code...
                    </>
                  ) : (
                    <>
                      <Zap size={20} />
                      Generate Pairing Code
                    </>
                  )}
                </button>
              </form>

              {/* Result */}
              {result && (
                <div className={`mt-6 p-6 rounded-xl border backdrop-blur-xl animate-slideIn ${
                  result.success
                    ? 'bg-emerald-500/10 border-emerald-500'
                    : 'bg-red-500/10 border-red-500'
                }`}>
                  {result.success ? (
                    <div className="text-center">
                      <CheckCircle className="mx-auto text-emerald-400 mb-4" size={48} />
                      <h3 className="text-2xl font-bold text-emerald-400 mb-2">
                        {result.connected ? 'Connected!' : 'Code Generated!'}
                      </h3>
                      <p className="text-emerald-200/70 mb-4">Phone: +{result.phone}</p>
                      <div
                        onClick={() => result.code && copyCode(result.code)}
                        className="text-4xl font-mono font-bold tracking-widest p-6 bg-slate-900/50 border-2 border-dashed border-cyan-500 rounded-xl cursor-pointer hover:bg-slate-900/70 transition-all transform hover:scale-105"
                      >
                        {result.code}
                      </div>
                      <p className="mt-4 text-sm text-cyan-400/70">
                        <Command size={16} className="inline" /> Click code to copy • Enter in WhatsApp
                      </p>
                      {!result.connected && (
                        <div className="mt-4 flex items-center justify-center gap-2 text-yellow-400">
                          <Loader className="animate-spin" size={20} />
                          <span>Waiting for connection...</span>
                        </div>
                      )}
                      {result.connected && result.githubUrl && (
                        <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                          <p className="text-blue-400 font-medium mb-2">✅ Session files uploaded to GitHub!</p>
                          <a 
                            href={result.githubUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 underline text-sm"
                          >
                            View on GitHub →
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center">
                      <XCircle className="mx-auto text-red-400 mb-4" size={48} />
                      <h3 className="text-xl font-bold text-red-400 mb-2">Error</h3>
                      <p className="text-red-200/70">{result.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Steps */}
            <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-8 shadow-2xl">
              <h3 className="text-2xl font-bold text-blue-400 mb-6">How to Pair</h3>
              <div className="space-y-4">
                {[
                  { step: 'Enter Phone', desc: 'International format, no + or 0 prefix' },
                  { step: 'Generate Code', desc: 'Wait for 8-digit pairing code' },
                  { step: 'Open WhatsApp', desc: 'Go to Settings > Linked Devices' },
                  { step: 'Link Device', desc: 'Tap "Link a Device" > "Link with phone number"' },
                  { step: 'Enter Code', desc: 'Input the 8-digit code' },
                  { step: 'Connected!', desc: 'Your bot is now active and backed up to GitHub' }
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 bg-slate-900/30 rounded-xl border border-blue-500/20 hover:border-blue-500/50 transition-all">
                    <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-full flex items-center justify-center font-bold shadow-lg">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-cyan-400">{item.step}</h4>
                      <p className="text-sm text-cyan-200/60">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Commands Tab */}
        {activeTab === 'commands' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center gap-4 mb-6">
                <Terminal className="text-purple-400" size={40} />
                <div>
                  <h2 className="text-3xl font-bold text-purple-400">Bot Commands</h2>
                  <p className="text-purple-200/70">Complete list of available commands</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {Object.entries(commands).map(([category, cmds]) => (
                  <div key={category} className="bg-slate-900/40 rounded-xl p-6 border border-purple-500/20">
                    <h3 className="text-xl font-bold text-purple-400 mb-4 uppercase tracking-wider">
                      {category}
                    </h3>
                    <div className="space-y-3">
                      {cmds.map((cmd, i) => (
                        <div key={i} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800/70 transition-all">
                          <code className="text-cyan-400 font-mono">.{cmd.cmd}</code>
                          <span className="text-sm text-gray-400">{cmd.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <Users className="text-emerald-400" size={40} />
                  <div>
                    <h2 className="text-3xl font-bold text-emerald-400">Session Manager</h2>
                    <p className="text-emerald-200/70">View and manage your active connections</p>
                  </div>
                </div>
                <button
                  onClick={fetchSessions}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg font-medium transition-all"
                >
                  Refresh
                </button>
              </div>

              {sessions.length === 0 ? (
                <div className="text-center py-12">
                  <Wifi className="mx-auto text-gray-500 mb-4" size={64} />
                  <h3 className="text-xl font-bold text-gray-400 mb-2">No Active Sessions</h3>
                  <p className="text-gray-500">Generate a pairing code to create your first session</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sessions.map((session) => (
                    <div key={session.id} className="bg-slate-900/40 rounded-xl p-6 border border-emerald-500/20 hover:border-emerald-500/50 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-emerald-500/20 rounded-lg">
                            <Wifi className="text-emerald-400" size={24} />
                          </div>
                          <div>
                            <h4 className="text-xl font-bold text-emerald-400">+{session.phoneNumber}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                              <span className="text-sm text-emerald-300">Connected</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => disconnectSession(session.id)}
                          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg font-medium transition-all flex items-center gap-2"
                        >
                          <Power size={16} />
                          Disconnect
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-emerald-500/20">
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <Clock size={16} className="text-emerald-400" />
                          <span>Uptime: {formatUptime(session.connectedAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <Clock size={16} className="text-emerald-400" />
                          <span>Last: {formatUptime(session.lastActivity)} ago</span>
                        </div>
                      </div>

                      {session.githubUrl && (
                        <div className="mt-4 pt-4 border-t border-emerald-500/20">
                          <a 
                            href={session.githubUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-all"
                          >
                            <Github size={16} />
                            <span className="text-sm">View session on GitHub</span>
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* FAQ Tab */}
        {activeTab === 'faq' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-gradient-to-br from-orange-500/10 to-yellow-500/10 backdrop-blur-xl border border-orange-500/30 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center gap-4 mb-6">
                <MessageCircle className="text-orange-400" size={40} />
                <div>
                  <h2 className="text-3xl font-bold text-orange-400">Frequently Asked Questions</h2>
                  <p className="text-orange-200/70">Common questions and answers</p>
                </div>
              </div>

              <div className="space-y-4">
                {faqs.map((faq, i) => (
                  <div key={i} className="bg-slate-900/40 rounded-xl border border-orange-500/20 overflow-hidden">
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                      className="w-full flex justify-between items-center p-6 hover:bg-slate-900/60 transition-all"
                    >
                      <h4 className="text-lg font-bold text-orange-400 text-left">{faq.q}</h4>
                      <div className={`transform transition-transform ${expandedFaq === i ? 'rotate-180' : ''}`}>
                        ▼
                      </div>
                    </button>
                    {expandedFaq === i && (
                      <div className="px-6 pb-6 text-gray-300 animate-fadeIn">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Links Tab */}
        {activeTab === 'links' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-gradient-to-br from-pink-500/10 to-rose-500/10 backdrop-blur-xl border border-pink-500/30 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center gap-4 mb-6">
                <Github className="text-pink-400" size={40} />
                <div>
                  <h2 className="text-3xl font-bold text-pink-400">Resources & Community</h2>
                  <p className="text-pink-200/70">Connect with us and access our resources</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <a
                  href="https://github.com/Firekid-is-him/FireKid-WhatsApp-Multi-command-Bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-slate-900/40 rounded-xl p-8 border border-pink-500/20 hover:border-pink-500/50 hover:bg-slate-900/60 transition-all transform hover:scale-105"
                >
                  <Github className="text-pink-400 mb-4 group-hover:scale-110 transition-transform" size={48} />
                  <h3 className="text-xl font-bold text-pink-400 mb-2">GitHub Repository</h3>
                  <p className="text-gray-400">View source code and contribute</p>
                </a>

                <a
                  href="https://whatsapp.com/channel/0029Vb6RALu3gvWhLvAAa33Z"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-slate-900/40 rounded-xl p-8 border border-pink-500/20 hover:border-pink-500/50 hover:bg-slate-900/60 transition-all transform hover:scale-105"
                >
                  <MessageCircle className="text-emerald-400 mb-4 group-hover:scale-110 transition-transform" size={48} />
                  <h3 className="text-xl font-bold text-emerald-400 mb-2">WhatsApp Channel</h3>
                  <p className="text-gray-400">Join our community</p>
                </a>

                <a
                  href="https://t.me/firekid_ios"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-slate-900/40 rounded-xl p-8 border border-pink-500/20 hover:border-pink-500/50 hover:bg-slate-900/60 transition-all transform hover:scale-105"
                >
                  <MessageCircle className="text-blue-400 mb-4 group-hover:scale-110 transition-transform" size={48} />
                  <h3 className="text-xl font-bold text-blue-400 mb-2">Telegram Channel</h3>
                  <p className="text-gray-400">Connect on Telegram</p>
                </a>

                <div className="group bg-slate-900/40 rounded-xl p-8 border border-pink-500/20 hover:border-pink-500/50 hover:bg-slate-900/60 transition-all transform hover:scale-105">
                  <Download className="text-yellow-400 mb-4 group-hover:scale-110 transition-transform" size={48} />
                  <h3 className="text-xl font-bold text-yellow-400 mb-2">Download Bot Files</h3>
                  <p className="text-gray-400 mb-4">Get latest bot configuration</p>
                  <button
                    onClick={() => window.open('https://github.com/Firekid-is-him/FireKid-WhatsApp-Multi-command-Bot/archive/refs/heads/main.zip', '_blank')}
                    className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg transition-all"
                  >
                    Download ZIP
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-16 py-8 border-t border-cyan-500/20 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-cyan-400/60">
            Built with <span className="text-red-500">♥</span> by <span className="text-cyan-400 font-bold">Firekid</span>
          </p>
          <p className="text-cyan-600 text-sm mt-2">
            Firekid XMD © 2025 • WhatsApp Bot Pairing System
          </p>
        </div>
      </footer>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(10px, 10px) rotate(90deg); }
          50% { transform: translate(0, 20px) rotate(180deg); }
          75% { transform: translate(-10px, 10px) rotate(270deg); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }

        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }

        /* Custom Scrollbar */
        ::-webkit-scrollbar {
          width: 10px;
        }

        ::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
        }

        ::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #06b6d4, #3b82f6);
          border-radius: 5px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #0891b2, #2563eb);
        }
      `}</style>
    </div>
  );
};

export default FirekidPairingWebsite;
