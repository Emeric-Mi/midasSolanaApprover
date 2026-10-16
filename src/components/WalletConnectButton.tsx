import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectWalletName } from '@walletconnect/solana-adapter';

/**
 * The adapter modal only lists wallets whose readyState is `Installed` at the top
 * level, and collapses the rest behind a "More options" button. WalletConnect is
 * never `Installed` because it is not an extension, so it ends up hidden exactly
 * for the custody users who need it. This surfaces it directly.
 */
export function WalletConnectButton() {
  const { wallets, select, connect, connected, connecting, wallet } = useWallet();
  const [error, setError] = useState<string | null>(null);
  // `select` only records the choice; connecting has to wait for the provider to
  // re-render with the new adapter, so the click arms this and an effect follows up.
  const pending = useRef(false);

  const isThisOne = wallet?.adapter.name === WalletConnectWalletName;

  useEffect(() => {
    if (!pending.current || !isThisOne || connected || connecting) return;
    pending.current = false;
    connect().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [isThisOne, connected, connecting, connect]);

  const available = wallets.some((w) => w.adapter.name === WalletConnectWalletName);
  if (!available || connected) return null;

  const handleClick = () => {
    setError(null);
    pending.current = true;
    if (isThisOne) {
      pending.current = false;
      connect().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    } else {
      select(WalletConnectWalletName);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={connecting}
        className="h-10 rounded-lg border border-midas-navy bg-white px-4 text-sm font-medium text-midas-navy transition hover:bg-midas-tint disabled:cursor-not-allowed disabled:opacity-60"
      >
        {connecting ? 'Connecting…' : 'WalletConnect'}
      </button>
      {error && <span className="mt-1 max-w-xs text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}
