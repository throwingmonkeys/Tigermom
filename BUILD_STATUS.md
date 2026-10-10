# First build status

The interface and Convex foundation are implemented. The app runs at http://127.0.0.1:5173. AI is enabled through an OpenAI call in `convex/conversation.ts`; browser and real audio checks remain pending.

## Verified

- Development Convex backend compiles and pushes.
- Frontend compiles and builds.
- Thirty-three automated checks pass, including session cleanup, AI quotas, source filtering, personal-result redirection, and hands-free voice timing, restarts, interruption, queued follow-ups, permission errors, and cleanup.
- Real cloud rejects unsigned session creation and report upload; auth signing-key endpoint works.
- No conversation-history table or browser persistence was added. Free-session report cleanup is tested.
- Guest sign-in, synthetic report upload, unauthorized-access rejection, cleanup, and sign-out work against the real cloud. No phone number or code is collected; no SMS service is needed.
- Updated v1 flow: ten-minute countdown, automatic end and deletion, private feedback followed by curated reference sources. Plans and membership UI are reserved for v2.
- A real dev general question received a short answer with an ACOG source and no report requirement. Each provider call is reserved in Convex before generation; the rate limiter and rolling-hour guard allow at most 100 calls per hour across a deployment. Search uses a 250-token output limit and final composition 160 tokens, with no automatic retries. Both calls count toward the shared limit. Caps and failures return the exact busy message.
- GPT-5.4 mini performs domain-filtered source search, followed by brief composition without another search. GPT-4.1 mini rejected source filters in the real API. Instructions allow general educational questions and optional report-wording explanations, while prohibiting personal result interpretation and medical advice. A server guard redirects recognized personal-result questions to the doctor without calling AI. The real dev personal-result test passed; this guard and prompt do not establish compliance for every possible phrasing.
- Replies target 40–60 words and three sentences with a calm, direct, empowering tone. Following the updated DESIGN.md, speech prefers a natural local female voice, balanced pitch (1), and normal speed; actual voice availability and sound depend on the device and remain unheard here.
- The hosted production homepage loaded, anonymous sign-in and a new session worked, and a real AI reply arrived. The synthetic test session was ended and signed out. These are network checks; no browser was connected for visual or audio verification.
- After consent, voice mode stays on between turns, keeps partial sentences across recognition restarts, and sends after four seconds of quiet. New recognized words stop spoken replies; matching reply fragments are ignored to reduce speaker echo. Follow-ups spoken while an answer is pending are kept and sent when it finishes; that older answer is not spoken over the new question. Stopping voice or ending/closing a session cancels recognition and pending voice timers. Spoken replies can be switched off separately. These paths are checked with simulated speech, not a real microphone or speaker; device echo and browser recognition delays still need a live audio check.
- Three testimonial tiles use the quotes and anonymous labels supplied in the updated DESIGN.md. Button labels follow PRODUCT.md, including the sample conversation start action.

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

## October 8 design update

Applied the supplied DESIGN.md: tiger logo, exact welcome text, top-to-bottom landing layout, paired Talk/Stop controls, question box beside report upload, requested loading/empty/upload-error wording, and natural female speech preference. JPEG/PDF report uploads only in the interface; backend data and AI limits unchanged. Survey and source flow retained. Production build and all 31 checks pass. No connected browser was available for visual or real-audio verification.

## October 9 reply perspective update

Removed the 40-60-word and three-sentence constraints. Answers now include a direct answer, relevant evidence-backed context or perspective, evidence limits when useful, and one doctor question where appropriate. Search and final composition each stay capped at 500 output tokens; both still reserve the shared 100-call hourly budget. Retrieval asks for current guidance and source/date attribution. A real dev induction question returned 173 words with WHO, ACOG and research links after strengthening instructions against mixing older guidance with newer claims. This sample is proof of the tested reply, not a guarantee of every answer.

## October 9 design copy update

Applied revised welcome copy, all three named sample questions, supplied anonymous testimonials in square panels, and the Sources curation message before linked resources. Existing voice/session/survey behavior retained. Build and 31 automated checks pass; no browser connected for visual verification.

## October 9 remove extra page copy

Removed unrequested slogans, duplicate welcome text, promotional/footer copy, source descriptions and disclaimers, written demo, and extra privacy page. Retained DESIGN.md wording, navigation/control labels, survey, concise voice consent/status, session timer and recovery messages. AI reply depth and safety boundaries unchanged.

## October 9 compact home panels

Removed the landing conversation panel minimum height and sample-list bottom margin. Testimonial panels now fit their content with compact quote/label spacing instead of forced square heights. No text or behavior changes.

## October 10 design update

Removed testimonials from v1 as requested in DESIGN.md; retained current typography and colours. Personal-result interpretation, explicit diagnosis and tell-me-what-to-do requests return the specified care-provider wording in Convex without a provider call. Model instructions use the same wording for other personal-advice requests. All 33 checks pass; a real dev diagnosis request returned the exact response. General sourced-question behavior retained.
