// src/utils/markdownUtils.jsx
// Post-processor for HTML strings that may contain LaTeX math delimiters.
// Used by AnalysisTool and other components that receive pre-rendered HTML.
import katex from 'katex';
import DOMPurify from 'dompurify';

const KATEX_CONFIG = {
  throwOnError: false,
  output: 'html',
  macros: { '\\RR': '\\mathbb{R}', '\\NN': '\\mathbb{N}', '\\ZZ': '\\mathbb{Z}' },
};

const DOMPUR_OPTS = {
  ADD_TAGS: [
    'math', 'annotation', 'semantics',
    'mrow', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mspace',
    'msup', 'msub', 'msubsup', 'munder', 'mover', 'munderover',
    'mfrac', 'msqrt', 'mroot', 'mfenced', 'mtable', 'mtr', 'mtd',
    'svg', 'path', 'use', 'defs', 'g', 'rect', 'line',
  ],
  ADD_ATTR: [
    'class', 'style', 'encoding', 'xmlns', 'viewBox',
    'd', 'fill', 'stroke', 'stroke-width', 'href',
    'x', 'y', 'width', 'height', 'transform',
    'mathvariant', 'mathsize', 'columnalign',
  ],
};

function tryKatex(expr, displayMode) {
  try {
    return katex.renderToString(expr.trim(), { ...KATEX_CONFIG, displayMode });
  } catch {
    return displayMode ? `$$${expr}$$` : `$${expr}$`;
  }
}

/**
 * Post-process an HTML string and render any LaTeX math delimiters:
 *   \[...\]  →  display KaTeX
 *   \(...\)  →  inline KaTeX
 *   $$...$$  →  display KaTeX
 *   $...$    →  inline KaTeX
 */
export const renderMathInHtml = (htmlString) => {
  if (!htmlString || typeof htmlString !== 'string') return htmlString;

  let s = htmlString;

  // Normalise LaTeX delimiters first (before $ matching)
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g,  (_, m) => `$${m}$`);

  // Block math $$...$$
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    const html = tryKatex(expr, true);
    return DOMPurify.sanitize(html, DOMPUR_OPTS);
  });

  // Inline math $...$ (skip $$ which was already handled above)
  s = s.replace(
    /(^|[^$\\])\$(?!\$)((?:[^$\n\\]|\\[\s\S])+?)\$(?!\$)/g,
    (full, pre, expr) => {
      const html = tryKatex(expr, false);
      return pre + DOMPurify.sanitize(html, DOMPUR_OPTS);
    },
  );

  return s;
};
