// Vercel serverless function: the citizens' vote (src/votes.js, round in src/config.js `vote`).
//   GET  /api/vote                  the round, its count, whether it's open
//   GET  /api/vote?address=0x…      plus that wallet's Blockies NFTs and how each voted
//   POST /api/vote { address, choice, time, signature }
//        the wallet signed voteMessage(...) (EOAs and smart wallets: viem's verifyMessage); every
//        BaseCity Blockies NFT it holds now votes for `choice` (one vote per NFT, so a vote follows
//        the NFT: a new holder can change it, nobody can count it twice).
// Votes live in KV: a hash per round, NFT id -> choice. Who holds what is read onchain (ownerOf).
import { getAddress, isAddress } from 'viem';
import { client, NFT, RESERVE, useKv, kv, loadLedger, KEY_BASE } from './_store.js';
import { teamOrigin } from '../src/ledger.js';
import { ROUND, MAX_AGE, choiceOf, isOpen, voteMessage, count } from '../src/votes.js';

const OWNER_ABI = [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] }];
const key = () => `${KEY_BASE}:vote:${ROUND.id}`;
const memory = new Map(); // without KV (dev): round -> { id: choice }

export async function readVotes() {
  if (!useKv()) return { ...(memory.get(ROUND.id) || {}) };
  const flat = (await kv('HGETALL', key())) || [];
  const out = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}
async function writeVotes(ids, choice) {
  if (!ids.length) return;
  if (!useKv()) { memory.set(ROUND.id, { ...(memory.get(ROUND.id) || {}), ...Object.fromEntries(ids.map((n) => [n, choice])) }); return; }
  await kv('HSET', key(), ...ids.flatMap((n) => [String(n), choice]));
}

// Who holds each minted Blocky NFT that votes: { id: owner }, read in chunks, cached for a minute.
// The team's Blockies (the reserve and grants) don't vote: the city's holders decide, not its team.
let owners = null;
async function holders() {
  if (owners && Date.now() - owners.at < 60e3) return owners.map;
  const { ledger: L } = await loadLedger();
  const team = { reserve: RESERVE, grants: L.granted || [] };
  const ids = Array.from({ length: L.blockies.length }, (_, i) => i + 1).filter((n) => !teamOrigin(team, n, L.wallets[L.blockies[n - 1][0]])), map = {};
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const res = await client.multicall({ allowFailure: true, contracts: chunk.map((n) => ({ address: NFT, abi: OWNER_ABI, functionName: 'ownerOf', args: [BigInt(n)] })) });
    res.forEach((r, k) => { if (r.status === 'success') map[chunk[k]] = r.result.toLowerCase(); }); // fails: not minted
  }
  owners = { at: Date.now(), map };
  return map;
}
export const heldBy = (map, address) => Object.entries(map).filter(([, o]) => o === address.toLowerCase()).map(([n]) => Number(n));

// A vote, checked: { ok, ids } or { error, status }. deps: { verify, held, now } (tests swap them).
export async function castVote({ address, choice, time, signature }, { verify, held, now = Date.now() }) {
  if (!ROUND) return { status: 404, error: 'No vote is running' };
  if (!isOpen(now)) return { status: 409, error: 'This round has ended' };
  if (!isAddress(address || '', { strict: false })) return { status: 400, error: 'Send a wallet address' };
  if (!choiceOf(choice)) return { status: 400, error: 'Pick one of the choices' };
  const t = Date.parse(time || '');
  if (!Number.isFinite(t) || Math.abs(now - t) > MAX_AGE) return { status: 400, error: 'The signed vote is too old: sign again' };
  const message = voteMessage({ choice, address, time });
  if (!(await verify({ address: getAddress(address), message, signature }).catch(() => false))) return { status: 401, error: "The signature doesn't match this wallet" };
  const ids = await held(address);
  if (!ids.length) return { status: 409, error: 'This wallet holds no BaseCity Blockies NFTs: claim yours first' };
  return { ok: true, ids };
}

function body(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!ROUND) return res.status(404).json({ error: 'No vote is running' });
  try {
    const round = { id: ROUND.id, title: ROUND.title, question: ROUND.question, ends: ROUND.ends, choices: ROUND.choices, open: isOpen() };
    if (req.method === 'POST') {
      const b = body(req);
      const r = await castVote(b, {
        verify: (m) => client.verifyMessage(m),
        held: async (a) => heldBy(await holders(), a),
      });
      if (!r.ok) return res.status(r.status).json({ error: r.error });
      await writeVotes(r.ids, b.choice);
      const votes = await readVotes();
      return res.status(200).json({ round, ...count(votes), counted: r.ids.length, choice: b.choice });
    }
    const votes = await readVotes();
    const out = { round, ...count(votes) };
    const raw = req.query?.address ?? new URL(req.url, 'http://x').searchParams.get('address');
    if (raw && isAddress(raw, { strict: false })) {
      const ids = heldBy(await holders(), raw);
      out.mine = { address: getAddress(raw), ids, votes: Object.fromEntries(ids.map((n) => [n, votes[n] ?? null])) };
    }
    res.status(200).json(out);
  } catch (e) {
    console.warn('[vote]', e.shortMessage || e.message);
    res.status(502).json({ error: String(e.shortMessage || e.message || e) });
  }
}
