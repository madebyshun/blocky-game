// Linking Blockies to ERC-8004 agents with ONE signature, however many Blockies a wallet has.
// The owner signs an EIP-712 "AgentLink" listing every (Blocky, agent) pair. No gas, no transaction.
// A link counts only while the signer still owns both the Blocky NFT and the agent on chain, so a sale
// ends it on its own. Shared by the claim page (signing) and the API (verifying), and published in
// every agent card as `ownerProof` so anyone (Blue Agent's badge) can check it themselves.
export const LINK_DOMAIN = { name: 'BaseCity Agent Link', version: '1', chainId: 8453 };
export const LINK_TYPES = {
  AgentLink: [{ name: 'owner', type: 'address' }, { name: 'links', type: 'Pair[]' }, { name: 'issuedAt', type: 'string' }],
  Pair: [{ name: 'blocky', type: 'uint256' }, { name: 'agentId', type: 'uint256' }],
};
export const MAX_LINKS = 200;

// Normalise and validate the pairs: whole numbers, each Blocky at most once, at most MAX_LINKS.
export function cleanLinks(links) {
  if (!Array.isArray(links) || !links.length) throw new Error('No Blocky to link');
  if (links.length > MAX_LINKS) throw new Error(`At most ${MAX_LINKS} Blockies per signature`);
  const seen = new Set();
  return links.map((p) => {
    const blocky = String(p?.blocky ?? ''), agentId = String(p?.agentId ?? '').replace(/^#\s*/, '');
    if (!/^\d{1,5}$/.test(blocky) || !/^\d{1,12}$/.test(agentId)) throw new Error('Each pair needs a Blocky number and an agent ID');
    if (seen.has(blocky)) throw new Error(`Blocky #${blocky} is listed twice`);
    seen.add(blocky);
    return { blocky, agentId };
  }).sort((a, b) => Number(a.blocky) - Number(b.blocky));
}

// The typed data the wallet signs (bigints for viem; JSON-safe strings in `json`).
export function linkTypedData(owner, links, issuedAt) {
  const clean = cleanLinks(links);
  return {
    domain: LINK_DOMAIN, types: LINK_TYPES, primaryType: 'AgentLink',
    message: { owner, links: clean.map((p) => ({ blocky: BigInt(p.blocky), agentId: BigInt(p.agentId) })), issuedAt },
    json: { owner, links: clean, issuedAt },
  };
}

// For eth_signTypedData_v4 in a browser wallet (numbers as strings, EIP712Domain listed).
export function linkTypedDataV4(owner, links, issuedAt) {
  const { json } = linkTypedData(owner, links, issuedAt);
  return {
    domain: LINK_DOMAIN,
    types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }], ...LINK_TYPES },
    primaryType: 'AgentLink', message: json,
  };
}

// Pairs from the form: one agent for every Blocky (default), or one per row.
export function pairsFrom(blockies, inputs, shared) {
  return blockies.map((n) => ({ blocky: String(n), agentId: String((inputs[n] || shared || '')).trim().replace(/^#\s*/, '') })).filter((p) => p.agentId);
}
// Only agents linked to exactly one Blocky can point their on-chain URI at that Blocky's card.
export const onchainPairs = (pairs) => pairs.filter((p) => pairs.filter((q) => q.agentId === p.agentId).length === 1);

