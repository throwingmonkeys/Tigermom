import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";

// Guest sign-in happens behind the Start button; no phone number or OTP is
// collected. Convex still enforces ownership of temporary sessions and reports.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous],
  session: {
    totalDurationMs: 60 * 60 * 1000,
    inactiveDurationMs: 30 * 60 * 1000,
  },
});
