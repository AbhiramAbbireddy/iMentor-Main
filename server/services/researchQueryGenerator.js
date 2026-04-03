const log = require('../utils/logger');
const { LLMRouter } = require('./llmRouterService');

/**
 * Research Query Generator
 *
 * Responsibilities:
 *  1. Use the LLM to generate source-type-specific query sets (OpenAlex, Semantic Scholar,
 *     ArXiv, Web) given a research topic + Nature + Depth.
 *  2. Remove redundant queries using token-level cosine similarity before dispatching.
 *
 * Design philosophy:
 *  - Each source type gets its own specialised query set because the vocabulary, filters
 *    and result type differ between academic metadata APIs and live web crawls.
 *  - Deduplication is cheap (no embedding model needed) and prevents wasting API budget
 *    on near-duplicate queries that return the same papers.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
    'the','and','with','from','that','this','for','are','is','was','to','of','in','on',
    'at','by','an','or','as','it','its','be','been','has','have','had','will','would',
    'could','should','do','does','did','not','but','all','can','may','use','used','also',
    'more','most','some','any','how','what','when','where','why','which','who'
]);

function tokenize(text = '') {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Jaccard-like similarity on token sets.
 * Avoids building vectors; fast enough for 100-query dedup.
 */
function querySimilarity(a, b) {
    const setA = new Set(tokenize(a));
    const setB = new Set(tokenize(b));
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const t of setA) { if (setB.has(t)) intersection++; }
    return intersection / Math.sqrt(setA.size * setB.size); // cosine-like
}

/**
 * Remove queries that are too similar to any already-kept query.
 * @param {string[]} queries
 * @param {number}   threshold  – 0.72 is a good balance; raise for stricter dedup
 */
function deduplicateQueries(queries, threshold = 0.72) {
    const kept = [];
    for (const q of queries) {
        const isDuplicate = kept.some(k => querySimilarity(q, k) >= threshold);
        if (!isDuplicate) kept.push(q);
    }
    return kept;
}

/**
 * Fallback template-based query builder when the LLM is unavailable.
 */
function buildTemplateQueries(topic, nature, sourceType) {
    const base = [
        topic,
        `${topic} empirical study`,
        `${topic} systematic review`,
        `${topic} longitudinal data`,
        `${topic} meta-analysis`,
        `${topic} survey results`,
        `${topic} case study findings`,
        `${topic} quantitative analysis`,
        `${topic} causal mechanism`,
        `${topic} policy implications`,
        `${topic} limitations future research`,
        `${topic} counter evidence critique`,
    ];

    if (sourceType === 'arxiv') {
        return [
            `${topic} preprint`,
            `${topic} neural network recent`,
            `${topic} deep learning arxiv`,
            `${topic} transformer model evaluation`,
            `${topic} benchmark dataset arxiv`,
            `${topic} experimental results 2024`,
            `${topic} novel approach`,
            `${topic} state of the art comparison`,
        ];
    }

    if (sourceType === 'web') {
        return [
            `${topic} report 2024 2025`,
            `${topic} industry analysis`,
            `${topic} government whitepaper`,
            `${topic} latest findings news`,
            `${topic} technical report recent`,
            `${topic} expert commentary`,
        ];
    }

    return base;
}

// ---------------------------------------------------------------------------
// Config mappings
// ---------------------------------------------------------------------------

/**
 * Number of queries to generate per source type based on depth.
 */
const QUERY_COUNT_BY_DEPTH = {
    low:    { openalex: 6,  semantic: 5,  arxiv: 4,  web: 4  },
    medium: { openalex: 10, semantic: 8,  arxiv: 6,  web: 5  },
    high:   { openalex: 15, semantic: 12, arxiv: 9,  web: 7  },
};

// ---------------------------------------------------------------------------
// Main Service
// ---------------------------------------------------------------------------

const researchQueryGenerator = {

    /**
     * Generate deduplicated query sets for each source provider.
     *
     * @param {string} topic            – raw research question from the user
     * @param {object} researchConfig   – must include { nature, depth }
     * @param {string|null} userId
     * @returns {Promise<{openalex: string[], semantic: string[], arxiv: string[], web: string[]}>}
     */
    async generateQuerySets(topic, researchConfig, userId = null) {
        const nature = (researchConfig.nature || 'academic').toLowerCase();
        const depth  = (researchConfig.depth  || 'medium').toLowerCase();
        const counts = QUERY_COUNT_BY_DEPTH[depth] || QUERY_COUNT_BY_DEPTH.medium;

        log.info('RESEARCH', `Generating query sets — nature=${nature}, depth=${depth}`);

        // Build LLM prompt once for all source types
        const prompt = buildQueryGenerationPrompt(topic, nature, depth, counts);

        let parsed = null;
        try {
            const raw = await LLMRouter.generate({
                query: prompt,
                userId,
                deepResearchContext: true,
                systemPrompt: 'You are a research query specialist. Output only valid JSON with no markdown fences.'
            });

            const jsonMatch = (typeof raw === 'string' ? raw : '').match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0].replace(/[\u0000-\u001F]/g, ' '));
            }
        } catch (err) {
            log.warn('RESEARCH', `Query generation LLM failed: ${err.message} — using templates`);
        }

        // Extract or fallback per provider
        const extract = (key, sourceType) => {
            const raw = (parsed?.[key] || []).filter(q => typeof q === 'string' && q.trim().length > 5);
            const base = raw.length >= 3 ? raw : buildTemplateQueries(topic, nature, sourceType);
            return deduplicateQueries(base, 0.72).slice(0, counts[key] + 4); // +4 buffer before cross-type dedup
        };

        const rawSets = {
            openalex: extract('openalex', 'openalex'),
            semantic: extract('semantic', 'semantic'),
            arxiv:    extract('arxiv',    'arxiv'),
            web:      extract('web',      'web'),
        };

        // Cross-type dedup: also remove queries that already appear in a higher-priority set
        const allPrimary = [...rawSets.openalex, ...rawSets.semantic];
        rawSets.arxiv = rawSets.arxiv.filter(q => !allPrimary.some(p => querySimilarity(q, p) >= 0.80));
        rawSets.web   = rawSets.web.filter(q =>
            !allPrimary.some(p => querySimilarity(q, p) >= 0.80) &&
            !rawSets.arxiv.some(a => querySimilarity(q, a) >= 0.80)
        );

        // Trim to target counts
        return {
            openalex: rawSets.openalex.slice(0, counts.openalex),
            semantic: rawSets.semantic.slice(0, counts.semantic),
            arxiv:    rawSets.arxiv.slice(0, counts.arxiv),
            web:      rawSets.web.slice(0, counts.web),
        };
    },

    // Exposed for unit testing
    deduplicateQueries,
    querySimilarity,
};

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildQueryGenerationPrompt(topic, nature, depth, counts) {
    const natureGuide = {
        general: `Focus on broad, accessible explanations and cross-disciplinary impact. Include policy, societal, and practical angles.`,
        academic: `Focus on peer-reviewed evidence, methodological approaches, empirical datasets, and scholarly debates.`,
        research: `Focus on cutting-edge preprints, technical benchmarks, novel methodologies, reproducibility, and open research questions.`,
    }[nature] || '';

    return `
You are a specialist in academic database search strategies. Your task is to generate DIVERSE, NON-REDUNDANT search queries for the research topic below, tailored to each specific source type.

RESEARCH TOPIC: "${topic}"
NATURE: ${nature} — ${natureGuide}
DEPTH: ${depth}

QUERY COUNTS REQUIRED:
- openalex: ${counts.openalex} queries  (academic citation graph API, subject metadata, cited_by_count)
- semantic: ${counts.semantic} queries  (Semantic Scholar, semantic similarity, concept-driven retrieval)
- arxiv: ${counts.arxiv} queries        (preprints, technical papers, recent experimental work)
- web: ${counts.web} queries            (recent reports, news, whitepapers, government documents — RECENT ONLY, last 3 months preferred)

RULES:
1. Each query must be UNIQUE — do NOT repeat the same idea with slightly different wording.
2. OpenAlex queries should be citation-weighted, use subject terminology, avoid informal phrasing.
3. Semantic Scholar queries should exploit concept similarity — use related fields, synonyms, cross-domain bridges.
4. ArXiv queries should be narrow and technical — use terms like "preprint", exact model names, benchmark names.
5. Web queries should target news, policy reports, industry whitepapers from the LAST 3 MONTHS — use year/date terms.
6. Cover: main claims, counter-evidence, methodological critique, quantitative signals, longitudinal trends.
7. DO NOT include the word "query" or numbering in the output strings.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "openalex": ["query1", "query2", ...],
  "semantic": ["query1", "query2", ...],
  "arxiv": ["query1", "query2", ...],
  "web": ["query1", "query2", ...]
}
`;
}

module.exports = researchQueryGenerator;
