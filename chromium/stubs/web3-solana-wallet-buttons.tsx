/**
 * Build-time replacement for `@clerk/ui`'s lazy Solana wallet screen
 * (~400 kB of @solana/* code). The extension never renders Clerk's
 * <SignIn/>, <SignUp/> or <UserProfile/>, which are the only importers, so
 * the real module can never be reached. Aliased in wxt.config.ts;
 * utils/clerk-ui-stub.test.ts checks the export name still matches Clerk.
 */
export function Web3SolanaWalletButtons(): null {
  return null;
}
