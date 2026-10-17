# DESIGN.md

Current v1 scope (approved October 17, 2026): typed and spoken questions only. Report uploads, attached-report displays and report reading are outside v1 and parked for a later version. This supersedes older report/upload descriptions below. The welcome and privacy pages describe questions and conversation only. Medical safety, evidence, sources, ratings and session privacy remain in force.

Read this before building or changing any screen. If a choice isn't covered here, ask me instead of guessing.

## 1. The feeling, in labels
[Three to five labels, each an element and what it does. Not "clean" or "minimal".]
[Empowering. The name and the logo for Tigermom are both confidence inspiring. The one tap accessibility of 'Talk to Tigermom' gives women the power of knowledge.]

## 2. References, one per component
[logo]: ["C:\Users\sonja\Tigermom\public\tigermom-logo.png"]
Take: [this image as the logo which will be the only prominent visual on the Home screen.]

## 3. Keep the current font and colours. Don't change them.


## 4. Screens
[Homescreen]: for [Landing]. Top to bottom: [Welcome message. Below that: Talk to Tigermom button. Next to that: Stop conversation button. Below that: Text box which transcribes voice to text. Next to that: Upload button to upload doctor report. Below that: A list of 3 sample questions that can be tapped to ask Tigermom a question. Below that: Testimonials message. Below that: Three small square panels with user testimonials]. Main action: [Talk to Tigermom/Stop conversation] → [Below welcome message]
Empty: [What do you have in mind?] · Loading: [That's a good question. Let me think about that.] · Upload Error: [Error uploading your report. Please upload jpeg or pdf only] · Done: [Survey question]

[Sources]: for [identifying and linking to curated resources]. Top to bottom: [Curation message. Below that: List of sources, linked to their websites]



## 5. The homescreen's words
Headline: [Making the right choices for your baby begins by getting evidence backed answers to all your questions]
Under it: [Ask Tigermom a question. No sign-up needed. ]
Talk to Tigermom button: [User can ask Tigermom a question]
Stop conversation button: [User can stop session]
Under it: First sample question button: [How long does childbirth take?]
Under it: Second sample question button: [Why is skin to skin with the newborn baby important?]
Under it: Third sample question button: [Can you help me understand my report?]
Under it: [Testimonials]. NOT IN v1
Under it: Testimonial 1: [Tigermom, 6m pregnant. "It feels good to get an answer without taking an appointment"]. not in V1.
Next to it: Testimonial 2: [Tigermom, 3m pregnant. "I now know what to ask my doctor"]. NOT IN V1.
Next to it: Testimonial 3: [Tigermom, 9m pregnant. "Tigermom beats having to read up 10 websites to answer a question"]. NOT IN V1.


The Sources screen's words
Headline: [Tigermom curates its responses from the following resources. This list while not exhaustive, is a robust source of evidence when it comes to pregnancy and childbirth related questions.

## 6. Principles
- [Wait for user to finish asking her question. Tone of voice to be used: Female, empowering, natural, balanced. Remember Tigermom is not just an extension of the doctor. Tigermom shares evidence that supports natural birth, and always tells her that her doctor makes the medical call. If the user asks for Tigermom to tell her what to do, or to diagnose a medical issue based on upload, Tigermom must clarify that 'This is something that you should discuss with your care provider. I can help by suggesting some questions you can ask your care provider so that you can take a medically appropriate decision.]
- If she says she has been diagnosed with chronic hypertension, pre-existing diabetes, heart or kidney disease, a clotting disorder or placenta previa, Tigermom stops promoting natural birth, keeps explaining her report, provides her a balanced perspective, gives her questions for her doctor and points her back to her doctor.
- For gestational diabetes, twins or age 35+, Tigermom provides a balanced perspective but urges the user to “please consult your provider to discuss what’s best for you”, helps formulate questions for the doctor but decides and recommends nothing.
- The AI never judges medical risk from an uploaded report.
- Tigermom never tells anyone they are low-risk or a good candidate.
## 7. Approved conversation simplification

Use one conversation area and one question box from the first question onward. Typing and Enter or the send arrow quietly start the private session when needed. Keep one microphone button inside the question box: tap to start a flowing voice conversation, tap again to stop listening. Remove duplicate Talk to Tigermom buttons. Keep Upload beside the question box and End conversation separate from stopping the microphone.

Show fixed urgent guidance as the reply directly beneath its triggering question, or beside an uploaded report. Do not show a permanent warning banner. Keep the server urgent check available without AI or an active session.

After optional feedback, return home. Never force a Sources visit. Keep source links beneath answers and Our sources in navigation. These instructions replace conflicting screen and button descriptions above. Keep the current fonts and colours.

## Per-response feedback

Show Like and Dislike with thumb icons beneath every Tigermom reply, including fixed guidance. Each is one tap, with no follow-up rating questions. Show the selected rating and save acknowledgement; permit changing the rating. Keep the current fonts and colours and accessible phone-sized touch targets. Feedback must not remove an urgent reply or ask another clinical question.

Make both feedback buttons prominent: at least 48px tall, larger thumb icons, bold labels, existing rose backgrounds and plum borders. Use the existing plum fill and white text for the selected rating. The Sources page must show every approved entry and its usage description, rather than a short sample list.
