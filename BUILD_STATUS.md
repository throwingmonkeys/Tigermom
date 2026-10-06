# First build status

The interface and Convex foundation are implemented. The app runs at http://127.0.0.1:5173. This is an integration-incomplete first build, not a fully verified release.

## Verified

- Development Convex backend compiles and pushes.
- Frontend compiles and builds.
- Eight automated checks pass.
- Real cloud rejects unsigned session creation and report upload; auth signing-key endpoint works.
- No conversation-history table or browser persistence was added. Free-session report cleanup is tested.
- Guest sign-in, synthetic report upload, unauthorized-access rejection, cleanup, and sign-out work against the real cloud. No phone number or code is collected; no SMS service is needed.

## Remaining

1. Owner decision about AI processing and account costs remains pending; do not infer consent. SMS and Twilio are no longer needed for v1.
2. Check the code-free guest flow in a connected browser. Automated screen checks and the cloud guest round trip pass.
3. Confirm Convex AI Gateway eligibility, supported web-search model, report input, and provider privacy settings; enable only after approval and test actual responses.
4. Human/source checks for medical claims, Indian context, urgent concerns, missing evidence, unreadable reports, and tone, alongside founder testing.
5. Connect a browser and capture desktop/mobile screenshots. Review returned `recapture`; no visual approval.
6. Test voice on a real phone, including unavailable microphone/local voice and keyboard fallback.
7. Hosted development smoke check, then production configuration and `npm run deploy` when requested.

## Open product details

Operating languages beyond the current English interface are undecided. Feedback currently stays on the page; aggregate measurement needs a product decision. Paid history is a future feature; no payment or history retention is implemented.
