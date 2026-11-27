// BaseCity Native Evaluator Engine:
// Plug-in evaluation modes for BaseCity TaskMarket (api/city-tasks.js):
//   - 'self': manual requester approval
//   - 'stock-verifier': deterministic checks against live Base tokenized stocks (/api/stocks) & quantitative proof
//   - 'ai-jury' (shown as "Three-Check Review"): three simple keyword/length checks (criteria, evidence, quality). There
//     is no AI model here, and none of these scores moves money: they are a guide for the requester, who decides.
import { keccak256, toHex } from 'viem';
import { stockList } from './_stocks.js';

const TICKER_RE = /\b\$?(NVDA|TSLA|AAPL|MSFT|AMZN|GOOGL|META|MSTR|COIN|SNDK|SPCX|PLTR|AMD|NFLX|CRCL|HOOD|SPY|QQQ|SLV|GLD)c?\b/i;
const NUM_RE = /(\$\d[\d,.]*|\d+(?:\.\d+)?%|\b\d{2,}[\d,.]*\b)/g;
const TX_OR_URL_RE = /(https?:\/\/\S+|\/api\/\S+|0x[a-fA-F0-9]{16,})/;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9$%./_-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function criteriaLines(task) {
  const raw = String(task?.criteria || '').trim();
  if (!raw) return [];
  return raw
    .split(/\n|;|•|-\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .slice(0, 8);
}

function keywordMatchRatio(requirement, haystackTokens) {
  const reqTokens = tokenize(requirement).filter((w) => !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'must', 'should', 'have'].includes(w));
  if (!reqTokens.length) return 1;
  const set = new Set(haystackTokens);
  let hits = 0;
  for (const w of reqTokens) {
    if (set.has(w) || [...set].some((t) => t.includes(w) || w.includes(t))) hits += 1;
  }
  return hits / reqTokens.length;
}

function attest(payload) {
  return keccak256(toHex(JSON.stringify(payload)));
}

async function runStockVerifier(task, submission, deps = {}) {
  const summary = String(submission?.summary || '').trim();
  const proofUrl = String(submission?.proofUrl || '').trim();
  const combined = `${summary} ${proofUrl}`.trim();
  const taskText = `${task?.title || ''} ${task?.brief || ''} ${task?.criteria || ''}`;
  const ticker = ((TICKER_RE.exec(taskText) || [])[1] || '').toUpperCase();

  let liveStock = null;
  if (ticker) {
    try {
      const list = deps.stocks || await stockList();
      liveStock = (list || []).find((s) => String(s.ticker || '').toUpperCase() === ticker) || null;
    } catch { /* offline fallback */ }
  }

  const checks = [];
  let score = 0;

  // Check 1: Ticker alignment (30 pts)
  if (ticker) {
    const hasTicker = new RegExp(`\\b\\$?${ticker}c?\\b`, 'i').test(combined);
    const pts = hasTicker ? 30 : 0;
    score += pts;
    checks.push({
      id: 'ticker',
      label: `References target ticker ${ticker}`,
      pass: hasTicker,
      detail: hasTicker
        ? (liveStock?.nav ? `Matched ${ticker} (live Base NAV $${Number(liveStock.nav).toFixed(2)})` : `Matched ${ticker}`)
        : `Missing required ticker ${ticker} in deliverable`,
    });
  } else {
    const hasBaseCtx = /\b(base|usdc|nav|volume|pool|token|blocky|onchain|price)\b/i.test(combined);
    score += hasBaseCtx ? 30 : 10;
    checks.push({
      id: 'base-context',
      label: 'Onchain / Base market context',
      pass: hasBaseCtx,
      detail: hasBaseCtx ? 'Includes Base market/onchain terms' : 'Weak Base market context',
    });
  }

  // Check 2: Quantitative market figures (30 pts)
  const nums = combined.match(NUM_RE) || [];
  const hasNums = nums.length >= 2;
  score += hasNums ? 30 : (nums.length === 1 ? 15 : 0);
  checks.push({
    id: 'metrics',
    label: 'Quantitative figures (price, NAV, spread, or volume)',
    pass: hasNums,
    detail: hasNums ? `Verified ${nums.length} quantitative data points (${nums.slice(0, 3).join(', ')})` : 'Needs at least 2 concrete figures (price, %, or volume)',
  });

  // Check 3: Live NAV sanity check when available (20 pts)
  if (liveStock?.nav && Number(liveStock.nav) > 0) {
    const dollarMatches = [...combined.matchAll(/\$(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
    const nav = Number(liveStock.nav);
    const nearNav = dollarMatches.some((v) => Math.abs(v - nav) / nav <= 0.25);
    const hasProof = TX_OR_URL_RE.test(combined);
    const passNav = nearNav || hasProof;
    score += passNav ? 20 : 5;
    checks.push({
      id: 'nav-sanity',
      label: 'Price / source alignment with live Base data',
      pass: passNav,
      detail: nearNav
        ? `Cited figure aligns within 25% of live ${ticker} NAV ($${nav.toFixed(2)})`
        : hasProof
          ? `Includes verifiable source reference (${proofUrl || 'inline link'})`
          : `No price near live ${ticker} NAV ($${nav.toFixed(2)}) or source link`,
    });
  } else {
    const hasProof = TX_OR_URL_RE.test(combined) || summary.length >= 80;
    score += hasProof ? 20 : 5;
    checks.push({
      id: 'evidence',
      label: 'Verifiable source or detailed breakdown',
      pass: hasProof,
      detail: hasProof ? 'Contains source link or detailed analysis' : 'Add a proof URL or fuller breakdown',
    });
  }

  // Check 4: Acceptance criteria coverage (20 pts)
  const lines = criteriaLines(task);
  if (lines.length) {
    const subTokens = tokenize(combined);
    const matched = lines.filter((l) => keywordMatchRatio(l, subTokens) >= 0.35).length;
    const ratio = matched / lines.length;
    const passCrit = ratio >= 0.5;
    score += Math.round(ratio * 20);
    checks.push({
      id: 'criteria',
      label: 'Acceptance criteria coverage',
      pass: passCrit,
      detail: `Matched ${matched}/${lines.length} criteria items`,
    });
  } else {
    const okLen = summary.length >= 40;
    score += okLen ? 20 : 5;
    checks.push({
      id: 'completeness',
      label: 'Deliverable completeness',
      pass: okLen,
      detail: okLen ? `${summary.length} chars submitted` : 'Submission is too brief (< 40 chars)',
    });
  }

  const passed = score >= 70 && checks.filter((c) => !c.pass).length <= 1;
  const evaluatedAt = new Date().toISOString();
  const reason = passed
    ? `Passed BaseCity Stock Verifier (${score}/100) — all core market checks verified.`
    : `Failed BaseCity Stock Verifier (${score}/100) — ${checks.filter((c) => !c.pass).map((c) => c.label).join('; ')}.`;

  const attestationHash = attest({
    v: 1,
    evaluator: 'stock-verifier',
    taskId: task?.id || '',
    submissionId: submission?.id || '',
    worker: submission?.worker || '',
    passed,
    score,
    evaluatedAt,
  });

  return {
    evaluator: 'stock-verifier',
    consensus: 'DETERMINISTIC',
    passed,
    score,
    reason,
    checks,
    evaluatedAt,
    attestationHash,
  };
}

function runAiJury(task, submission) {
  const summary = String(submission?.summary || '').trim();
  const proofUrl = String(submission?.proofUrl || '').trim();
  const combined = `${summary} ${proofUrl}`.trim();
  const subTokens = tokenize(combined);
  const uniqueTokens = new Set(subTokens);

  // Judge 1: Criteria Compliance
  const lines = criteriaLines(task);
  let j1Score = 0;
  let j1Note = '';
  if (lines.length) {
    const matched = lines.filter((l) => keywordMatchRatio(l, subTokens) >= 0.35).length;
    j1Score = Math.round((matched / lines.length) * 100);
    j1Note = `Satisfied ${matched}/${lines.length} locked acceptance criteria.`;
  } else {
    const briefRatio = keywordMatchRatio(`${task?.title || ''} ${task?.brief || ''}`, subTokens);
    j1Score = Math.min(100, Math.round(briefRatio * 140) + (summary.length >= 50 ? 25 : 0));
    j1Note = briefRatio >= 0.25 ? 'Directly addresses task brief.' : 'Low topical overlap with task brief.';
  }
  const j1Vote = j1Score >= 60 ? 'PASS' : 'FAIL';

  // Judge 2: Evidence & Specificity
  const hasUrlOrTx = TX_OR_URL_RE.test(combined);
  const nums = combined.match(NUM_RE) || [];
  let j2Score = 30;
  if (hasUrlOrTx) j2Score += 40;
  if (nums.length >= 1) j2Score += 20;
  if (summary.length >= 90) j2Score += 10;
  j2Score = Math.min(100, j2Score);
  const j2Vote = j2Score >= 60 ? 'PASS' : 'FAIL';
  const j2Note = hasUrlOrTx
    ? 'Includes verifiable proof link or onchain reference.'
    : nums.length >= 1
      ? 'Includes concrete numbers; adding a proof URL would strengthen verification.'
      : 'Lacks verifiable link, transaction hash, or concrete metrics.';

  // Judge 3: Quality & Anti-Spam
  const diversity = subTokens.length ? uniqueTokens.size / subTokens.length : 0;
  let j3Score = 0;
  if (summary.length >= 40) j3Score += 45;
  else if (summary.length >= 20) j3Score += 25;
  if (diversity >= 0.55) j3Score += 35;
  else if (diversity >= 0.35) j3Score += 20;
  if (uniqueTokens.size >= 10) j3Score += 20;
  const j3Vote = j3Score >= 65 ? 'PASS' : 'FAIL';
  const j3Note = j3Vote === 'PASS'
    ? `Clear, non-repetitive deliverable (${uniqueTokens.size} distinct terms).`
    : 'Too short or repetitive to qualify as a complete submission.';

  const judges = [
    { name: 'Criteria Judge', vote: j1Vote, score: j1Score, note: j1Note },
    { name: 'Evidence Judge', vote: j2Vote, score: j2Score, note: j2Note },
    { name: 'Quality Judge', vote: j3Vote, score: j3Score, note: j3Note },
  ];

  const passCount = judges.filter((j) => j.vote === 'PASS').length;
  const passed = passCount >= 2;
  const score = Math.round((j1Score + j2Score + j3Score) / 3);
  const evaluatedAt = new Date().toISOString();
  const consensus = `${passCount}/3 ${passed ? 'PASS' : 'FAIL'}`;
  const reason = passed
    ? `Three-check review ${consensus} (${score}/100): looks acceptable. A guide only: the requester decides.`
    : `Three-check review ${consensus} (${score}/100): does not look complete. A guide only: the requester decides.`;

  const attestationHash = attest({
    v: 1,
    evaluator: 'ai-jury',
    taskId: task?.id || '',
    submissionId: submission?.id || '',
    worker: submission?.worker || '',
    passed,
    consensus,
    score,
    evaluatedAt,
  });

  return {
    evaluator: 'ai-jury',
    consensus,
    passed,
    score,
    reason,
    judges,
    evaluatedAt,
    attestationHash,
  };
}

export async function evaluateSubmission(task, submission, deps = {}) {
  const mode = String(task?.evaluator || 'self');
  if (mode === 'stock-verifier') return await runStockVerifier(task, submission, deps);
  if (mode === 'ai-jury') return runAiJury(task, submission);
  return null;
}
