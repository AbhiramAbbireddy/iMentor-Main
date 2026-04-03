// frontend/src/components/layout/FeedbackWidget.jsx
/**
 * FeedbackWidget
 * ──────────────
 * A compact icon button in the TopNav (next to the XP badge) that opens a
 * floating popover where users can report bugs or request enhancements.
 *
 * Distinct from message-level 👍 / 👎 — this is product-level feedback that
 * goes to the admin UserFeedbackManager.
 *
 * Endpoint: POST /api/user/feedback  { type, category, message }
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bug, Lightbulb, MessageSquare, Send, X, Flag } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPES = [
    { id: 'bug',     label: 'Bug Report',  Icon: Bug,          color: '#f87171' },  // red-400
    { id: 'feature', label: 'Enhancement', Icon: Lightbulb,    color: '#60a5fa' },  // blue-400
    { id: 'general', label: 'General',     Icon: MessageSquare, color: '#a3a3a3' }, // neutral-400
];

const CATEGORIES = ['UI', 'Performance', 'Content', 'AI Quality', 'Other'];

const MIN_LEN = 10;
const MAX_LEN = 1000;

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeedbackWidget() {
    const [open, setOpen]         = useState(false);
    const [type, setType]         = useState('bug');
    const [category, setCategory] = useState('Other');
    const [message, setMessage]   = useState('');
    const [submitting, setSubmitting] = useState(false);

    const panelRef  = useRef(null);
    const triggerRef = useRef(null);
    const textareaRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (
                panelRef.current  && !panelRef.current.contains(e.target) &&
                triggerRef.current && !triggerRef.current.contains(e.target)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Focus textarea when panel opens
    useEffect(() => {
        if (open) {
            setTimeout(() => textareaRef.current?.focus(), 80);
        }
    }, [open]);

    const reset = useCallback(() => {
        setType('bug');
        setCategory('Other');
        setMessage('');
    }, []);

    const handleClose = useCallback(() => {
        setOpen(false);
        reset();
    }, [reset]);

    const handleSubmit = useCallback(async () => {
        const trimmed = message.trim();
        if (trimmed.length < MIN_LEN) {
            toast.error(`Please write at least ${MIN_LEN} characters.`);
            return;
        }
        setSubmitting(true);
        try {
            await api.submitUserFeedback({ type, category, message: trimmed });
            toast.success('Thanks! Your feedback was submitted.', { icon: '🎯' });
            handleClose();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to submit feedback.');
        } finally {
            setSubmitting(false);
        }
    }, [type, category, message, handleClose]);

    const remaining = MAX_LEN - message.length;
    const tooShort  = message.trim().length < MIN_LEN && message.length > 0;
    const selectedType = TYPES.find(t => t.id === type);

    return (
        <div className="relative flex-shrink-0">
            {/* ── Trigger button ────────────────────────────────────────── */}
            <button
                ref={triggerRef}
                onClick={() => setOpen(v => !v)}
                title="Report a bug or suggest an enhancement"
                aria-label="Open feedback panel"
                aria-expanded={open}
                style={{
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    width:          '26px',
                    height:         '26px',
                    borderRadius:   '4px',
                    border:         open
                        ? '1px solid var(--vs-border-hi)'
                        : '1px solid transparent',
                    background:     open ? 'var(--vs-surface)' : 'transparent',
                    color:          open ? 'var(--vs-text)' : 'var(--vs-text-dim)',
                    cursor:         'pointer',
                    transition:     'all 0.15s',
                    flexShrink:     0,
                }}
                onMouseEnter={e => {
                    if (!open) {
                        e.currentTarget.style.color      = 'var(--vs-text-lo)';
                        e.currentTarget.style.background = 'var(--vs-hover)';
                    }
                }}
                onMouseLeave={e => {
                    if (!open) {
                        e.currentTarget.style.color      = 'var(--vs-text-dim)';
                        e.currentTarget.style.background = 'transparent';
                    }
                }}
            >
                <Flag size={13} />
            </button>

            {/* ── Popover panel ─────────────────────────────────────────── */}
            {open && (
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-label="Submit feedback"
                    style={{
                        position:     'absolute',
                        top:          'calc(100% + 8px)',
                        right:        0,
                        width:        '320px',
                        background:   'var(--vs-panel)',
                        border:       '1px solid var(--vs-border-hi)',
                        borderRadius: '6px',
                        boxShadow:    '0 12px 32px rgba(0,0,0,0.55)',
                        zIndex:       9999,
                        overflow:     'hidden',
                        animation:    'feedbackFadeIn 0.12s ease',
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            display:       'flex',
                            alignItems:    'center',
                            justifyContent:'space-between',
                            padding:       '10px 12px 9px',
                            borderBottom:  '1px solid var(--vs-border)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <Flag size={13} style={{ color: 'var(--vs-text-lo)' }} />
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vs-text)', letterSpacing: '0.01em' }}>
                                Share Feedback
                            </span>
                        </div>
                        <button
                            onClick={handleClose}
                            style={{
                                background: 'transparent',
                                border:     'none',
                                color:      'var(--vs-text-dim)',
                                cursor:     'pointer',
                                padding:    '2px',
                                display:    'flex',
                                borderRadius: '3px',
                            }}
                            aria-label="Close feedback panel"
                        >
                            <X size={13} />
                        </button>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '12px' }}>

                        {/* Type selector */}
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--vs-text-dim)', marginBottom: '6px' }}>
                                Type
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {TYPES.map(({ id, label, Icon, color }) => {
                                    const active = type === id;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => setType(id)}
                                            style={{
                                                flex:          1,
                                                display:       'flex',
                                                flexDirection: 'column',
                                                alignItems:    'center',
                                                gap:           '4px',
                                                padding:       '7px 4px',
                                                borderRadius:  '5px',
                                                border:        active
                                                    ? `1px solid ${color}55`
                                                    : '1px solid var(--vs-border)',
                                                background:    active
                                                    ? `${color}18`
                                                    : 'var(--vs-surface)',
                                                color:         active ? color : 'var(--vs-text-dim)',
                                                cursor:        'pointer',
                                                transition:    'all 0.15s',
                                                fontSize:      '10px',
                                                fontWeight:    active ? 600 : 400,
                                            }}
                                        >
                                            <Icon size={14} />
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Category */}
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--vs-text-dim)', marginBottom: '6px' }}>
                                Category
                            </div>
                            <select
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                style={{
                                    width:        '100%',
                                    padding:      '6px 8px',
                                    background:   'var(--vs-surface)',
                                    border:       '1px solid var(--vs-border)',
                                    borderRadius: '4px',
                                    color:        'var(--vs-text)',
                                    fontSize:     '12px',
                                    cursor:       'pointer',
                                    outline:      'none',
                                    appearance:   'none',
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                                    backgroundRepeat:   'no-repeat',
                                    backgroundPosition: 'right 8px center',
                                    paddingRight: '28px',
                                }}
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c} value={c} style={{ background: '#1a1a1a' }}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {/* Message */}
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                                <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--vs-text-dim)' }}>
                                    Description
                                </div>
                                <div style={{ fontSize: '10px', color: remaining < 100 ? '#f87171' : 'var(--vs-text-dim)' }}>
                                    {remaining} left
                                </div>
                            </div>
                            <textarea
                                ref={textareaRef}
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                maxLength={MAX_LEN}
                                rows={4}
                                placeholder={
                                    type === 'bug'
                                        ? 'What happened? Steps to reproduce...'
                                        : type === 'feature'
                                            ? 'Describe the enhancement you\'d like to see...'
                                            : 'Share your thoughts...'
                                }
                                style={{
                                    width:        '100%',
                                    padding:      '8px 10px',
                                    background:   'var(--vs-bg)',
                                    border:       tooShort
                                        ? '1px solid #f87171'
                                        : '1px solid var(--vs-border)',
                                    borderRadius: '4px',
                                    color:        '#ffffff',
                                    fontSize:     '12px',
                                    lineHeight:   1.5,
                                    resize:       'vertical',
                                    outline:      'none',
                                    fontFamily:   'inherit',
                                    boxSizing:    'border-box',
                                    transition:   'border-color 0.15s',
                                }}
                                onFocus={e => { e.target.style.borderColor = 'var(--vs-border-hi)'; }}
                                onBlur={e => { e.target.style.borderColor = tooShort ? '#f87171' : 'var(--vs-border)'; }}
                            />
                            {tooShort && (
                                <div style={{ fontSize: '10px', color: '#f87171', marginTop: '3px' }}>
                                    At least {MIN_LEN} characters required
                                </div>
                            )}
                        </div>

                        {/* Submit */}
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || message.trim().length < MIN_LEN}
                            style={{
                                width:        '100%',
                                display:      'flex',
                                alignItems:   'center',
                                justifyContent: 'center',
                                gap:          '6px',
                                padding:      '8px',
                                background:   (submitting || message.trim().length < MIN_LEN)
                                    ? 'var(--vs-surface)'
                                    : selectedType?.color || '#ffffff',
                                border:       '1px solid transparent',
                                borderRadius: '4px',
                                color:        (submitting || message.trim().length < MIN_LEN)
                                    ? 'var(--vs-text-dim)'
                                    : '#000000',
                                fontSize:     '12px',
                                fontWeight:   600,
                                cursor:       (submitting || message.trim().length < MIN_LEN) ? 'not-allowed' : 'pointer',
                                transition:   'all 0.15s',
                                opacity:      (submitting || message.trim().length < MIN_LEN) ? 0.5 : 1,
                            }}
                        >
                            {submitting ? (
                                <>
                                    <div style={{
                                        width: '12px', height: '12px', borderRadius: '50%',
                                        border: '2px solid currentColor', borderTopColor: 'transparent',
                                        animation: 'spin 0.6s linear infinite',
                                        flexShrink: 0,
                                    }} />
                                    Submitting…
                                </>
                            ) : (
                                <>
                                    <Send size={12} />
                                    Submit {selectedType?.label}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Inline keyframe styles */}
            <style>{`
                @keyframes feedbackFadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
