import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useDeepResearch } from '../../contexts/DeepResearchContext';
import {
    Clock, FileText, ChevronRight, History, PlayCircle, Star, ArrowLeft,
    Loader2, CheckCircle2, XCircle, AlertTriangle, Globe, GraduationCap,
    FlaskConical, BookOpen, Layers, Zap, BarChart2, Database
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    queued: {
        label: 'Queued',
        bg: 'bg-gray-700/40',
        text: 'text-gray-400',
        border: 'border-gray-700',
        icon: Clock,
        pulse: false,
    },
    running: {
        label: 'Running',
        bg: 'bg-blue-500/15',
        text: 'text-blue-400',
        border: 'border-blue-500/40',
        icon: Loader2,
        pulse: true,
    },
    completed: {
        label: 'Completed',
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-400',
        border: 'border-emerald-500/40',
        icon: CheckCircle2,
        pulse: false,
    },
    failed: {
        label: 'Failed',
        bg: 'bg-red-500/15',
        text: 'text-red-400',
        border: 'border-red-500/40',
        icon: XCircle,
        pulse: false,
    },
};

const NATURE_ICON = {
    general: Globe,
    academic: GraduationCap,
    research: FlaskConical,
};

const DEPTH_ICON = {
    low: Layers,
    medium: BarChart2,
    high: Zap,
};

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            <Icon className={`w-3 h-3 ${cfg.pulse ? 'animate-spin' : ''}`} />
            {cfg.label}
        </span>
    );
}

function ProviderPills({ meta }) {
    if (!meta) return null;
    const pills = [
        meta.openAlexCount   && { label: `OA ${meta.openAlexCount}`,     color: 'text-blue-400'   },
        meta.semanticCount   && { label: `SS ${meta.semanticCount}`,     color: 'text-purple-400' },
        meta.arxivCount      && { label: `Ax ${meta.arxivCount}`,        color: 'text-orange-400' },
        meta.webCount        && { label: `Web ${meta.webCount}`,         color: 'text-cyan-400'   },
        meta.goldStandardCount && { label: `Gold ${meta.goldStandardCount}`, color: 'text-yellow-400' },
    ].filter(Boolean);

    if (!pills.length) return null;
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {pills.map((p, i) => (
                <span key={i} className={`text-[10px] font-semibold bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 rounded ${p.color}`}>
                    {p.label}
                </span>
            ))}
        </div>
    );
}

function JobCard({ job, onClick }) {
    const NatureIcon = NATURE_ICON[job.nature] || BookOpen;
    const DepthIcon  = DEPTH_ICON[job.depth]   || Layers;
    const isRunning  = job.status === 'running' || job.status === 'queued';
    const meta       = job.resultMeta || {};
    const lastProgress = job.progress?.length
        ? job.progress[job.progress.length - 1]
        : null;

    return (
        <li
            onClick={job.status === 'completed' ? onClick : undefined}
            className={`group px-5 py-4 transition-colors flex flex-col gap-2 border-b border-[#1A1A1A] relative
                ${job.status === 'completed' ? 'hover:bg-[#121212] cursor-pointer' : 'opacity-80 cursor-default'}`}
        >
            {/* Title row */}
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-[13px] font-medium text-[#FFFFFF] leading-snug line-clamp-2 flex-1">
                    {meta.reportTitle || job.query}
                </h3>
                <StatusBadge status={job.status} />
            </div>

            {/* Meta row: nature + depth + date */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#666]">
                <span className="flex items-center gap-1">
                    <NatureIcon className="w-3 h-3" />
                    <span className="capitalize">{job.nature || '—'}</span>
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                    <DepthIcon className="w-3 h-3" />
                    <span className="capitalize">{job.depth || '—'} depth</span>
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(job.createdAt).toLocaleString()}
                </span>
            </div>

            {/* Completed stats */}
            {job.status === 'completed' && meta.totalSources && (
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#777] mt-0.5">
                    <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        {meta.totalSources} sources
                    </span>
                    {meta.confidenceScore != null && (
                        <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                                <Star className={`w-3 h-3 ${meta.confidenceScore >= 80 ? 'text-yellow-400 fill-yellow-400' : ''}`} />
                                {meta.confidenceScore}/100
                            </span>
                        </>
                    )}
                    {meta.pageEstimate != null && (
                        <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                ~{meta.pageEstimate} pages
                            </span>
                        </>
                    )}
                </div>
            )}

            {/* Provider breakdown pills */}
            {job.status === 'completed' && <ProviderPills meta={meta} />}

            {/* Running: show current phase */}
            {isRunning && (
                <div className="flex items-center gap-2 text-[11px] text-blue-400 mt-1">
                    <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                    <span className="truncate">{job.currentPhase || lastProgress?.message || 'Preparing…'}</span>
                </div>
            )}

            {/* Failed: show error */}
            {job.status === 'failed' && job.error && (
                <p className="text-[11px] text-red-400 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    {job.error}
                </p>
            )}

            {/* Hover open icon */}
            {job.status === 'completed' && (
                <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[11px] text-[#00D1FF] flex items-center gap-1 font-medium">
                        <PlayCircle className="w-4 h-4" /> Open
                    </span>
                </div>
            )}
        </li>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ResearchHistory = () => {
    const { setIsResearchMode } = useDeepResearch();
    const navigate = useNavigate();
    const location = useLocation();

    const [jobs, setJobs] = useState([]);
    const [legacy, setLegacy] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [tab, setTab] = useState('jobs'); // 'jobs' | 'legacy'
    const pollRef = useRef(null);

    const fetchHistory = useCallback(async () => {
        try {
            const data = await api.listResearchJobs();
            setJobs(data.jobs || []);
            setLegacy(data.legacy || []);
        } catch (error) {
            console.error('Failed to load history:', error);
            toast.error('Failed to load research archive.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // Auto-poll every 8s while any job is running/queued
    useEffect(() => {
        const hasActive = jobs.some(j => j.status === 'running' || j.status === 'queued');
        if (hasActive) {
            pollRef.current = setInterval(fetchHistory, 8000);
        } else {
            clearInterval(pollRef.current);
        }
        return () => clearInterval(pollRef.current);
    }, [jobs, fetchHistory]);

    const handleJobClick = (job) => {
        if (job.resultId) {
            navigate(`/tools/deep-research/view/${job.resultId}`);
        }
    };

    const handleLegacyClick = (item) => {
        navigate(`/tools/deep-research/view/${item._id}`);
    };

    const handleBack = () => {
        setIsResearchMode(false);
        if (location.pathname.includes('/history') || location.pathname.includes('/view/')) {
            navigate('/tools/deep-research');
        } else {
            navigate('/');
        }
    };

    const activeJobs   = jobs.filter(j => j.status === 'running' || j.status === 'queued');
    const finishedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed');

    return (
        <div className="flex flex-col h-full bg-[#0B0B0B] border-l border-[#2A2A2A]">
            {/* Header */}
            <div className="px-6 py-4 flex flex-col gap-4 border-b border-[#1A1A1A]">
                <button
                    onClick={handleBack}
                    className="flex items-center text-[11px] text-[#666666] hover:text-[#FFFFFF] transition-colors uppercase tracking-widest font-semibold"
                >
                    <ArrowLeft className="w-3 h-3 mr-1.5" /> Back to Workspace
                </button>
                <div className="flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold text-[#FFFFFF] tracking-wide flex items-center">
                        <History className="w-4 h-4 mr-2 text-[#B3B3B3]" />
                        Research Archive
                    </h2>
                    {activeJobs.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            {activeJobs.length} running
                        </span>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1">
                    {['jobs', 'legacy'].map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`text-[11px] uppercase tracking-wider font-semibold px-3 py-1 rounded transition-colors ${
                                tab === t
                                    ? 'bg-[#1a1a1a] text-white border border-[#333]'
                                    : 'text-[#555] hover:text-[#aaa]'
                            }`}
                        >
                            {t === 'jobs' ? `Jobs (${jobs.length})` : `Legacy (${legacy.length})`}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {isLoading ? (
                    <div className="px-6 py-8 flex items-center gap-2 text-[13px] text-[#B3B3B3]">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading archive…
                    </div>
                ) : tab === 'jobs' ? (
                    <>
                        {/* Active jobs section */}
                        {activeJobs.length > 0 && (
                            <div>
                                <div className="px-5 py-2 text-[10px] uppercase tracking-widest text-blue-400 font-bold bg-blue-500/5 border-b border-[#1a1a1a]">
                                    In Progress
                                </div>
                                <ul>
                                    {activeJobs.map(job => (
                                        <JobCard key={job._id} job={job} onClick={() => handleJobClick(job)} />
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Finished jobs */}
                        {finishedJobs.length > 0 ? (
                            <div>
                                {activeJobs.length > 0 && (
                                    <div className="px-5 py-2 text-[10px] uppercase tracking-widest text-[#555] font-bold bg-[#0d0d0d] border-b border-[#1a1a1a]">
                                        Completed
                                    </div>
                                )}
                                <ul>
                                    {finishedJobs.map(job => (
                                        <JobCard key={job._id} job={job} onClick={() => handleJobClick(job)} />
                                    ))}
                                </ul>
                            </div>
                        ) : activeJobs.length === 0 ? (
                            <div className="px-6 py-10 text-center">
                                <History className="w-8 h-8 text-[#333] mx-auto mb-3" />
                                <p className="text-[13px] text-[#666]">No research jobs yet.</p>
                                <button
                                    onClick={() => navigate('/tools/deep-research')}
                                    className="mt-4 text-[11px] text-blue-400 hover:text-blue-300 underline"
                                >
                                    Start your first research →
                                </button>
                            </div>
                        ) : null}
                    </>
                ) : (
                    /* Legacy tab */
                    legacy.length === 0 ? (
                        <div className="px-6 py-8 text-[13px] text-[#B3B3B3]">
                            No legacy archives found.
                        </div>
                    ) : (
                        <ul className="divide-y divide-[#1A1A1A]">
                            {legacy.map((item) => (
                                <li
                                    key={item._id}
                                    onClick={() => handleLegacyClick(item)}
                                    className="group px-6 py-4 hover:bg-[#121212] transition-colors text-left cursor-pointer flex flex-col gap-1.5 relative"
                                >
                                    <h3 className="text-[14px] font-medium text-[#FFFFFF] leading-snug line-clamp-2 pr-6">
                                        {item.title || item.query}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#B3B3B3] mt-1">
                                        <span className="flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5" />
                                            {new Date(item.createdAt).toLocaleDateString()}
                                        </span>
                                        {(item.onlineSourceCount != null || item.localSourceCount != null) && (
                                            <>
                                                <span>•</span>
                                                <span>{(item.onlineSourceCount || 0) + (item.localSourceCount || 0)} Sources</span>
                                            </>
                                        )}
                                        {item.overallConfidenceScore >= 80 && (
                                            <>
                                                <span>•</span>
                                                <span className="text-[#FFFFFF] flex items-center gap-1 font-medium bg-[#1A1A1A] px-1.5 rounded-sm">
                                                    <Star className="w-3 h-3 fill-current" /> High Consensus
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-[11px] text-[#00D1FF] flex items-center gap-1 font-medium">
                                            <PlayCircle className="w-4 h-4" /> Open
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )
                )}
            </div>
        </div>
    );
};

export default ResearchHistory;
