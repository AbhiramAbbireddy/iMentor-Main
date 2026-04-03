import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth as useRegularAuth } from '../../hooks/useAuth';
import { useAppState } from '../../contexts/AppStateContext';
import DeepResearchPanel from './DeepResearchPanel';
import { useDeepResearch } from '../../contexts/DeepResearchContext';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../core/Modal.jsx';
import Button from '../core/Button.jsx';
import { FileText, AlertCircle, Mic, MicOff, Globe, GraduationCap, FlaskConical, Layers, Zap, BarChart2 } from 'lucide-react';
import { useWebSpeech } from '../../hooks/useWebSpeech';

// Nature × Depth source count matrix (matches server NATURE_DEPTH_MATRIX)
const NATURE_DEPTH_MATRIX = {
   general:  { low: 30, medium: 45, high: 60 },
   academic: { low: 35, medium: 50, high: 65 },
   research: { low: 40, medium: 55, high: 70 },
};

const NATURE_OPTIONS = [
   {
      id: 'general',
      label: 'General',
      icon: Globe,
      desc: 'Broad overview blending web, news, and academic sources.',
   },
   {
      id: 'academic',
      label: 'Academic',
      icon: GraduationCap,
      desc: 'Peer-reviewed papers, citations, and scholarly databases.',
   },
   {
      id: 'research',
      label: 'Research',
      icon: FlaskConical,
      desc: 'Deep empirical analysis with maximum academic rigor.',
   },
];

const DEPTH_OPTIONS = [
   { id: 'low',    label: 'Low',    icon: Layers,    desc: 'Fast · focused' },
   { id: 'medium', label: 'Medium', icon: BarChart2, desc: 'Balanced · thorough' },
   { id: 'high',   label: 'High',   icon: Zap,       desc: 'Maximum depth' },
];

const DeepResearchPage = () => {
    const navigate = useNavigate();
    const { user: regularUser, token: regularUserToken } = useRegularAuth();
    const { currentSessionId } = useAppState();

    const { resetResearch } = useDeepResearch();

    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [nature, setNature] = useState('academic');
    const [depth, setDepth] = useState('medium');
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [recentSessions, setRecentSessions] = useState([]);
    
    // Voice input
    const { transcript, listening, isSpeechSupported, startListening, stopListening } = useWebSpeech();

    // Sync voice transcript with query input
    useEffect(() => {
        if (transcript) {
            setQuery(transcript);
        }
    }, [transcript]);

    useEffect(() => {
        const fetchRecent = async () => {
            if (!regularUserToken) return;
            try {
                const response = await api.getDeepResearchHistory();
                const data = response?.data || {};
                const jobs = (data.jobs || []).filter(j => j.status === 'completed');
                const legacy = data.legacy || [];
                // Show the 5 most recent across both types
                const recent = [...jobs, ...legacy]
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(0, 5);
                setRecentSessions(recent);
            } catch (err) {
                console.error('Recent sessions fetch error', err);
            }
        };
        fetchRecent();
    }, [regularUserToken]);

    const startResearch = async (e) => {
        if (e) e.preventDefault();
        if (!query.trim() || isSearching) return;

        setIsSearching(true);
        try {
            const result = await api.startResearchJob({ query: query.trim(), nature, depth });
            toast.success(
                (t) => (
                    <span>
                        Research queued!{' '}
                        <button
                            onClick={() => { toast.dismiss(t.id); navigate('/tools/deep-research/history'); }}
                            className="ml-1 underline text-xs font-bold"
                        >
                            View progress →
                        </button>
                    </span>
                ),
                { duration: 6000 }
            );
            setQuery('');
            navigate('/tools/deep-research/history');
        } catch (err) {
            console.error('Failed to start research job:', err);
            toast.error(err?.response?.data?.error || err.message || 'Failed to start research.');
        } finally {
            setIsSearching(false);
        }
    };

    // If not searching, show Hero Input
    if (!isSearching) {
        const srcCount = NATURE_DEPTH_MATRIX[nature]?.[depth] ?? 50;
        return (
            <div className="min-h-screen h-screen bg-[#0A0A0A] text-white flex flex-row overflow-hidden font-sans">
                
                {/* Left Sidebar Widget */}
                <aside className="w-[280px] border-r border-[#1F1F1F] bg-[#0B0B0B] flex flex-col flex-shrink-0 z-20 h-full relative">
                    <div className="p-6">
                        <button
                            onClick={() => navigate('/')}
                            className="text-[11px] font-bold text-gray-400 uppercase tracking-widest hover:text-white transition-colors flex items-center"
                        >
                            ← Back to Dashboard
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto px-6 py-2 custom-scrollbar" data-deep-research-tour="recent-research">
                        <div className="flex items-center justify-between mb-4 border-b border-[#1F1F1F] pb-4">
                            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Recent Research</h3>
                        </div>
                        <div className="space-y-3">
                            {recentSessions.length === 0 ? (
                                <p className="text-xs text-gray-500 italic">No recent sessions found.</p>
                            ) : (
                                recentSessions.map(session => (
                                    <div
                                        key={session._id}
                                        onClick={() => navigate(session.resultId
                                            ? `/tools/deep-research/view/${session.resultId}`
                                            : `/tools/deep-research/view/${session._id}`
                                        )}
                                        className="flex flex-col items-start p-3 bg-[#111] border border-[#1F1F1F] rounded hover:border-gray-500 cursor-pointer transition-colors group"
                                    >
                                        <span className="text-[13px] text-gray-200 group-hover:text-white font-medium mb-1 line-clamp-2 w-full text-left leading-snug">
                                            {session.title || session.query}
                                        </span>
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                                            {new Date(session.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    
                    <div className="p-6 border-t border-[#1F1F1F]">
                        <button
                            onClick={() => navigate('/tools/deep-research/history')}
                            data-deep-research-tour="library-button"
                            className="flex items-center justify-center w-full px-4 py-2 bg-[#1F1F1F] text-gray-300 text-[11px] font-bold uppercase tracking-widest rounded hover:bg-gray-700 transition-colors"
                        >
                            <FileText className="w-3.5 h-3.5 mr-2" />
                            Full Archive
                        </button>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 flex flex-col items-center justify-center relative overflow-y-auto custom-scrollbar">
                    {/* Background Decor */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-[#0A0A0A] to-[#0A0A0A] pointer-events-none"></div>

                    <div className="z-10 w-full max-w-2xl px-6 py-12">
                        <div className="mb-10 text-center">
                            <div className="inline-block px-3 py-1 mb-4 border border-[#333] rounded-full text-[10px] uppercase tracking-widest text-gray-500 font-bold bg-[#111]">
                                Hybrid Knowledge Engine
                            </div>
                            <h1 className="text-5xl font-serif font-medium text-white mb-4 tracking-tight">
                                Deep Research
                            </h1>
                            <p className="text-gray-400 text-lg leading-relaxed max-w-lg mx-auto">
                                Conduct PhD-level analysis across academic journals, technical documentation, and real-time web sources.
                            </p>
                        </div>

                        <form onSubmit={startResearch} className="relative group" data-deep-research-tour="hero-input">
                            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-500 pointer-events-none"></div>
                            <div className="relative bg-[#111] border border-[#333] rounded-xl overflow-hidden focus-within:border-gray-500 transition-colors">
                                <div className="relative">
                                    <textarea
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                startResearch();
                                            }
                                        }}
                                        placeholder="What do you want to research?"
                                        data-deep-research-tour="query-input"
                                        className="w-full bg-transparent p-6 pr-16 text-lg text-white placeholder:text-gray-600 outline-none resize-none min-h-[120px]"
                                    />
                                    {/* Voice Input Button */}
                                    {isSpeechSupported && (
                                        <button
                                            type="button"
                                            onClick={listening ? stopListening : startListening}
                                            className={`absolute right-4 top-4 p-2.5 rounded-lg transition-all ${
                                                listening
                                                    ? 'bg-red-500/20 text-red-400 animate-pulse'
                                                    : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-white'
                                            }`}
                                            title={listening ? 'Stop listening' : 'Voice input'}
                                            aria-label={listening ? 'Stop listening' : 'Voice input'}
                                        >
                                            {listening ? <MicOff size={20} /> : <Mic size={20} />}
                                        </button>
                                    )}
                                </div>

                                {/* Nature selector */}
                                <div className="px-4 pt-4 pb-2 border-t border-[#1e1e1e]">
                                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Nature</p>
                                    <div className="grid grid-cols-3 gap-2" data-deep-research-tour="nature-selector">
                                        {NATURE_OPTIONS.map(({ id, label, icon: Icon, desc }) => (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => setNature(id)}
                                                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                                                    nature === id
                                                        ? 'border-blue-500/60 bg-blue-500/10 text-white'
                                                        : 'border-[#2a2a2a] bg-[#0f0f0f] text-gray-400 hover:border-gray-600 hover:text-white'
                                                }`}
                                            >
                                                <Icon className={`w-4 h-4 mb-1.5 ${nature === id ? 'text-blue-400' : 'text-gray-500'}`} />
                                                <span className="text-xs font-semibold">{label}</span>
                                                <span className="text-[10px] text-gray-500 mt-0.5 leading-tight">{desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Depth selector */}
                                <div className="px-4 pt-2 pb-4">
                                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Depth</p>
                                    <div className="grid grid-cols-3 gap-2" data-deep-research-tour="depth-selector">
                                        {DEPTH_OPTIONS.map(({ id, label, icon: Icon, desc }) => {
                                            const count = NATURE_DEPTH_MATRIX[nature]?.[id] ?? '—';
                                            return (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    onClick={() => setDepth(id)}
                                                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                                                        depth === id
                                                            ? 'border-purple-500/60 bg-purple-500/10 text-white'
                                                            : 'border-[#2a2a2a] bg-[#0f0f0f] text-gray-400 hover:border-gray-600 hover:text-white'
                                                    }`}
                                                >
                                                    <Icon className={`w-4 h-4 mb-1.5 ${depth === id ? 'text-purple-400' : 'text-gray-500'}`} />
                                                    <span className="text-xs font-semibold">{label}</span>
                                                    <span className="text-[10px] text-gray-500 mt-0.5">{desc} · {count} sources</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex justify-between items-center px-4 py-3 bg-[#0f0f0f] border-t border-[#222]">
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
                                        <span>OpenAlex · Semantic Scholar · ArXiv · Web</span>
                                        <span className="ml-2 text-[11px] bg-[#1a1a1a] border border-[#2a2a2a] px-2 py-0.5 rounded text-gray-400">
                                            ~{srcCount} sources · fire &amp; forget
                                        </span>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={!query.trim() || isSearching}
                                        data-deep-research-tour="start-button"
                                        className="px-6 py-2 bg-white text-black text-sm font-bold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {isSearching ? 'Submitting…' : 'Start Research'}
                                    </button>
                                </div>
                            </div>
                        </form>

                        <div className="mt-10 grid grid-cols-3 gap-4 text-center">
                            {[
                                { label: 'Sources', val: `${NATURE_DEPTH_MATRIX[nature]?.[depth] ?? 50}+` },
                                { label: 'Academic Share', val: nature === 'general' ? '60%+' : nature === 'academic' ? '70%+' : '75%+' },
                                { label: 'Report Length', val: depth === 'low' ? '2-3 pages' : depth === 'medium' ? '3-4 pages' : '4-5 pages' },
                            ].map((stat, i) => (
                                <div key={i} className="p-4 border border-[#161616] rounded-lg bg-[#0F0F0F]">
                                    <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">{stat.label}</div>
                                    <div className="text-sm font-bold text-gray-300">{stat.val}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>

                <Modal
                    isOpen={isErrorModalOpen}
                    onClose={() => setIsErrorModalOpen(false)}
                    title="Service Interruption"
                >
                    <div className="flex flex-col items-center text-center p-2">
                        <div className="bg-red-500/10 p-4 rounded-full mb-4">
                            <AlertCircle className="text-red-500" size={40} />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Deep Research Busy</h3>
                        <p className="text-gray-400 mb-6 leading-relaxed">
                            The Deep Research engine is currently handling multiple complex queries.
                            Please wait a moment before trying again, or try a shorter query.
                        </p>
                        <Button
                            variant="primary"
                            className="w-full"
                            onClick={() => setIsErrorModalOpen(false)}
                        >
                            Understood
                        </Button>
                    </div>
                </Modal>
            </div>
        );
    }

    // Active Research UI (legacy SSE path — kept for backward compat)
    return (
        <DeepResearchPanel
            onToggleMode={() => {
                resetResearch();
                setIsSearching(false);
                setQuery('');
            }}
        />
    );
};

export default DeepResearchPage;
