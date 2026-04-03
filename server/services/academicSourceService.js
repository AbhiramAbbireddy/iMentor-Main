const log = require('../utils/logger');
/**
 * Academic Source Intelligence Layer  (v2)
 *
 * Source priority and allocation:
 *   ≥ 60%  OpenAlex + Semantic Scholar  (primary academic, free APIs)
 *   10-20% ArXiv                         (preprints, cutting-edge technical work)
 *   ≤ 30%  Web crawler                   (recent only; older sources tagged goldStandard)
 *
 * Per-query limits are owned by the orchestrator (Nature×Depth config).
 * This service fetches exactly what it is told.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const semanticScholarService = require('./semanticScholarService');

const OPENALEX_API = 'https://api.openalex.org/works';
const ARXIV_API    = 'http://export.arxiv.org/api/query';

/** Returns a Date 3 months in the past */
function threeMonthsAgo() {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d;
}

function parseDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

const academicSourceService = {
  /**
   * Unified academic retrieval — OpenAlex + Semantic Scholar + ArXiv in parallel.
   * Proportions are driven by the limit options passed by the orchestrator.
   *
   * @param {string} query
   * @param {object} options – { limit, openAlexLimit, semanticLimit, arxivLimit }
   */
  async retrieveSources(query, options = { limit: 10 }) {
    const limit         = options.limit        || 10;
    const openAlexLimit = options.openAlexLimit || Math.ceil(limit * 0.55);
    const semanticLimit = options.semanticLimit || Math.ceil(limit * 0.30);
    const arxivLimit    = options.arxivLimit    || Math.ceil(limit * 0.20);

    log.info('RESEARCH', `Academic retrieval: "${query.slice(0,50)}" (OA:${openAlexLimit} SS:${semanticLimit} Ax:${arxivLimit})`);

    const [openAlexResult, semanticResult, arxivResult] = await Promise.allSettled([
      this.fetchOpenAlex(query, openAlexLimit),
      semanticScholarService.retrieveSources(query, { limit: semanticLimit }),
      this.fetchArxiv(query, arxivLimit),
    ]);

    const openAlexSources = openAlexResult.status === 'fulfilled' ? openAlexResult.value : [];
    const semanticSources = semanticResult.status === 'fulfilled' ? semanticResult.value : [];
    const arxivSources    = arxivResult.status    === 'fulfilled' ? arxivResult.value    : [];

    const merged = this._mergeDedup([...openAlexSources, ...semanticSources, ...arxivSources]);

    merged.sort((a, b) => {
      const citDiff = (b.citationCount || 0) - (a.citationCount || 0);
      return citDiff !== 0 ? citDiff : (b.year || 0) - (a.year || 0);
    });

    return merged.slice(0, limit);
  },

  /** Batch-fetch from OpenAlex across multiple queries (for orchestrator quota use). */
  async fetchOpenAlexBatch(queries = [], limitPerQuery = 8) {
    const seen = new Set();
    const results = [];
    for (const q of queries) {
      const sources = await this.fetchOpenAlex(q, limitPerQuery);
      for (const s of sources) {
        const key = (s.doi || s.title || '').toLowerCase();
        if (key && !seen.has(key)) { seen.add(key); results.push(s); }
      }
    }
    return results;
  },

  /** Batch-fetch from Semantic Scholar across multiple queries. */
  async fetchSemanticBatch(queries = [], limitPerQuery = 6) {
    return semanticScholarService.retrieveSourcesBulk(queries, limitPerQuery);
  },

  /** Batch-fetch from ArXiv across multiple queries. */
  async fetchArxivBatch(queries = [], limitPerQuery = 5) {
    const seen = new Set();
    const results = [];
    for (const q of queries) {
      const sources = await this.fetchArxiv(q, limitPerQuery);
      for (const s of sources) {
        const key = (s.arxivId || s.title || '').toLowerCase();
        if (key && !seen.has(key)) { seen.add(key); results.push(s); }
      }
    }
    return results;
  },

  /**
   * Tag web sources: those older than 3 months receive goldStandard=true.
   * The orchestrator will flag them in the evidence profile.
   */
  tagWebSources(webSources = []) {
    const cutoff = threeMonthsAgo();
    return webSources.map(s => {
      const pubDate = parseDate(s.publishedDate || s.datePublished || s.year?.toString());
      const isOld   = pubDate !== null && pubDate < cutoff;
      return {
        ...s,
        goldStandard: isOld,
        goldStandardReason: isOld
          ? 'Authoritative source published > 3 months ago — included as historical reference'
          : null,
        recentWebSource: !isOld,
      };
    });
  },

  async fetchOpenAlex(query, limit) {
    try {
      const response = await axios.get(OPENALEX_API, {
        params: {
          search:   query,
          per_page: Math.min(limit, 200),
          sort:     'cited_by_count:desc',
          select:   'id,title,abstract_inverted_index,authorships,publication_year,doi,cited_by_count,concepts,referenced_works',
        },
        timeout: 10000,
      });

      const works = response.data?.results || [];
      return works.map(work => ({
        title:            work.title || 'Untitled',
        content:          this.reconstructOpenAlexAbstract(work.abstract_inverted_index),
        abstract:         this.reconstructOpenAlexAbstract(work.abstract_inverted_index),
        authors:          (work.authorships || []).map(a => a.author?.display_name).filter(Boolean),
        year:             work.publication_year || null,
        doi:              work.doi ? work.doi.replace('https://doi.org/', '') : null,
        url:              work.id || work.doi || null,
        citationCount:    work.cited_by_count || 0,
        concepts:         (work.concepts || []).map(c => c.display_name),
        referenced_works: work.referenced_works || [],
        sourceType:       'academic',
        sourceProvider:   'openalex',
        credibilityBaseScore: 87,
      }));
    } catch (err) {
      log.warn('RESEARCH', `OpenAlex error: ${err.message}`);
      return [];
    }
  },

  async fetchArxiv(query, limit) {
    try {
      const arxivQuery = query.trim().split(/\s+/).join('+AND+');
      const response = await axios.get(ARXIV_API, {
        params: {
          search_query: `all:${arxivQuery}`,
          start:        0,
          max_results:  Math.min(limit, 100),
          sortBy:       'relevance',
          sortOrder:    'descending',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data, { xmlMode: true });
      return $('entry').toArray().map(entry => {
        const el       = $(entry);
        const title    = el.find('title').text().trim().replace(/\s+/g, ' ');
        const abstract = el.find('summary').text().trim().replace(/\s+/g, ' ');
        const pubRaw   = el.find('published').text();
        const year     = pubRaw ? new Date(pubRaw).getFullYear() : null;
        const idUrl    = el.find('id').text();
        const arxivId  = idUrl.split('/abs/')[1] || idUrl;

        let doi = null;
        el.find('link[title="doi"]').each((_, link) => { doi = $(link).attr('href'); });
        if (doi) doi = doi.replace(/https?:\/\/(dx\.)?doi\.org\//, '');

        const authors = [];
        el.find('author name').each((_, name) => { authors.push($(name).text()); });

        return {
          title,
          content:          abstract,
          abstract,
          authors,
          year,
          doi,
          url:              idUrl,
          arxivId,
          publishedDate:    pubRaw ? new Date(pubRaw) : null,
          citationCount:    0,
          concepts:         [],
          referenced_works: [],
          sourceType:       'academic',
          sourceProvider:   'arxiv',
          credibilityBaseScore: 80,
        };
      });
    } catch (err) {
      log.warn('RESEARCH', `ArXiv error: ${err.message}`);
      return [];
    }
  },

  reconstructOpenAlexAbstract(invertedIndex) {
    if (!invertedIndex) return 'No abstract available.';
    const wordList = [];
    let maxLen = 0;
    for (const [word, positions] of Object.entries(invertedIndex)) {
      for (const pos of positions) {
        wordList[pos] = word;
        if (pos > maxLen) maxLen = pos;
      }
    }
    return Array.from({ length: maxLen + 1 }, (_, i) => wordList[i] || '').join(' ').trim();
  },

  /** Deduplicate merged sources by DOI or normalised title. */
  _mergeDedup(sources = []) {
    const map = new Map();
    for (const s of sources) {
      const doiKey   = s.doi   ? `doi:${s.doi.toLowerCase()}`                    : null;
      const titleKey = s.title ? `title:${s.title.toLowerCase().slice(0, 80)}`   : null;
      const key      = doiKey || titleKey;
      if (!key) { map.set(Math.random().toString(), s); continue; }
      if (!map.has(key)) {
        map.set(key, s);
      } else {
        const existing = map.get(key);
        const newLen   = (s.abstract || s.content || '').length;
        const oldLen   = (existing.abstract || existing.content || '').length;
        if (newLen > oldLen) map.set(key, { ...existing, ...s });
      }
    }
    return Array.from(map.values());
  },
};

module.exports = academicSourceService;
