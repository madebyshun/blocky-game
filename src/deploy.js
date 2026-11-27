// Owner tool: deploy BaseCityBlockies (NFT) or BaseCityFlywheel (auto-push rewards + buyback burn)
// from a browser wallet, then print env settings and Basescan verification details.
import { encodeDeployData, encodeAbiParameters, encodeFunctionData, getAddress, isAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import artifact from '../contracts/out/BaseCityBlockies.json';
import inputUrl from '../contracts/out/BaseCityBlockies.input.json?url';
import fwArtifact from '../contracts/out/BaseCityFlywheel.json';
import fwInputUrl from '../contracts/out/BaseCityFlywheel.input.json?url';
import escArtifact from '../contracts/out/BaseCityTaskEscrow.json';
import escInputUrl from '../contracts/out/BaseCityTaskEscrow.input.json?url';
import { CONFIG } from './config.js';
import { IDENTITY as ERC8004_REGISTRY } from './work-protocol.js';
import { browserWallets, onWallets, connect, sendTx, waitTx, rejected } from './wallet.js';
import { mountSite, esc, basescan } from './site.js';

mountSite('');
const $ = (id) => document.getElementById(id);
const site = (CONFIG.siteUrl || location.origin).replace(/\/$/, '');
$('royalty').value = CONFIG.nft.treasury;
$('bps').value = String(CONFIG.nft.royaltyBps);
$('supply').value = String(CONFIG.supply);
$('base').value = `${site}/api/nft/`;
$('curi').value = `${site}/api/nft/collection`;
if ($('esc-flywheel')) $('esc-flywheel').value = CONFIG.flywheel?.contract || '';
if ($('esc-nft')) $('esc-nft').value = CONFIG.nft?.contract || '';
if ($('esc-agent')) $('esc-agent').value = ERC8004_REGISTRY || '';

const FACTORY_SET_RECIPIENT_ABI = [{
  type: 'function',
  name: 'setCreatorRecipient',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'token', type: 'address' }, { name: 'recipient', type: 'address' }],
  outputs: [],
}];

let provider = null, account = null, key = null, fwKey = null;
function wallets() {
  const box = $('wallets');
  box.innerHTML = '';
  const list = browserWallets();
  if (!list.length) box.innerHTML = '<span class="count">No browser wallet found. Install MetaMask, Rabby or the Coinbase Wallet extension.</span>';
  for (const w of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = account && provider === w.provider ? `Connected: ${w.name}` : `Connect ${w.name}`;
    b.onclick = async () => {
      try {
        account = getAddress(await connect(w.provider));
        provider = w.provider;
        if (!$('owner').value) $('owner').value = account;
        if ($('fw-owner') && !$('fw-owner').value) $('fw-owner').value = account;
        if ($('fw-op') && !$('fw-op').value) $('fw-op').value = account;
        if ($('esc-owner') && !$('esc-owner').value) $('esc-owner').value = account;
        $('me').textContent = `Connected: ${account}`;
        $('go').disabled = false;
        if ($('fw-go')) $('fw-go').disabled = false;
        if ($('esc-go')) $('esc-go').disabled = false;
        if ($('fw-route-existing') && CONFIG.flywheel?.contract) $('fw-route-existing').disabled = false;
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

if ($('fw-gen')) {
  $('fw-gen').onclick = () => {
    fwKey = generatePrivateKey();
    $('fw-key').value = fwKey;
    $('fw-keybox').hidden = false;
    $('fw-op').value = privateKeyToAccount(fwKey).address;
  };
}

const show = (html, tone = '') => { const o = $('out'); o.hidden = false; o.className = `note ${tone}`; o.innerHTML = html; };
const showFw = (html, tone = '') => { const o = $('fw-out'); o.hidden = false; o.className = `note ${tone}`; o.innerHTML = html; };

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
    show(`Deploying… <a href="${basescan(`tx/${hash}`)}" target="_blank" rel="noopener">transaction</a>`);
    const done = await waitTx(hash, provider, 300000);
    if (!done.ok) throw new Error(done.ok === false ? 'The deployment failed' : 'Still pending: check Basescan');
    const addr = getAddress(done.receipt.contractAddress);
    const encoded = encodeAbiParameters(ctor.inputs, args).slice(2);
    show(`<b>Deployed: <a href="${basescan(`address/${addr}`)}" target="_blank" rel="noopener">${addr}</a></b>
      <ol class="steps">
        <li>In Vercel → Settings → Environment Variables add <code>NFT_CONTRACT=${addr}</code>${key ? ` and <code>CLAIM_SIGNER_KEY</code> (the key above)` : ' and <code>CLAIM_SIGNER_KEY</code> (the signer\'s private key)'}, plus <code>SITE_URL=${esc(site)}</code>, then redeploy. Claims open.</li>
        <li>Verify on Basescan: <a href="https://basescan.org/verifyContract?a=${addr}" target="_blank" rel="noopener">verify</a>, type "Solidity (Standard-Json-Input)", compiler <code>${esc(artifact.compiler)}</code>, MIT license, upload <a href="${inputUrl}" download="BaseCityBlockies.input.json">the input JSON</a>. Constructor arguments: <code>${encoded}</code></li>
        <li>Optional: put the address in <code>src/config.js</code> → <code>nft.contract</code> too.</li>
      </ol>`, 'ok');
  } catch (err) {
    $('go').disabled = false;
    show(rejected(err) ? 'Cancelled.' : esc(err.shortMessage || err.message), rejected(err) ? '' : 'bad');
  }
};

if ($('fw-form')) {
  $('fw-form').onsubmit = async (e) => {
    e.preventDefault();
    const ownerAddr = $('fw-owner').value.trim();
    const opAddr = $('fw-op').value.trim();
    if (!isAddress(ownerAddr, { strict: false })) return showFw('Owner: not a valid 0x address', 'bad');
    if (!isAddress(opAddr, { strict: false })) return showFw('Operator: not a valid 0x address', 'bad');
    const args = [getAddress(ownerAddr), getAddress(opAddr)];
    const ctor = fwArtifact.abi.find((x) => x.type === 'constructor');
    try {
      $('fw-go').disabled = true;
      showFw('Confirm BaseCityFlywheel deployment in your wallet…');
      const hash = await sendTx(provider, { from: account, data: encodeDeployData({ abi: fwArtifact.abi, bytecode: fwArtifact.bytecode, args }) });
      showFw(`Deploying BaseCityFlywheel… <a href="${basescan(`tx/${hash}`)}" target="_blank" rel="noopener">transaction</a>`);
      const done = await waitTx(hash, provider, 300000);
      if (!done.ok) throw new Error(done.ok === false ? 'Flywheel deployment failed' : 'Still pending: check Basescan');
      const addr = getAddress(done.receipt.contractAddress);
      const encoded = encodeAbiParameters(ctor.inputs, args).slice(2);
      const bcToken = CONFIG.flywheel?.basecityToken;
      const factory = CONFIG.flywheel?.factory || '0x006Da367654a487bb277fe25ff54f0fE0f741377';
      showFw(`<b>Deployed BaseCityFlywheel: <a href="${basescan(`address/${addr}`)}" target="_blank" rel="noopener">${addr}</a></b>
        <ol class="steps">
          <li>Put <code>${addr}</code> into <code>src/config.js</code> → <code>flywheel.contract</code> (and env <code>FLYWHEEL_CONTRACT=${addr}</code>${fwKey ? ' + <code>FLYWHEEL_OPERATOR_KEY</code> above' : ''}).</li>
          <li>Verify on Basescan: <a href="https://basescan.org/verifyContract?a=${addr}" target="_blank" rel="noopener">verify</a>, compiler <code>${esc(fwArtifact.compiler)}</code>, MIT license, upload <a href="${fwInputUrl}" download="BaseCityFlywheel.input.json">BaseCityFlywheel.input.json</a>. Constructor args: <code>${encoded}</code></li>
          <li>Route 80% LP fees from <code>$BASECITY/WETH</code> (connect creator wallet <code>${esc(CONFIG.flywheel?.creator || '')}</code>): <button type="button" class="btn" id="fw-route">Route $BASECITY LP fees to Flywheel</button> <span id="fw-route-msg"></span></li>
        </ol>`, 'ok');
      const routeBtn = $('fw-route');
      if (routeBtn) {
        routeBtn.onclick = async () => {
          const rMsg = $('fw-route-msg');
          try {
            routeBtn.disabled = true;
            rMsg.textContent = 'Confirm setCreatorRecipient in wallet…';
            const data = encodeFunctionData({ abi: FACTORY_SET_RECIPIENT_ABI, functionName: 'setCreatorRecipient', args: [getAddress(bcToken), addr] });
            const rHash = await sendTx(provider, { from: account, to: getAddress(factory), data });
            const rDone = await waitTx(rHash, provider, 180000);
            if (!rDone.ok) throw new Error('setCreatorRecipient reverted (check connected wallet is creator)');
            rMsg.innerHTML = `Routed. <a href="${basescan(`tx/${rHash}`)}" target="_blank" rel="noopener">tx</a>`;
          } catch (err) {
            routeBtn.disabled = false;
            rMsg.textContent = rejected(err) ? 'Cancelled.' : (err.shortMessage || err.message);
          }
        };
      }
    } catch (err) {
      $('fw-go').disabled = false;
      showFw(rejected(err) ? 'Cancelled.' : esc(err.shortMessage || err.message), rejected(err) ? '' : 'bad');
    }
  };
}

if ($('fw-route-existing') && CONFIG.flywheel?.contract) {
  $('fw-route-existing').onclick = async () => {
    const btn = $('fw-route-existing');
    const fwAddr = getAddress(CONFIG.flywheel.contract);
    const bcToken = getAddress(CONFIG.flywheel.basecityToken);
    const factory = getAddress(CONFIG.flywheel.factory || '0x006Da367654a487bb277fe25ff54f0fE0f741377');
    try {
      btn.disabled = true;
      showFw(`Confirm routing 80% LP fees of <code>${bcToken}</code> to Flywheel <code>${fwAddr}</code> in MetaMask…`);
      const data = encodeFunctionData({ abi: FACTORY_SET_RECIPIENT_ABI, functionName: 'setCreatorRecipient', args: [bcToken, fwAddr] });
      const rHash = await sendTx(provider, { from: account, to: factory, data });
      const rDone = await waitTx(rHash, provider, 180000);
      if (!rDone.ok) throw new Error('setCreatorRecipient reverted (ensure connected wallet is creator 0xe7d6...4530)');
      showFw(`Routed 80% LP fees of <b>$BASECITY/WETH</b> to Flywheel <code>${fwAddr}</code>. <a href="${basescan(`tx/${rHash}`)}" target="_blank" rel="noopener">View tx on Basescan</a>`, 'ok');
    } catch (err) {
      btn.disabled = false;
      showFw(rejected(err) ? 'Cancelled.' : esc(err.shortMessage || err.message), rejected(err) ? '' : 'bad');
    }
  };
}

const showEsc = (html, tone = '') => { const o = $('esc-out'); if (!o) return; o.hidden = false; o.className = `note ${tone}`; o.innerHTML = html; };

if ($('esc-form')) {
  $('esc-form').onsubmit = async (e) => {
    e.preventDefault();
    const ownerAddr = $('esc-owner').value.trim();
    const fwAddr = $('esc-flywheel').value.trim();
    const nftAddr = $('esc-nft').value.trim();
    const agentAddr = $('esc-agent').value.trim();
    const bps = Number($('esc-bps').value.trim());
    for (const [lbl, val] of [['Owner', ownerAddr], ['Flywheel', fwAddr], ['Blocky NFT', nftAddr], ['ERC-8004 Registry', agentAddr]]) {
      if (!isAddress(val, { strict: false })) return showEsc(`${lbl}: not a valid 0x address`, 'bad');
    }
    if (!Number.isInteger(bps) || bps < 0 || bps > 1000) return showEsc('Protocol fee must be 0–1000 basis points (max 10%)', 'bad');
    const args = [getAddress(ownerAddr), getAddress(fwAddr), getAddress(nftAddr), getAddress(agentAddr), bps];
    const ctor = escArtifact.abi.find((x) => x.type === 'constructor');
    try {
      $('esc-go').disabled = true;
      showEsc('Confirm BaseCityTaskEscrow deployment in your wallet…');
      const hash = await sendTx(provider, { from: account, data: encodeDeployData({ abi: escArtifact.abi, bytecode: escArtifact.bytecode, args }) });
      showEsc(`Deploying BaseCityTaskEscrow… <a href="${basescan(`tx/${hash}`)}" target="_blank" rel="noopener">transaction</a>`);
      const done = await waitTx(hash, provider, 300000);
      if (!done.ok) throw new Error(done.ok === false ? 'Escrow deployment failed' : 'Still pending: check Basescan');
      const addr = getAddress(done.receipt.contractAddress);
      const encoded = encodeAbiParameters(ctor.inputs, args).slice(2);
      showEsc(`<b>Deployed BaseCityTaskEscrow: <a href="${basescan(`address/${addr}`)}" target="_blank" rel="noopener">${addr}</a></b>
        <ol class="steps">
          <li>Add <code>VITE_TASK_ESCROW_ADDRESS=${addr}</code> and <code>TASK_ESCROW_CONTRACT=${addr}</code> to <code>.env</code> and Vercel Environment Variables, then redeploy.</li>
          <li>Verify on Basescan: <a href="https://basescan.org/verifyContract?a=${addr}" target="_blank" rel="noopener">verify</a>, type "Solidity (Standard-Json-Input)", compiler <code>${esc(escArtifact.compiler)}</code>, MIT license, upload <a href="${escInputUrl}" download="BaseCityTaskEscrow.input.json">BaseCityTaskEscrow.input.json</a>. Constructor args: <code>${encoded}</code></li>
        </ol>`, 'ok');
    } catch (err) {
      $('esc-go').disabled = false;
      showEsc(rejected(err) ? 'Cancelled.' : esc(err.shortMessage || err.message), rejected(err) ? '' : 'bad');
    }
  };
}
