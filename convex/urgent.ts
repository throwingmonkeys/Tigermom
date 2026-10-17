export const urgentMessage = "If you have bleeding, severe pain, reduced baby movement or fluid leaking: This needs medical attention right away. Contact your doctor or hospital now. If you cannot reach them, please seek urgent medical help. Do not wait until your next appointment.";
export const urgentShortMessage = "Contact your doctor or hospital now for urgent symptoms. Do not wait until your next appointment.";
export const urgentPhrases = [
  "bleeding", "bleed", "spotting", "vaginal blood", "blood from my vagina",
  "severe pain", "intense pain", "unbearable pain", "extreme pain", "bad pain",
  "severe abdominal pain", "severe stomach pain", "severe belly pain",
  "pain that won't stop", "pain won't stop", "pain doesn't stop", "pain that does not stop", "constant pain", "persistent pain",
  "reduced baby movement", "reduced fetal movement", "reduced foetal movement", "decreased movement", "less baby movement",
  "baby moving less", "baby is moving less", "fewer kicks", "baby not kicking", "baby isn't kicking", "baby is not kicking",
  "baby stopped kicking", "baby not moving", "baby isn't moving", "baby is not moving", "baby stopped moving",
  "no baby movement", "no fetal movement", "no foetal movement", "can't feel the baby move", "cannot feel the baby move",
  "fluid leaking", "leaking fluid", "leaking amniotic fluid", "waters broke", "water broke", "waters have broken", "water has broken",
  "my waters broke", "my water broke", "leaking water", "trickle of fluid", "gush of fluid",
] as const;

const phrasePattern = "\\b(?:" + [...urgentPhrases].sort((a, b) => b.length - a.length)
  .map(phrase => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b";

export function mentionsUrgentSign(text: string): boolean {
  let normalized = text.normalize("NFKC").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[ \t\r]+/g, " ");
  // OCR line wraps must not detach "no" or "if you have" from a symptom.
  // Keep other line breaks: "No bleeding\nSevere pain" has a positive sign.
  for (let pass = 0; pass < 4; pass++) normalized = normalized
    .replace(/\b(no|not|without|denies|denied|any|or|and|of|if|you|have|experience|experiencing|severe|intense|persistent|reduced|decreased|baby|fetal|foetal|is|fluid|warning|danger)\s*\n\s*/g, "$1 ")
    .replace(/([,:])\s*\n\s*/g, "$1 ")
    .replace(/\n\s*(if|that)\b/g, " $1");
  const sentences = normalized.split(/[.!?;\n]+/);
  for (const [index, sentence] of sentences.entries()) {
    const selfReport = /\b(?:i (?:am|have|feel|notice|noticed)|patient (?:has|reports|is experiencing))\b/.test(sentence);
    // These are instructions about what to do IF symptoms occur, not a claim
    // that they are present. A direct symptom report elsewhere still wins.
    const conditionalAdvice = /\b(?:if (?:these|they) (?:occur|develop|happen)|if you (?:have|experience|develop)|should you (?:have|experience)|in case of)\b/.test(`${sentence} ${sentences[index + 1] ?? ""}`);
    if (!selfReport && /^\s*(?:return precautions|safety advice)\s*:/.test(sentence)) continue;
    if (!selfReport && conditionalAdvice && /^\s*(?:warning signs|danger signs)\s*:/.test(sentence)) continue;
    if (!selfReport && /^\s*if\s+(?:you|the patient|a patient|there)\b/.test(sentence) &&
        /\b(?:contact|seek|call|attend|return|go to|tell|report)\b/.test(sentence)) continue;
    for (const match of sentence.matchAll(new RegExp(phrasePattern, "g"))) {
      const before = sentence.slice(0, match.index);
      const after = sentence.slice(match.index! + match[0].length);
      const prefix = before.split(/[,;]|\b(?:but|however|yet|now)\b/).at(-1) ?? "";
      if (/\b(?:seek|contact|call|attend|return|go to|report|tell)\b[^.!?;\n]*\b(?:if|in case|should you)\b/.test(prefix)) continue;
      if (/^\s*(?:cannot|can't|not|cannot be|can't be)\s+(?:be\s+)?ruled out\b/.test(after)) return true;
      // "Not bleeding heavily" does not deny bleeding itself.
      if (/\bnot\s*$/.test(prefix) && /^\s*(?:much|heavily|a lot|very much|as much)\b/.test(after)) return true;
      const negativePrefix = prefix.replace(new RegExp(phrasePattern, "g"), " ")
        .replace(/\b(?:and|or|nor|any|active|current|ongoing|vaginal|pv|currently|signs of|evidence of|episodes of|history of)\b/g, " ").trim();
      const denied = /\b(?:no|not|without|denies|denied|denying|negative for|not experiencing|not having|not reporting|don't have|do not have|does not have|did not have|haven't had|hasn't had)\s*$/.test(negativePrefix);
      const absent = /^\s*(?::|[-\u2013\u2014])?\s*(?:(?:is|was)\s+)?(?:absent|denied|nil|none|no|not present|not reported|negative)\b/.test(after);
      if (!denied && !absent) return true;
    }
  }
  return false;
}
