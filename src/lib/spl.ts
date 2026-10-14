import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createApproveCheckedInstruction,
  createRevokeInstruction,
  getMint,
  getAccount,
  type Account as TokenAccount,
} from '@solana/spl-token';

// api.mainnet-beta.solana.com answers browser requests with 403 Access forbidden, so it
// cannot be the default here. publicnode serves CORS (`access-control-allow-origin: *`)
// but is rate-limited - set VITE_MAINNET_RPC to a dedicated endpoint for real use.
export const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: import.meta.env.VITE_MAINNET_RPC ?? 'https://solana-rpc.publicnode.com',
  devnet: import.meta.env.VITE_DEVNET_RPC ?? 'https://api.devnet.solana.com',
};

export function parsePubkey(value: string): PublicKey | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const key = new PublicKey(trimmed);
    // PublicKey accepts 32-byte values that are not valid base58 addresses of the
    // expected length, so round-trip it to reject anything that re-encodes differently.
    return key.toBase58() === trimmed ? key : null;
  } catch {
    return null;
  }
}

/**
 * A mint lives under either the legacy SPL Token program or Token-2022. The ATA
 * derivation and every instruction must use the owning program, so resolve it
 * from the account owner rather than assuming the legacy one.
 */
export async function resolveTokenProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  let info;
  try {
    info = await connection.getAccountInfo(mint);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
      throw new Error(
        'The RPC endpoint rejected this request. Set VITE_MAINNET_RPC to an endpoint that allows browser access.',
      );
    }
    throw new Error(`RPC request failed: ${msg}`);
  }
  if (!info) throw new Error('Mint account not found on this cluster.');
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw new Error(`Address is not a token mint (owner: ${info.owner.toBase58()}).`);
}

export type MintInfo = {
  decimals: number;
  tokenProgram: PublicKey;
};

export async function loadMint(connection: Connection, mint: PublicKey): Promise<MintInfo> {
  const tokenProgram = await resolveTokenProgram(connection, mint);
  const parsed = await getMint(connection, mint, undefined, tokenProgram);
  return { decimals: parsed.decimals, tokenProgram };
}

export function deriveAta(mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    true, // allowOwnerOffCurve: the owner may be a PDA (Squads vault)
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

export type AtaState = {
  address: PublicKey;
  exists: boolean;
  amount: bigint;
  delegate: PublicKey | null;
  delegatedAmount: bigint;
};

export async function loadAta(
  connection: Connection,
  ata: PublicKey,
  tokenProgram: PublicKey,
): Promise<AtaState> {
  let account: TokenAccount | null = null;
  try {
    account = await getAccount(connection, ata, undefined, tokenProgram);
  } catch {
    // TokenAccountNotFoundError and friends all mean "nothing to show yet".
    return { address: ata, exists: false, amount: 0n, delegate: null, delegatedAmount: 0n };
  }
  return {
    address: ata,
    exists: true,
    amount: account.amount,
    delegate: account.delegate,
    delegatedAmount: account.delegate ? account.delegatedAmount : 0n,
  };
}

/** Parse a UI-denominated amount into base units, rejecting excess precision. */
export function toBaseUnits(input: string, decimals: number): bigint {
  const normalised = input.trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(normalised) || normalised === '' || normalised === '.') {
    throw new Error('Enter a positive number.');
  }
  const [whole, fraction = ''] = normalised.split('.');
  if (fraction.length > decimals) {
    throw new Error(`This mint has ${decimals} decimals; trim the extra digits.`);
  }
  const base =
    BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (base <= 0n) throw new Error('Enter a positive number.');
  if (base > 2n ** 64n - 1n) throw new Error('Amount exceeds the u64 maximum.');
  return base;
}

export function formatBaseUnits(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const wholeStr = whole.toLocaleString('en-US');
  if (fraction === 0n) return wholeStr;
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${wholeStr}.${fractionStr}`;
}

export function buildApproveIx(params: {
  ata: PublicKey;
  mint: PublicKey;
  delegate: PublicKey;
  owner: PublicKey;
  amount: bigint;
  decimals: number;
  tokenProgram: PublicKey;
}): TransactionInstruction {
  return createApproveCheckedInstruction(
    params.ata,
    params.mint,
    params.delegate,
    params.owner,
    params.amount,
    params.decimals,
    [],
    params.tokenProgram,
  );
}

export function buildRevokeIx(params: {
  ata: PublicKey;
  owner: PublicKey;
  tokenProgram: PublicKey;
}): TransactionInstruction {
  return createRevokeInstruction(params.ata, params.owner, [], params.tokenProgram);
}

export async function sendIx(
  connection: Connection,
  ix: TransactionInstruction,
  payer: PublicKey,
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>,
): Promise<string> {
  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  const signature = await sendTransaction(tx, connection);
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}

/** Instruction rendered for multisig builders (Squads) that take raw input. */
export type RawIxView = {
  programId: string;
  accounts: { name: string; pubkey: string; isSigner: boolean; isWritable: boolean }[];
  dataHex: string;
  dataBase64: string;
};

const ACCOUNT_LABELS: Record<string, string[]> = {
  approve: ['source', 'mint', 'delegate', 'owner'],
  revoke: ['source', 'owner'],
};

export function toRawView(ix: TransactionInstruction, kind: 'approve' | 'revoke'): RawIxView {
  const labels = ACCOUNT_LABELS[kind];
  const bytes = Uint8Array.from(ix.data);
  return {
    programId: ix.programId.toBase58(),
    accounts: ix.keys.map((k, i) => ({
      name: labels[i] ?? `account ${i}`,
      pubkey: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    dataHex: Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
    dataBase64: btoa(String.fromCharCode(...bytes)),
  };
}

export const EXPLORER = {
  tx: (sig: string, cluster: string) =>
    `https://solscan.io/tx/${sig}${cluster === 'devnet' ? '?cluster=devnet' : ''}`,
  account: (addr: string, cluster: string) =>
    `https://solscan.io/account/${addr}${cluster === 'devnet' ? '?cluster=devnet' : ''}`,
};
