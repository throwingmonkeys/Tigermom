# First build status

The interface and Convex foundation are implemented. The app runs at http://127.0.0.1:5173. AI is enabled through an OpenAI call in `convex/conversation.ts`; browser and real audio checks remain pending.

## Verified

- Development Convex backend compiles and pushes.
- Frontend compiles and builds.
- Nineteen automated checks pass, including the fixed ten-minute limit, late replies, server-expiry cleanup, paused AI, simulated speech, cancelled startup, shared hourly quota, rolling-hour boundary, and provider failure.
- Real cloud rejects unsigned session creation and report upload; auth signing-key endpoint works.
- No conversation-history table or browser persistence was added. Free-session report cleanup is tested.
- Guest sign-in, synthetic report upload, unauthorized-access rejection, cleanup, and sign-out work against the real cloud. No phone number or code is collected; no SMS service is needed.
- Updated v1 flow: ten-minute countdown, automatic end and deletion, private feedback followed by curated reference sources. Plans and membership UI are reserved for v2.
- A real dev question received a complete OpenAI reply. Each call is reserved in Convex before generation; the rate limiter and rolling-hour guard allow at most 100 calls per hour across a deployment. Replies have a 500-token output limit and no automatic retries. Caps and failures return the exact busy message.
- AI instructions limit replies to explaining the doctor's wording and preparing questions; result interpretation and medical advice are prohibited. Live web search is disabled to keep this scope.
- The hosted production homepage loaded, anonymous sign-in and a new session worked, and a real AI reply arrived. The synthetic test session was ended and signed out. These are network checks; no browser was connected for visual or audio verification.
- Spoken input sends after consent; spoken replies can be switched off. These paths are checked with simulated speech, not a real microphone or speaker.
- Three testimonial tiles are visibly marked as placeholders until real, permissioned feedback is available. Button labels follow PRODUCT.md, including the sample conversation start action.

## Remaining

1. AI processing is authorized by the October 8 request. The production OpenAI key was already present; the missing development key was copied privately within Tigermom without printing it.
2. Check the code-free guest flow in a connected browser. Automated screen checks and the cloud guest round trip pass.
3. Verify real uploaded PDFs/images and adversarial questions with founder review. OpenAI response storage is disabled and the agent saves no messages.
4. Human checks for scope, unreadable reports, and tone, alongside founder testing; model instructions do not prove every possible response will comply.
5. Connect a browser and capture desktop/mobile screenshots. Review returned `recapture`; no visual approval.
6. Test voice on a real phone, including unavailable microphone/local voice and keyboard fallback.
7. Production was published through `npm run deploy` at https://rugged-chameleon-775.convex.site. Missing production guest-auth signing keys were configured without rotating existing keys.

## Open product details

Operating languages beyond the current English interface are undecided. Feedback currently stays on the page; aggregate measurement needs a product decision. Paid history is a future feature; no payment or history retention is implemented.
