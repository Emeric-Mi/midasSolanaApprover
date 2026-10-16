# Midas Token Delegation

A single-page tool for authorising a Midas redemption vault to draw payment tokens from
your own token account on Solana.

Delegation sets a **ceiling, not a transfer**. Approving does not move any tokens: it
records a maximum that the delegate is allowed to pull, and only an executed redemption
actually transfers anything. You can revoke at any time, and revoking is immediate.

No block explorer can do this, Solscan, Solana Explorer and SolanaFM are read-only, and
neither Phantom nor Solflare exposes `approve` in their interface. Hence this page.

## Running it

Requires [Node.js](https://nodejs.org) 20.19 or newer, or 22.12 or newer
(`node --version` to check).

```bash
git clone https://github.com/Emeric-Mi/midasSolanaApprover.git
cd midasSolanaApprover
corepack enable
yarn install
yarn dev
```

Open the URL it prints, usually <http://localhost:5173>.

There is nothing to install globally. `corepack enable` is a one-off, and the pinned Yarn
version in `.yarn/releases/` is picked up automatically.

`yarn build` writes a static bundle to `dist/` if you would rather serve it yourself.

### Using your own RPC

The default public endpoint works out of the box but is rate-limited. To use your own,
create a `.env.local` file in the project root:

```
VITE_MAINNET_RPC=https://your-endpoint
VITE_DEVNET_RPC=https://your-devnet-endpoint
```

`https://api.mainnet-beta.solana.com` will not work here: it answers browser requests
with `403 Access forbidden`.

### Enabling WalletConnect

WalletConnect is how custody platforms connect to a dApp when they have no browser
extension. It needs a free project id from <https://cloud.reown.com>, set in the same
`.env.local`:

```
VITE_WALLETCONNECT_PROJECT_ID=your-project-id
```

Without it the WalletConnect option is simply hidden, and browser wallets still work.

## Supported wallets

| Wallet                                           | How it connects                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Phantom, Solflare                                | Listed explicitly.                                                                   |
| Fordefi, Backpack, any Wallet Standard extension | Detected automatically if the extension is installed. Nothing to configure.          |
| Fireblocks and other custody platforms           | WalletConnect, if a project id is set. Otherwise use the raw instruction, see below. |

## Reading the code

The app is entirely client-side. There is no backend, no analytics and no storage:
the only network calls are to the Solana RPC endpoint and to your wallet extension.

Everything that builds a transaction lives in one file, **`src/lib/spl.ts`** (about 200
lines). The functions worth reading, in the order they run:

| Function              | What it does                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `resolveTokenProgram` | Reads the mint account to find its owning program, legacy SPL or Token-2022. Never assumed, because it decides the ATA derivation. |
| `deriveAta`           | Derives the associated token account. `allowOwnerOffCurve` is on so a custody or multisig PDA works.                               |
| `loadAta`             | Reads the current balance, delegate and delegated amount.                                                                          |
| `toBaseUnits`         | Converts the amount you type using the mint's decimals, and rejects excess precision rather than rounding it away.                 |
| `buildApproveIx`      | Builds the `ApproveChecked` instruction.                                                                                           |
| `buildRevokeIx`       | Builds the `Revoke` instruction.                                                                                                   |
| `sendIx`              | Wraps one instruction in a transaction, hands it to your wallet to sign, and waits for confirmation.                               |

The approval uses `ApproveChecked` rather than `Approve`: it carries the mint and the
decimals, so the on-chain program rejects a mismatched amount instead of accepting it at
the wrong scale.

`src/App.tsx` is user interface only, and `src/components/` holds presentational pieces.
Neither builds instructions. The token list in `src/lib/tokens.ts` is plain data.

Nothing is minified or bundled in the repository; what you read is what runs.

## Using it

1. **Select the network** (Mainnet Beta / Devnet) in the top-right, and connect your
   wallet.
2. **Token**, pick the payment token to delegate.
3. **Token Account Owner**, leave empty to use your connected wallet. If the tokens are
   held by a custody platform or a multisig, enter that **vault address** here, not your
   personal wallet.
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

### If your platform builds transactions itself

Fireblocks, Squads and similar platforms hold tokens at an address that a browser wallet
cannot sign for. If you enter such an address as the owner, the Approve button is
disabled on purpose. Use the raw instruction instead:

1. Fill in the form as above, with the custody or vault address as the owner.
2. Click **Show raw instruction**.
3. Copy the program ID, the accounts and the instruction data into a transaction in your
   platform. **The account order shown is the order the instruction requires**, do not
   reorder them, and keep the signer and writable flags as displayed.
4. Collect the required approvals and execute.

Note that some custody platforms restrict which programs or instruction types they will
sign. An SPL `ApproveChecked` is not a plain transfer, so it may need to be permitted in
your transaction policy first.

### Checking it worked

Open your token account on Solscan, the link is in the Current state panel, and check the
**Delegate** and **Delegated Amount** fields.

## Background

In the Solana vault program, `approve_redeem_request` transfers payment tokens **from an
account owned by the integrator** (`request_redeemer`) and signs that transfer with the
`redeemer_vault` PDA. That only works if the integrator has delegated to that PDA
beforehand, which is what this tool does.

- **Owner**, the integrator's address (`request_redeemer`), which holds the tokens.
- **Delegate**, the `redeemer_vault` PDA, derived from seeds
  `["redeemer_vault", commonVault]`. In the vault config this is the `account` field,
  not `commonVault`.
