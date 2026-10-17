import { describe, it, expect } from "vitest";
import { mentionsUrgentSign, urgentPhrases } from "../convex/urgent";

describe("Urgent wording in context", () => {
  it.each([
    "No bleeding. No severe pain.", "Denies vaginal bleeding or severe abdominal pain.",
    "No\nbleeding. No\nsevere pain.", "Seek help if you have\nbleeding.",
    "No bleeding or\nfluid leaking.", "Warning signs:\nbleeding, severe pain or fluid leaking. Seek medical help if these occur.",
    "If you experience severe pain,\ncontact your hospital.",
    "I'm not bleeding. No evidence of active bleeding.",
    "Bleeding: absent. Severe pain: no.", "Without spotting or fluid leaking.",
    "Seek help if you have bleeding.", "If you experience severe pain, contact your hospital.",
    "Warning signs: bleeding, severe pain or fluid leaking. Seek medical help if these occur.",
  ])("does not turn absent symptoms or general instructions into an alert: %s", text => {
    expect(mentionsUrgentSign(text)).toBe(false);
  });
  it.each([
    "I have no idea why I am bleeding", "I'm not sure whether this is fluid leaking",
    "No bleeding yesterday, but I am bleeding now", "No bleeding. Severe pain now.",
    "No bleeding\nSevere pain now.", "Baby is\nnot moving", "Fluid\nleaking",
    "Warning signs: bleeding. Seek medical help now.",
    "I have bleeding and the leaflet says seek help if bleeding occurs",
    "Bleeding has not stopped", "No pain, but my baby is not moving", "I can't rule out bleeding",
    "I'm not bleeding heavily", "No bleeding or severe pain cannot be ruled out",
  ])("keeps actual or uncertain symptoms urgent: %s", text => {
    expect(mentionsUrgentSign(text)).toBe(true);
  });
  it.each(urgentPhrases)("preserves the existing urgent sign: %s", phrase => {
    expect(mentionsUrgentSign(phrase)).toBe(true);
  });
});
