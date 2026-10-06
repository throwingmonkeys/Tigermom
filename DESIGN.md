---
name: Tigermom
description: Calm, woman-centred support for understanding pregnancy care.
colors:
  plum: "#543047"
  deep: "#3c2936"
  canvas: "#f8f5f7"
  rose: "#f3e5e9"
  peach: "#f7d9cd"
  muted: "#766471"
  line: "#e5dce2"
  white: "#fff"
  focus: "#994976"
  primary-hover: "#6d3e5b"
  navigation-selected: "#6b445e"
  navigation-hover: "#674059"
  user-message: "#f5edf2"
  composer: "#fdfbfd"
  composer-border: "#d6c4d0"
  error-background: "#fff0ec"
  error-border: "#e0bcb3"
  error-text: "#7b3f37"
  success-background: "#edf2e8"
  success-text: "#527043"
typography:
  display:
    fontFamily: "Bree Serif, serif"
    fontSize: "clamp(39px,3.7vw,58px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-.027em"
  headline:
    fontFamily: "Bree Serif, serif"
    fontSize: "27px"
    fontWeight: 400
    lineHeight: 1.35
  conversation-title:
    fontFamily: "Bree Serif, serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.3
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.95
  intro:
    fontFamily: "Manrope, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.85
  button:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    fontWeight: 600
rounded:
  icon: "8px"
  button: "9px"
  starter: "10px"
  message: "11px"
  membership: "12px"
  avatar: "15px"
  surface: "16px"
spacing:
  navigation-gap: "8px"
  starter-gap: "9px"
  primary-gap: "11px"
  desktop-workspace-gap: "65px"
components:
  button-primary:
    backgroundColor: "{colors.plum}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "15px 18px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  conversation-surface:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.surface}"
  user-message:
    backgroundColor: "{colors.user-message}"
    textColor: "{colors.deep}"
    rounded: "{rounded.message}"
    padding: "14px 16px"
---

# Design System: Tigermom

## Overview

**Creative North Star: "A Midwife's Calm"**

The visual direction follows the product's commitment to empathy, plain language, and a woman's agency. Muted plum anchors the interface; pale rose, peach, and a soft canvas make space around a white conversation surface. This is an AI guide and must not imply clinical authority.

This document records the implemented source in `src/styles.css`, `src/App.tsx`, and `src/main.tsx`. The user delegated visual choices. No rendered browser review or formal visual approval has occurred; layout, contrast, font rendering, and interaction appearance still need browser verification. Source extraction does not prove that the screen works at every size.

**Key Characteristics:**

- Warm serif headings with restrained sans-serif controls.
- A clear conversation surface, supported by quiet explanatory copy.
- Tonal layering, rounded controls, and one diffuse surface shadow.
- Phone-first conversation controls with a typing alternative to voice.

## Colors

### Primary

Plum (`plum`) anchors the sidebar, main headings, primary actions, and send control. Its hover variant is `primary-hover`. The focus outline uses the stronger `focus` color.

### Secondary

Rose (`rose`) holds guide and authentication icons. Peach (`peach`) accents the brand mark and sidebar details; it is not the default action color.

### Neutral

The page uses `canvas`, conversations use `white`, primary text uses `deep`, explanatory text uses `muted`, and separators use `line`. User messages use a pale plum tint; errors and the completion check have distinct contextual colors. Additional local decorative tints remain in the stylesheet and are not a separate semantic palette.

## Typography

**Display Font:** Bree Serif, with serif fallback. **Body Font:** Manrope, with sans-serif fallback. Both are self-hosted through `@fontsource` imports in `src/main.tsx`; Bree Serif loads weight 400 and Manrope loads 400, 500, 600, and 700.

Welcome and conversation headings explicitly use Bree Serif 400, matching the self-hosted font. Rendered font appearance remains unverified.

The main welcome heading uses the display role, with responsive overrides of 62px above 1550px, 43px at 1200px, 37px at 1000px, 42px at 860px, and 37px at 700px. Start, authentication, and feedback titles use the headline role. Conversation body text is 12px at desktop and 14px at 700px and below. Buttons grow from 12px to 13px on phones. Small annotations and source labels are commonly 10–11px and need a readability check in the browser.

## Layout

The desktop sidebar is fixed and 254px wide. The main area starts after it, with an 88px top bar. The workspace is capped at 1360px, uses `minmax(270px,.92fr) minmax(420px,1.08fr)` columns, a 65px gap, and `67px 60px 45px` padding. The welcome column sits beside the conversation column.

At 1200px and 1000px the sidebar, columns, gaps, and padding tighten. At 860px the sidebar becomes a 250px slide-in drawer with a backdrop; the top bar exposes the mobile brand. At 700px the workspace becomes a single column with `30px 18px 24px` padding. Active conversations hide the welcome column on phones and use `calc(100dvh - 126px)` height with a 550px minimum. Message content scrolls inside the conversation; those height rules require checking on short phone screens.

## Elevation & Depth

Most separation comes from tonal surfaces and thin borders. The conversation surface alone uses `0 12px 42px #5430470c`, a diffuse plum shadow. The mobile navigation backdrop uses `#35212c66`. There is no implemented hover lift.

## Shapes

Controls use 8–11px corners; the conversation surface uses 16px corners. The guide avatar is 44px square with 15px corners. Brand and greeting marks use a softly arched silhouette, with asymmetric radii and a slight rotation for the brand mark. Do not replace these source shapes with unrelated decorative images.

## Components

### Buttons

The full-width primary action uses plum, white text, 9px corners, `15px 18px` padding, a 48px minimum height, and a `.15s` background transition. Hover darkens to `primary-hover`. Global keyboard focus uses a 3px `focus` outline with 4px offset. Disabled buttons retain their layout at 50% opacity and show a disabled cursor.

### Cards / Containers

The white conversation surface has 16px corners and clips overflow. Its header uses `24px 27px` padding, a thin divider, and a rose avatar. Start content uses `35px 30px 20px` padding at the base size. Starter prompts use white, a `#e9dfe5` border, 10px corners, and `14px 12px` padding; hover uses `#fbf6f9` and `#c5a8ba`.

### Inputs / Fields

The Start button opens a guest conversation directly; no phone or code fields appear in v1. The composer uses `composer`, `composer-border`, and 11px corners. Its textarea ranges from 66px minimum to 150px maximum height and supports resizing. Attachment, microphone, and send controls remain below it. Voice consent appears before browser speech input. Reports appear as removable text chips.

### Navigation

Navigation uses icon-and-label rows, 9px corners, `13px 12px` padding, and a selected plum tint. At 860px it moves into the drawer. Information pages share the shell and constrain their content to 780px.

### Conversation and Feedback

User messages have tinted backgrounds, 11px corners, `14px 16px` padding, and a 28px left inset. Assistant responses are flat and include source links and a read-aloud action. The written sample explicitly identifies itself as a sample. Completion uses a green-tinted check, followed by private feedback choices and a membership-coming-soon message. Error banners include a dismiss control and, when relevant, a restart action.

## Do's and Don'ts

- **Do** preserve the woman's agency with plain, calm copy and clearly attributed sources.
- **Do** keep plum actions and rose/peach support accents in their established roles.
- **Do** retain visible keyboard focus, disabled states, and reduced-motion support.
- **Do** verify the mobile drawer, conversation scrolling, short-height phones, and small text in a real browser before claiming visual completion.
- **Don't** imply Tigermom is a clinician or that a written sample is a live AI answer.
- **Don't** invent testimonials, clinical validation, or paid features that are available now.
- **Don't** record visual approval or browser-tested accessibility without evidence.
