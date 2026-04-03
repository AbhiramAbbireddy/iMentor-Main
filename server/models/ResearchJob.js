const mongoose = require('mongoose');

/**
 * ResearchJob — tracks fire-and-forget deep research executions.
 *
 * A job is created immediately when the user submits the research request;
 * the actual pipeline runs asynchronously (background).
 * The frontend polls GET /api/deep-research/jobs/:jobId for status updates.
 */

const progressEventSchema = new mongoose.Schema({
    phase: { type: String },
    message: { type: String },
    timestamp: { type: Date, default: Date.now },
}, { _id: false });

const researchJobSchema = new mongoose.Schema({
    // ── Identity ──────────────────────────────────────────────────────────────
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },

    // ── Input ─────────────────────────────────────────────────────────────────
    query: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000,
    },
    nature: {
        type: String,
        enum: ['general', 'academic', 'research'],
        default: 'academic',
    },
    depth: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium',
    },

    // ── Execution State ────────────────────────────────────────────────────────
    status: {
        type: String,
        enum: ['queued', 'running', 'completed', 'failed'],
        default: 'queued',
        index: true,
    },
    progress: {
        type: [progressEventSchema],
        default: [],
    },
    currentPhase: {
        type: String,
        default: 'queued',
    },

    // ── Result (populated on completion) ─────────────────────────────────────
    resultId: {
        // Reference to ResearchCache document that holds the full report
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ResearchCache',
        default: null,
    },
    /** Quick summary metrics stored directly on job for list views */
    resultMeta: {
        totalSources:     { type: Number, default: 0 },
        academicSources:  { type: Number, default: 0 },
        webSources:       { type: Number, default: 0 },
        confidenceScore:  { type: Number, default: 0 },
        reportTitle:      { type: String, default: '' },
        openAlexCount:    { type: Number, default: 0 },
        semanticCount:    { type: Number, default: 0 },
        arxivCount:       { type: Number, default: 0 },
        webCount:         { type: Number, default: 0 },
        goldStandardCount: { type: Number, default: 0 },
        pageEstimate:     { type: Number, default: 0 },
    },

    // ── Error ─────────────────────────────────────────────────────────────────
    error: {
        type: String,
        default: null,
    },

    // ── Timing ────────────────────────────────────────────────────────────────
    createdAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    startedAt:   { type: Date, default: null },
    completedAt: { type: Date, default: null },
});

// ── Instance helpers ─────────────────────────────────────────────────────────

/** Append a progress event and save. */
researchJobSchema.methods.addProgress = async function (phase, message) {
    this.progress.push({ phase, message, timestamp: new Date() });
    this.currentPhase = phase;
    await this.save();
};

/** Mark the job as running. */
researchJobSchema.methods.markRunning = async function () {
    this.status = 'running';
    this.startedAt = new Date();
    this.currentPhase = 'running';
    await this.save();
};

/** Mark the job as completed with result references. */
researchJobSchema.methods.markCompleted = async function (resultId, meta = {}) {
    this.status = 'completed';
    this.resultId = resultId;
    this.resultMeta = { ...this.resultMeta, ...meta };
    this.currentPhase = 'completed';
    this.completedAt = new Date();
    await this.save();
};

/** Mark the job as failed. */
researchJobSchema.methods.markFailed = async function (errorMessage) {
    this.status = 'failed';
    this.error = String(errorMessage).slice(0, 1000);
    this.currentPhase = 'failed';
    this.completedAt = new Date();
    await this.save();
};

module.exports = mongoose.model('ResearchJob', researchJobSchema);
