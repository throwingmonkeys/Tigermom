import { convexAuth } from "@convex-dev/auth/server";
import { Phone } from "@convex-dev/auth/providers/Phone";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Phone({
      maxAge: 60 * 5,
      normalizeIdentifier(phone) {
        if (!/^\+91[6-9]\d{9}$/.test(phone))
          throw new Error("Enter a valid Indian mobile number.");
        return phone;
      },
      async generateVerificationToken() {
        const values = new Uint32Array(1);
        // Rejection sampling avoids bias when reducing to six decimal digits.
        do {
          crypto.getRandomValues(values);
        } while (values[0] >= 4_294_000_000);
        return String(values[0] % 1_000_000).padStart(6, "0");
      },
      async sendVerificationRequest({ identifier, token }) {
        // A delivery adapter is configured only after the owner approves a sender.
        // Never log OTPs or offer a fake verification bypass.
        const endpoint = process.env.SMS_DELIVERY_URL;
        const secret = process.env.SMS_DELIVERY_SECRET;
        if (!endpoint || !secret)
          throw new Error("Phone delivery is not configured");
        const url = new URL(endpoint);
        if (url.protocol !== "https:")
          throw new Error("SMS delivery requires HTTPS");
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({
            phone: identifier,
            code: token,
            expiresInSeconds: 300,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok)
          throw new Error("The verification code could not be delivered");
      },
    }),
  ],
  session: {
    totalDurationMs: 60 * 60 * 1000,
    inactiveDurationMs: 30 * 60 * 1000,
  },
});
