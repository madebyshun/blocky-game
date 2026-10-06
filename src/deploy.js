// Owner tool: deploy the BaseCity Blockies contract from a browser wallet, then print the settings
// the site needs (NFT_CONTRACT, CLAIM_SIGNER_KEY) and how to verify it on Basescan.
import { inject } from '@vercel/analytics';
import { encodeDeployData, encodeAbiParameters, getAddress, isAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import artifact from '../contracts/out/BaseCityBlockies.json';
import inputUrl from '../contracts/out/BaseCityBlockies.input.json?url';
import { CONFIG } from './config.js';
import { browserWallets, onWallets, connect, sendTx, waitTx, rejected } from './wallet.js';
import { mountSite, esc, basescan } from './site.js';

// Initialize Vercel Web Analytics
inject();

mountSite('');
const $ = (id) => document.getElementById(id);
const site = (CONFIG.siteUrl || location.origin).replace(/\/$/, '');
$('royalty').value = CONFIG.nft.treasury;
$('bps').value = String(CONFIG.nft.royaltyBps);
$('supply').value = String(CONFIG.supply);
$('base').value = `${site}/api/nft/`;
$('curi').value = `${site}/api/nft/collection`;

let provider = null, account = null, key = null;
function wallets() {
  const box = $('wallets');
  box.innerHTML = '';
  const list = browserWallets();
  if (!list.length) box.innerHTML = '<span class="count">No browser wallet found. Install MetaMask, Rabby or the Coinbase Wallet extension.</span>';
  for (const w of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = account && provider === w.provider ? `✓ ${w.name}` : `Connect ${w.name}`;
    b.onclick = async () => {
      try {
        account = getAddress(await connect(w.provider));
        provider = w.provider;
        if (!$('owner').value) $('owner').value = account;
        $('me').textContent = `Connected: ${account}`;
        $('go').disabled = false;
        wallets();
      } catch (e) { if (!rejected(e)) $('me').textContent = e.message; }
    };
    box.appendChild(b);
  }
}
onWallets(wallets);
wallets();

$('gen').onclick = () => {
  key = generatePrivateKey();
  $('key').value = key;
  $('keybox').hidden = false;
  $('signer').value = privateKeyToAccount(key).address;
};

const show = (html, tone = '') => { const o = $('out'); o.hidden = false; o.className = `note ${tone}`; o.innerHTML = html; };

$('form').onsubmit = async (e) => {
  e.preventDefault();
  const v = (id) => $(id).value.trim();
  for (const id of ['signer', 'owner', 'royalty']) if (!isAddress(v(id), { strict: false })) return show(`${id}: not an address`, 'bad');
  const bps = Number(v('bps')), supply = Number(v('supply'));
  if (!Number.isInteger(bps) || bps < 0 || bps > 1000) return show('Royalty must be 0–1000 basis points', 'bad');
  if (!Number.isInteger(supply) || supply < 1) return show('Max supply must be a whole number', 'bad');
  const args = [getAddress(v('owner')), getAddress(v('signer')), getAddress(v('royalty')), bps, BigInt(supply), v('base'), v('curi')];
  const ctor = artifact.abi.find((x) => x.type === 'constructor');
  try {
    $('go').disabled = true;
    show('Confirm the deployment in your wallet…');
    const hash = await sendTx(provider, { from: account, data: encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args }) });
    show(`Deploying… <a href="${basescan(`tx/${hash}`)}" target="_blank" rel="noopener">transaction ↗</a>`);
    const done = await waitTx(hash, provider, 300000);
    if (!done.ok) throw new Error(done.ok === false ? 'The deployment failed' : 'Still pending: check Basescan');
    const addr = getAddress(done.receipt.contractAddress);
    const encoded = encodeAbiParameters(ctor.inputs, args).slice(2);
    show(`<b>Deployed: <a href="${basescan(`address/${addr}`)}" target="_blank" rel="noopener">${addr}</a></b>
      <ol class="steps">
        <li>In Vercel → Settings → Environment Variables add <code>NFT_CONTRACT=${addr}</code>${key ? ` and <code>CLAIM_SIGNER_KEY</code> (the key above)` : ' and <code>CLAIM_SIGNER_KEY</code> (the signer\'s private key)'}, plus <code>SITE_URL=${esc(site)}</code>, then redeploy. Claims open.</li>
        <li>Verify on Basescan: <a href="https://basescan.org/verifyContract?a=${addr}" target="_blank" rel="noopener">verify ↗</a>, type "Solidity (Standard-Json-Input)", compiler <code>${esc(artifact.compiler)}</code>, MIT license, upload <a href="${inputUrl}" download="BaseCityBlockies.input.json">the input JSON</a>. Constructor arguments: <code>${encoded}</code></li>
        <li>Optional: put the address in <code>src/config.js</code> → <code>nft.contract</code> too.</li>
      </ol>`, 'ok');
  } catch (err) {
    $('go').disabled = false;
    show(rejected(err) ? 'Cancelled.' : esc(err.shortMessage || err.message), rejected(err) ? '' : 'bad');
  }
};
