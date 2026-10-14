# Midas Token Delegation

A single-page tool for authorising a Midas redemption vault to draw payment tokens from
your own token account on Solana.

Delegation sets a **ceiling, not a transfer**. Approving does not move any tokens: it
records a maximum that the delegate is allowed to pull, and only an executed redemption
actually transfers anything. You can revoke at any time, and revoking is immediate.

No block explorer can do this, Solscan, Solana Explorer and SolanaFM are read-only, and
neither Phantom nor Solflare exposes `approve` in their interface. Hence this page.

## Requirements

- [Node.js](https://nodejs.org) 18 or newer (`node --version` to check)
- A Solana wallet: Phantom or Solflare, **or** a Squads multisig (see below)

## Running it

```bash
git clone <this-repo>
cd midas-delegate-ui
npm install
npm run dev
```

Open the URL it prints (usually <http://localhost:5173>).

To build a static bundle instead, `npm run build` writes to `dist/`, which can be served
by any static host.

### RPC endpoint

The app ships with a public endpoint that works out of the box but is rate-limited. For
anything beyond occasional use, point it at your own RPC by creating a `.env.local` file
in the project root:

```
VITE_MAINNET_RPC=https://your-endpoint
VITE_DEVNET_RPC=https://your-devnet-endpoint
```

Note that `https://api.mainnet-beta.solana.com` cannot be used here: it answers browser
requests with `403 Access forbidden`.

## Using it

1. **Select the network** (Mainnet Beta / Devnet) in the top-right, and connect your
   wallet.
2. **Token**, pick the payment token to delegate.
3. **Token Account Owner**, leave empty to use your connected wallet. If the tokens are
   held by a Squads vault, enter the **vault address** here (not the multisig address,
   and not your personal wallet).
4. The **Current state** panel loads your associated token account and shows the balance,
   the existing delegate if any, and the amount currently delegated. Check this before
   acting, it tells you whether an approval is already in place.
5. **Delegate Address**, the Midas redemption vault to authorise. Midas provides this
   address; verify it against the documentation you were sent before approving.
6. **Amount**, in whole tokens, not base units. The page converts using the mint's
   decimals.
7. **Approve**, or **Revoke** to clear an existing delegation.

### Your wallet will warn you, this is expected

Phantom and Solflare flag every delegation request, and Phantom often blocks it outright
behind a "confirm anyway" override, with wording like _"you are authorising this website
to withdraw funds from your account in the future"_.

That warning is accurate, and it is not a sign that something is wrong. Delegation does
grant a standing permission to withdraw, that is precisely what a redemption vault needs
in order to pay you out without you having to sign at the moment of each redemption. The
permission is capped at the amount you entered and can be revoked at any time.

Wallets cannot distinguish a legitimate vault delegation from a draining scam, because
the instruction is identical. Running the page on `localhost` makes the warning stricter
still, since the origin is unknown to the wallet's reputation lists. So the check has to
be yours, not the wallet's, before confirming, verify:

- the **delegate address** matches the one Midas sent you, character by character;
- the **amount** is what you intend to authorise;
- the **token** and **owner** are the ones you meant to use.

If any of those is wrong, close the dialog. If they are all correct, proceed through the
override.

### If you sign with Squads

A browser wallet cannot sign on behalf of a Squads vault, so the Approve button will be
disabled once you enter a vault address as the owner. Instead:

1. Fill in the form as above, with the Squads vault address as the owner.
2. Click **Show raw instruction for Squads**.
3. Copy the program ID, the accounts and the instruction data into a custom transaction
   in Squads. **The account order shown is the order the instruction requires**, do not
   reorder them, and keep the signer/writable flags as displayed.
4. Collect the required signatures and execute.

### Verifying afterwards

Open your token account on Solscan, the link is in the Current state panel, and check
the **Delegate** and **Delegated Amount** fields.

## Notes

- Legacy SPL Token and Token-2022 mints are both supported. The owning program is read
  from the mint account rather than assumed, and it determines how the associated token
  account address is derived.
- Amounts that carry more decimal places than the mint allows are rejected rather than
  silently rounded.
- The approval uses `ApproveChecked`, which validates the mint and decimals on-chain, so
  a mismatched amount fails instead of succeeding at the wrong scale.
- `@types/react` is pinned through `overrides` in `package.json`: `react-native`, pulled
  in transitively by the mobile wallet adapter, otherwise brings React 19 types into the
  tree and breaks JSX typing.

## For maintainers

Tokens in the selector come from `src/lib/tokens.ts`, keyed by cluster. Adding one is a
single entry in that file; nothing else needs to change.

```ts
mainnet: [
  { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
],
```

### Background

In the Solana vault program, `approve_redeem_request` transfers payment tokens **from an
account owned by the integrator** (`request_redeemer`) and signs that transfer with the
`redeemer_vault` PDA. That only works if the integrator has delegated to that PDA
beforehand, which is what this tool does.

- **Owner**, the integrator's address (`request_redeemer`), which holds the tokens.
- **Delegate**, the `redeemer_vault` PDA, derived from seeds
  `["redeemer_vault", commonVault]`. In the vault config this is the `account` field,
  not `commonVault`.
