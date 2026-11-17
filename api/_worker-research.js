import {parseAbi,formatUnits,parseUnits} from 'viem';
const json=async(url)=>{const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`Data source returned ${r.status}`);return r.json();};
export async function researchExit(client) {
 const block=await client.getBlockNumber();
 const market=await json('https://api.geckoterminal.com/api/v2/networks/base/trending_pools');
 const picks=(market.data||[]).filter(r=>r.relationships?.dex?.data?.id==='uniswap-v3-base'&&Number(r.attributes?.reserve_in_usd)>=100000&&['base_0x4200000000000000000000000000000000000006','base_0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'].includes(r.relationships?.quote_token?.data?.id)).slice(0,8);
 const failures=[];
const poolAbi=parseAbi(['function token0() view returns (address)','function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)','function fee() view returns (uint24)']);
const tokenAbi=parseAbi(['function decimals() view returns (uint8)']);
const qabi=parseAbi(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const results=[]; for (const row of picks) {
 try {
 const token=row.relationships.base_token.data.id.replace('base_',''),out=row.relationships.quote_token.data.id.replace('base_',''),pool=row.attributes.address;
 const [token0,slot,fee,decimals,outDecimals,security]=await Promise.all([
 client.readContract({address:pool,abi:poolAbi,functionName:'token0',blockNumber:block}),client.readContract({address:pool,abi:poolAbi,functionName:'slot0',blockNumber:block}),client.readContract({address:pool,abi:poolAbi,functionName:'fee',blockNumber:block}),client.readContract({address:token,abi:tokenAbi,functionName:'decimals',blockNumber:block}),client.readContract({address:out,abi:tokenAbi,functionName:'decimals',blockNumber:block}),json(`https://api.gopluslabs.io/api/v1/token_security/8453?contract_addresses=${token}`)]);
 const risk=security.result?.[token.toLowerCase()];
 if(!risk || ['is_honeypot','cannot_sell_all','transfer_pausable','is_blacklisted'].some(k=>risk[k]!=='0') || risk.sell_tax!=='0') throw new Error('Security flags unavailable or sell-risk filter failed');
 const factory=await client.readContract({address:pool,abi:parseAbi(['function factory() view returns (address)']),functionName:'factory',blockNumber:block});
 if(factory.toLowerCase()!=='0x33128a8fc17869897dce68ed026d694621f6fdfd')throw new Error('Pool is not from verified Uniswap V3 Base factory');
 if(decimals>36||outDecimals>36)throw new Error('Unsupported token decimals');
 const ratio=Number(slot[0])**2/2**192,rawRate=token0.toLowerCase()===token.toLowerCase()?ratio:1/ratio;
 const quoteUsd=Number(row.attributes.quote_token_price_usd),spotUsd=rawRate*10**decimals/10**outDecimals*quoteUsd;
 if(!Number.isFinite(spotUsd)||spotUsd<=0||!Number.isFinite(quoteUsd)||quoteUsd<=0)throw new Error('Invalid price reference');
 const quote=async usd=>{
  const amountIn=parseUnits((usd/spotUsd).toFixed(decimals),decimals);
  const result=await client.simulateContract({address:'0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',abi:qabi,functionName:'quoteExactInputSingle',args:[{tokenIn:token,tokenOut:out,amountIn,fee,sqrtPriceLimitX96:0n}],blockNumber:block});
  const received=Number(formatUnits(result.result[0],outDecimals))*quoteUsd;
  return {input_usd:usd,output_usd:received,loss_pct:(1-received/usd)*100,amount_in:amountIn.toString(),amount_out:result.result[0].toString()};
 };
 const samples=[];for(const size of [100,500,1000]){try{samples.push(await quote(size));}catch(e){samples.push({input_usd:size,error:e.shortMessage||e.message});}}
 if(samples.some(q=>q.error))throw new Error("Required quote failed");
 let low=0,high=100000,error=null;for(let i=0;i<10;i++){let mid=(low+high)/2;try{const q=await quote(mid);if(q.loss_pct<5)low=mid;else high=mid;}catch(e){error=e.shortMessage||e.message;high=mid;}}
 if(error)throw new Error('Boundary quote failed; no reliable maximum size');
 const upperQuote=await quote(high);if(upperQuote.loss_pct<5)throw new Error('No failing upper bound below $100,000; manual review required');
 results.push({name:row.attributes.name,token,pool,quote_token:out,market:row.attributes,spot_usd:spotUsd,fee:fee/1e6,security:security.result?.[token.toLowerCase()]||null,samples,max_input_usd_under_5pct:low,upper_bound_usd:high,search_error:error});
 } catch(e) { failures.push({pool:row.attributes.address,error:String(e.shortMessage||e.message).slice(0,180)}); }
 if(results.length===3)break;
}

 if(results.length<3)throw new Error(`Only ${results.length}/3 candidates passed all checks. ${JSON.stringify(failures)}`);
 const evidence={timestamp:new Date().toISOString(),chainId:8453,block:block.toString(),results,failures};
 const report=['Base exit research — completed snapshot',`Base block ${block}; ${evidence.timestamp}`, ...results.map(r=>`${r.name}\nToken: ${r.token}\nPool: ${r.pool}\n24h volume: $${r.market.volume_usd.h24}; TVL: $${r.market.reserve_in_usd} (not executable depth).\nGoPlus: ${JSON.stringify(Object.fromEntries(['buy_tax','sell_tax','is_honeypot','cannot_sell_all','transfer_pausable','is_blacklisted'].map(k=>[k,r.security[k]])))}\nQuotes including pool fee: ${r.samples.map(q=>`$${q.input_usd} input -> $${q.output_usd.toFixed(2)} marked output; ${q.loss_pct.toFixed(3)}% loss vs marginal spot`).join('; ')}.\nApproximate under-5% input boundary: $${Math.floor(r.max_input_usd_under_5pct/100)*100}; failing upper bracket $${r.upper_bound_usd.toFixed(2)}.\nOutput token: ${r.quote_token}\nSource: https://www.geckoterminal.com/base/pools/${r.pool}\nSecurity: https://api.gopluslabs.io/api/v1/token_security/8453?contract_addresses=${r.token}`), 'Method: Uniswap Base QuoterV2 eth_call, verified V3 factory, slot0 and decimals at the same block. Price impact plus pool fee measured against marginal spot; USD uses external quote-token reference. Binary search $0–$100,000, 10 steps, approximate $97.66 resolution. Three supported trending pools, not the entire market. TVL and volume from external snapshot, not synchronized to the block.','Limitations: Quoter tests pool mathematics, not a wallet-specific router/transferFrom sell. GoPlus flags are third-party checks, not an audit. WETH output is not USDC; another swap costs extra. No gas, MEV or future execution guarantee. Quote sizes are observations, not recommended orders. Not a buy signal.','Sources: https://api.geckoterminal.com/api/v2/networks/base/trending_pools; https://mainnet.base.org; QuoterV2 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a; factory 0x33128a8fC17869897dcE68Ed026d694621f6FDfD.'].join('\n\n');
 if(report.length>20000)throw new Error('Report exceeds delivery limit');
 return {preview:`Base exit screen at block ${block}: ${results.map(r=>r.name.split(' /')[0]).join(', ')}. Three candidates passed available sell-risk flags and same-block sell quote checks. Includes tax, volume, TVL and approximate under-5% bounds. Snapshot only, not a wallet-specific sell guarantee.`,result:report,evidence,costUnits:0};
}
