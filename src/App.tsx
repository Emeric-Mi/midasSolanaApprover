import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
  useConnection,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
import { WalletAdapterNetwork, type Adapter } from '@solana/wallet-adapter-base';
import '@solana/wallet-adapter-react-ui/styles.css';

import { Field, TextInput } from './components/Field';
import { RawInstruction } from './components/RawInstruction';
import { Logo } from './components/Logo';
import { WalletConnectButton } from './components/WalletConnectButton';
import { TOKENS, CUSTOM_MINT } from './lib/tokens';
import {
  RPC_ENDPOINTS,
  parsePubkey,
  loadMint,
  deriveAta,
  loadAta,
  toBaseUnits,
  formatBaseUnits,
  buildApproveIx,
  buildRevokeIx,
  toRawView,
  sendIx,
  EXPLORER,
  type MintInfo,
  type AtaState,
  type RawIxView,
} from './lib/spl';

type Cluster = keyof typeof RPC_ENDPOINTS;

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-midas-border bg-white p-6 shadow-[0_1px_2px_rgba(13,20,36,0.04)]">
      {children}
    </div>
  );
}

function Delegate({ cluster, setCluster }: { cluster: Cluster; setCluster: (c: Cluster) => void }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const tokens = TOKENS[cluster] ?? [];
  // Selector value is a mint address, or CUSTOM_MINT to reveal the free-text field.
  const [selected, setSelected] = useState<string>(tokens[0]?.mint ?? CUSTOM_MINT);
  const [customMint, setCustomMint] = useState('');
  const mintStr = selected === CUSTOM_MINT ? customMint : selected;

  const [delegateStr, setDelegateStr] = useState('');
  const [ownerStr, setOwnerStr] = useState('');
  const [amountStr, setAmountStr] = useState('');

  const [mintInfo, setMintInfo] = useState<MintInfo | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [ata, setAta] = useState<AtaState | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string; sig?: string } | null>(
    null,
  );

  const mint = parsePubkey(mintStr);
  const delegate = parsePubkey(delegateStr);
  // Owner defaults to the connected wallet, but a Squads signer needs to enter
  // the vault address instead - it is the account that actually holds the tokens.
  const ownerOverride = parsePubkey(ownerStr);
  const owner = ownerStr.trim() ? ownerOverride : publicKey;

  const mintInvalid = mintStr.trim().length > 0 && !mint;
  const delegateInvalid = delegateStr.trim().length > 0 && !delegate;
  const ownerInvalid = ownerStr.trim().length > 0 && !ownerOverride;

  // Mints differ per cluster, so a selection made on one is meaningless on the other.
  useEffect(() => {
    setSelected(TOKENS[cluster]?.[0]?.mint ?? CUSTOM_MINT);
    setCustomMint('');
  }, [cluster]);

  // Resolve mint decimals + owning token program whenever the mint changes.
  useEffect(() => {
    let cancelled = false;
    setMintInfo(null);
    setMintError(null);
    setAta(null);
    if (!mint) return;
    (async () => {
      try {
        const info = await loadMint(connection, mint);
        if (!cancelled) setMintInfo(info);
      } catch (e) {
        if (!cancelled) setMintError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mintStr, connection, cluster]);

  const refreshAta = useCallback(async () => {
    if (!mint || !mintInfo || !owner) {
      setAta(null);
      return;
    }
    const address = deriveAta(mint, owner, mintInfo.tokenProgram);
    const state = await loadAta(connection, address, mintInfo.tokenProgram);
    setAta(state);
  }, [mintStr, mintInfo, ownerStr, publicKey, connection]);

  useEffect(() => {
    refreshAta();
  }, [refreshAta]);

  const amountResult = useMemo(() => {
    if (!mintInfo || !amountStr.trim())
      return { base: null as bigint | null, error: null as string | null };
    try {
      return { base: toBaseUnits(amountStr, mintInfo.decimals), error: null };
    } catch (e) {
      return { base: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [amountStr, mintInfo]);

  const approveIx = useMemo(() => {
    if (!mint || !mintInfo || !delegate || !owner || !ata || amountResult.base === null)
      return null;
    return buildApproveIx({
      ata: ata.address,
      mint,
      delegate,
      owner,
      amount: amountResult.base,
      decimals: mintInfo.decimals,
      tokenProgram: mintInfo.tokenProgram,
    });
  }, [mintStr, mintInfo, delegateStr, ownerStr, publicKey, ata, amountResult.base]);

  const revokeIx = useMemo(() => {
    if (!mintInfo || !owner || !ata) return null;
    return buildRevokeIx({ ata: ata.address, owner, tokenProgram: mintInfo.tokenProgram });
  }, [mintInfo, ownerStr, publicKey, ata]);

  const [rawView, setRawView] = useState<RawIxView | null>(null);

  const run = async (kind: 'approve' | 'revoke') => {
    const ix = kind === 'approve' ? approveIx : revokeIx;
    if (!ix || !publicKey) return;
    setBusy(true);
    setStatus(null);
    try {
      const sig = await sendIx(connection, ix, publicKey, sendTransaction);
      setStatus({
        kind: 'ok',
        msg: kind === 'approve' ? 'Delegation approved.' : 'Delegation revoked.',
        sig,
      });
      await refreshAta();
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  // A wallet can only sign for an account it owns; a Squads vault address cannot.
  const ownerIsConnectedWallet = !!owner && !!publicKey && owner.equals(publicKey);
  const canSign = connected && ownerIsConnectedWallet;

  const isToken2022 = mintInfo?.tokenProgram.toBase58().startsWith('TokenzQd');

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo height={20} />
          <span className="text-lg font-semibold tracking-tight text-midas-inkDeep">MIDAS</span>
          <span className="ml-2 rounded-full bg-midas-tint px-2.5 py-0.5 text-xs font-medium text-midas-navy">
            Token Delegation
          </span>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={cluster}
            onChange={(e) => setCluster(e.target.value as Cluster)}
            className="h-10 rounded-lg border border-midas-border bg-white px-3 text-sm text-midas-ink outline-none focus:border-midas-navy"
          >
            <option value="mainnet">Mainnet Beta</option>
            <option value="devnet">Devnet</option>
          </select>
          <WalletConnectButton />
          <WalletMultiButton />
        </div>
      </header>

      <Panel>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-midas-inkDeep">
          Delegate SPL Token
        </h1>
        <p className="mb-7 text-sm text-midas-muted">
          Authorise a Midas vault to draw up to a capped amount from your token account. This sets a
          ceiling, not a transfer: nothing moves until a redemption is executed, and you can revoke
          at any time.
        </p>

        <Field
          label="Token"
          error={mintInvalid ? 'Is not a valid Solana address' : mintError}
          hint={
            mintInfo
              ? `${mintStr} · ${mintInfo.decimals} decimals · ${isToken2022 ? 'Token-2022' : 'legacy SPL Token'}`
              : 'The token to delegate.'
          }
        >
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-midas-border bg-midas-canvas px-4 py-3 text-sm text-midas-ink outline-none transition focus:border-midas-navy focus:bg-white"
          >
            {tokens.map((t) => (
              <option key={t.mint} value={t.mint}>
                {t.symbol}
              </option>
            ))}
            <option value={CUSTOM_MINT}>Custom mint address…</option>
          </select>
          {selected === CUSTOM_MINT && (
            <div className="mt-3">
              <TextInput
                value={customMint}
                onChange={setCustomMint}
                invalid={mintInvalid}
                mono
                placeholder="Paste a mint address (Token-2022 or legacy SPL)"
              />
            </div>
          )}
        </Field>

        <Field
          label="Token Account Owner"
          error={ownerInvalid ? 'Is not a valid Solana address' : null}
          hint="Leave empty to use your connected wallet. Squads users: enter the vault address that holds the tokens."
        >
          <TextInput
            value={ownerStr}
            onChange={setOwnerStr}
            invalid={ownerInvalid}
            mono
            placeholder={publicKey ? publicKey.toBase58() : 'Connect a wallet or paste an address'}
          />
        </Field>

        <div className="mb-6 rounded-card border border-midas-border bg-midas-canvas p-4">
          <div className="text-sm font-semibold text-midas-ink">Current state</div>
          {!ata || !mintInfo ? (
            <p className="mt-1 text-sm text-midas-muted">
              Enter a mint and an owner to load the associated token account.
            </p>
          ) : !ata.exists ? (
            <p className="mt-1 text-sm text-midas-muted">
              ATA does not exist yet for this mint and owner. It must be funded before you can
              delegate.
            </p>
          ) : (
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-midas-muted">Balance</dt>
                <dd className="font-mono text-midas-ink">
                  {formatBaseUnits(ata.amount, mintInfo.decimals)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-midas-muted">Current delegate</dt>
                <dd className="break-all text-right font-mono text-xs text-midas-ink">
                  {ata.delegate ? ata.delegate.toBase58() : 'none'}
                </dd>
              </div>
              {ata.delegate && (
                <div className="flex justify-between gap-4">
                  <dt className="text-midas-muted">Delegated amount</dt>
                  <dd className="font-mono text-midas-ink">
                    {formatBaseUnits(ata.delegatedAmount, mintInfo.decimals)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4 pt-1">
                <dt className="text-midas-muted">Token account</dt>
                <dd>
                  <a
                    href={EXPLORER.account(ata.address.toBase58(), cluster)}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-mono text-xs text-midas-accent hover:underline"
                  >
                    {ata.address.toBase58()}
                  </a>
                </dd>
              </div>
            </dl>
          )}
        </div>

        <Field
          label="Delegate Address"
          error={delegateInvalid ? 'Is not a valid Solana address' : null}
          hint="The Midas redemption vault that will be authorised to pull tokens. Use the address Midas sent you, and check it character by character."
        >
          <TextInput
            value={delegateStr}
            onChange={setDelegateStr}
            invalid={delegateInvalid}
            mono
            placeholder="Paste the vault address provided by Midas"
          />
        </Field>

        <Field
          label="Amount"
          error={amountResult.error}
          hint="Amount in UI tokens (converted using the mint decimals)."
        >
          <TextInput
            value={amountStr}
            onChange={setAmountStr}
            invalid={!!amountResult.error}
            placeholder="0"
          />
        </Field>

        <div className="mb-6 rounded-card border border-amber-200 bg-amber-50 p-4">
          <div className="mb-1.5 text-sm font-semibold text-amber-900">
            Your wallet will warn you. That is expected.
          </div>
          <p className="text-sm leading-relaxed text-amber-900/90">
            Phantom and Solflare flag every delegation request, and Phantom may block it outright
            behind a &ldquo;confirm anyway&rdquo; override. They are not wrong: this instruction
            does grant permission to withdraw from your account in the future. That is exactly what
            a redemption vault needs in order to pay you out, and the permission is capped at the
            amount above and revocable at any time.
          </p>
          <p className="mt-2.5 text-sm leading-relaxed text-amber-900/90">
            The warning cannot tell a legitimate vault from a scam, so check these yourself before
            confirming: the delegate address matches the one Midas sent you, the amount is what you
            intend to authorise, and the token and owner are correct.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!approveIx || !canSign || busy}
            onClick={() => run('approve')}
            className="rounded-lg bg-midas-navy px-5 py-2.5 text-sm font-medium text-white transition hover:bg-midas-navyHover disabled:cursor-not-allowed disabled:bg-midas-borderStrong disabled:text-midas-muted"
          >
            {busy ? 'Confirming…' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={!revokeIx || !canSign || busy || !ata?.delegate}
            onClick={() => run('revoke')}
            className="rounded-lg border border-midas-border bg-white px-5 py-2.5 text-sm font-medium text-midas-ink transition hover:border-midas-navy hover:text-midas-navy disabled:cursor-not-allowed disabled:text-midas-muted disabled:hover:border-midas-border"
          >
            Revoke
          </button>
          <button
            type="button"
            disabled={!approveIx && !revokeIx}
            onClick={() =>
              setRawView(
                approveIx ? toRawView(approveIx, 'approve') : toRawView(revokeIx!, 'revoke'),
              )
            }
            className="text-sm text-midas-accent hover:underline disabled:text-midas-muted disabled:no-underline"
          >
            Show raw instruction
          </button>
        </div>

        {connected && !ownerIsConnectedWallet && (
          <p className="mt-4 text-sm text-midas-muted">
            The owner above is not your connected wallet, so this page cannot sign for it. Use
            &ldquo;Show raw instruction&rdquo; and submit it through your multisig instead.
          </p>
        )}

        {status && (
          <div
            className={`mt-5 rounded-lg border px-4 py-3 text-sm ${
              status.kind === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {status.msg}
            {status.sig && (
              <>
                {' '}
                <a
                  href={EXPLORER.tx(status.sig, cluster)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  View transaction
                </a>
              </>
            )}
          </div>
        )}
      </Panel>

      {rawView && (
        <div className="mt-6">
          <RawInstruction view={rawView} />
        </div>
      )}

      <footer className="mt-8 text-center text-xs text-midas-muted">
        Verify the delegate address against Midas documentation before approving.
      </footer>
    </div>
  );
}

export default function App() {
  const [cluster, setCluster] = useState<Cluster>('mainnet');
  const endpoint = RPC_ENDPOINTS[cluster];

  const wallets = useMemo(() => {
    const list: Adapter[] = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

    // WalletConnect is how custody platforms (Fireblocks and similar) connect to a
    // dApp. It needs a Reown project id, so the option only appears once one is
    // configured; a clone without it still gets the browser wallets.
    const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
    if (projectId) {
      list.push(
        new WalletConnectWalletAdapter({
          network:
            cluster === 'devnet' ? WalletAdapterNetwork.Devnet : WalletAdapterNetwork.Mainnet,
          options: { projectId },
        }),
      );
    }

    return list;
  }, [cluster]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Delegate cluster={cluster} setCluster={setCluster} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
