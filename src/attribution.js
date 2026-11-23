// Base Builder Code (ERC-8021) attribution: appends bc_4wygqlmz to onchain transactions.
import { Attribution } from 'ox/erc8021';

export const BUILDER_CODE = 'bc_4wygqlmz';
export const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

export function withBuilderCode(tx) {
  if (!tx || typeof tx !== 'object') return tx;
  const data = tx.data || '0x';
  const suffix = DATA_SUFFIX.startsWith('0x') ? DATA_SUFFIX.slice(2) : DATA_SUFFIX;
  if (data.toLowerCase().endsWith(suffix.toLowerCase())) return tx;
  return { ...tx, data: `${data}${suffix}` };
}
