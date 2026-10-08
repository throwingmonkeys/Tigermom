# First build status

The interface and Convex foundation are implemented. The app runs at http://127.0.0.1:5173. AI is enabled through an OpenAI call in `convex/conversation.ts`; browser and real audio checks remain pending.

## Verified

- Development Convex backend compiles and pushes.
- Frontend compiles and builds.
- Twenty-two automated checks pass, including the fixed ten-minute limit, late replies, server-expiry cleanup, paused AI, simulated speech, cancelled startup, shared hourly quota, rolling-hour boundary, provider failure, source-link filtering, synthetic voice selection, and personal-result redirection without a provider call.
- Real cloud rejects unsigned session creation and report upload; auth signing-key endpoint works.
- No conversation-history table or browser persistence was added. Free-session report cleanup is tested.
- Guest sign-in, synthetic report upload, unauthorized-access rejection, cleanup, and sign-out work against the real cloud. No phone number or code is collected; no SMS service is needed.
- Updated v1 flow: ten-minute countdown, automatic end and deletion, private feedback followed by curated reference sources. Plans and membership UI are reserved for v2.
- A real dev general question received a short answer with an ACOG source and no report requirement. Each provider call is reserved in Convex before generation; the rate limiter and rolling-hour guard allow at most 100 calls per hour across a deployment. Search uses a 250-token output limit and final composition 160 tokens, with no automatic retries. Both calls count toward the shared limit. Caps and failures return the exact busy message.
- GPT-5.4 mini performs domain-filtered source search, followed by brief composition without another search. GPT-4.1 mini rejected source filters in the real API. Instructions allow general educational questions and optional report-wording explanations, while prohibiting personal result interpretation and medical advice. A server guard redirects recognized personal-result questions to the doctor without calling AI. The real dev personal-result test passed; this guard and prompt do not establish compliance for every possible phrasing.
- Replies target 40–60 words and three sentences with a calm, direct, empowering tone. Speech prefers a standard local synthetic voice, lower pitch (0.7), and normal speed; actual voice availability and sound depend on the device and remain unheard here.
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
