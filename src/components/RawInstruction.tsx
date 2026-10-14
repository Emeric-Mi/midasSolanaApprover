import { useState } from 'react';
import type { RawIxView } from '../lib/spl';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-md border border-midas-border bg-white px-2 py-1 text-xs text-midas-muted transition hover:border-midas-navy hover:text-midas-navy"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-midas-border py-2 first:border-t-0">
      <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-midas-muted">
        {label}
      </span>
      <code className="min-w-0 flex-1 break-all font-mono text-xs text-midas-ink">{value}</code>
      <CopyButton text={value} />
    </div>
  );
}

export function RawInstruction({ view }: { view: RawIxView }) {
  return (
    <div className="rounded-card border border-midas-border bg-midas-canvas p-5">
      <h3 className="mb-1 text-sm font-semibold text-midas-ink">Raw instruction</h3>
      <p className="mb-4 text-sm text-midas-muted">
        For multisig signers (Squads and similar). Paste these values into your custom transaction
        builder instead of connecting a wallet above. Account order matters.
      </p>

      <Row label="Program" value={view.programId} />

      <div className="mt-4 mb-1 text-xs uppercase tracking-wide text-midas-muted">Accounts</div>
      <div className="overflow-hidden rounded-lg border border-midas-border bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-midas-canvas text-midas-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {view.accounts.map((a, i) => (
              <tr key={i} className="border-t border-midas-border">
                <td className="px-3 py-2 text-midas-muted">{i}</td>
                <td className="px-3 py-2 text-midas-ink">{a.name}</td>
                <td className="px-3 py-2 font-mono break-all text-midas-ink">{a.pubkey}</td>
                <td className="px-3 py-2 text-midas-muted">
                  {[a.isWritable ? 'writable' : null, a.isSigner ? 'signer' : null]
                    .filter(Boolean)
                    .join(', ') || 'none'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <Row label="Data (hex)" value={view.dataHex} />
        <Row label="Data (b64)" value={view.dataBase64} />
      </div>
    </div>
  );
}
