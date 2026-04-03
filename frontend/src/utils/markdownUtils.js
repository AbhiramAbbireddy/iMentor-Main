import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const renderer = new marked.Renderer();

// Override the code and codespan renderers to handle math blocks
const originalCodeRenderer = renderer.code;
renderer.code = function(code, language) {
  if (language === 'math') {
    return katex.renderToString(code, {
      throwOnError: false,
      displayMode: true
    });
  }
  return originalCodeRenderer.call(this, code, language);
};

const originalCodespanRenderer = renderer.codespan;
renderer.codespan = function(code) {
  // Ensure code is a string
  if (typeof code !== 'string') {
    code = String(code || '');
  }
  
  if (code.startsWith('$$') && code.endsWith('$$')) {
    const math = code.substring(2, code.length - 2);
    return katex.renderToString(math, {
      throwOnError: false,
      displayMode: true
    });
  }
  if (code.startsWith('$') && code.endsWith('$')) {
    const math = code.substring(1, code.length - 1);
    return katex.renderToString(math, {
      throwOnError: false,
      displayMode: false
    });
  }
  return originalCodespanRenderer.call(this, code);
};

marked.setOptions({ renderer });

// KaTeX math tags and attributes that DOMPurify must not strip
const KATEX_TAGS = [
  'math', 'annotation', 'semantics',
  'mrow', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mspace',
  'msup', 'msub', 'msubsup', 'munder', 'mover', 'munderover',
  'mfrac', 'msqrt', 'mroot', 'mfenced', 'mtable', 'mtr', 'mtd', 'mlabeledtr',
  'svg', 'path', 'use', 'defs', 'g', 'rect', 'line',
];
const KATEX_ATTRS = [
  'allow', 'allowfullscreen', 'frameborder', 'scrolling',
  'class', 'style', 'encoding', 'xmlns', 'viewBox',
  'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'href', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'width', 'height', 'transform', 'data-katex-code',
  'mathvariant', 'mathsize', 'mathcolor', 'columnalign', 'rowalign',
];

// Render a single LaTeX expression with KaTeX, returning HTML string.
// Falls back to the raw expression on error so the page never breaks.
function renderKatex(expr, displayMode) {
  try {
    return katex.renderToString(expr.trim(), {
      displayMode,
      throwOnError: false,
      output: 'html',          // HTML-only avoids MathML DOMPurify issues
      macros: { '\\RR': '\\mathbb{R}', '\\NN': '\\mathbb{N}', '\\ZZ': '\\mathbb{Z}' },
    });
  } catch {
    return displayMode ? `$$${expr}$$` : `$${expr}$`;
  }
}

// Post-process an HTML string to render all $$..$$ and $..$  with KaTeX.
// Called AFTER marked() so we work on the final HTML, not raw markdown.
function applyKatexToHtml(html) {
  // 1. Block math: $$...$$  (greedy-safe, non-nested)
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => renderKatex(expr, true));

  // 2. Inline math: $...$ — must NOT match $$ (already handled above)
  //    Allows escaped chars inside, excludes newlines to stay within one line.
  html = html.replace(
    /(^|[^$\\])\$(?!\$)((?:[^$\n\\]|\\[\s\S])+?)\$(?!\$)/g,
    (full, pre, expr) => pre + renderKatex(expr, false),
  );

  return html;
}

export const renderMarkdown = (markdownText) => {
  if (!markdownText) return { __html: '' };

  let text = markdownText;

  // ── Step 1: Normalise LaTeX delimiters BEFORE marked runs ──────────────────
  // marked treats the backslash as an escape, so \[ becomes [ in output.
  // Convert to $$ / $ NOW so the pre-process step below can catch them.
  //   \[...\]   →  $$...$$   (display math)
  //   \(...\)   →  $...$     (inline math)
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`);
  text = text.replace(/\\\(([\s\S]+?)\\\)/g,  (_, m) => `$${m}$`);

  // ── Step 2: Run markdown → HTML ─────────────────────────────────────────────
  const rawHtml = marked(text);

  // ── Step 3: Render math that survived as literal text in <p> tags ──────────
  // (The codespan renderer only fires for backtick-wrapped content.
  //  Plain $...$ / $$...$$ in paragraphs need a post-process pass.)
  const mathHtml = applyKatexToHtml(rawHtml);

  // ── Step 4: Sanitize — keep KaTeX HTML intact ──────────────────────────────
  const sanitized = DOMPurify.sanitize(mathHtml, {
    ADD_TAGS: KATEX_TAGS,
    ADD_ATTR: KATEX_ATTRS,
    FORCE_BODY: false,
  });

  return { __html: sanitized };
};
