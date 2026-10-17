// Remove provider-only citation syntax before it can reach the interface.
export function stripProviderCitations(text: string) {
  return text
    .replace(/(?:\u3010|\uE200)[^\u3010\uE200]*(?:\u3011|\uE201|\uE202)/g, "")
    .replace(/(?:\u3010|\uE200)(?:cite|citation)(?:\u3011|\uE201)?/gi, "")
    .replace(/(?:turn\d+(?:search|view|fetch)\d+|cite)[^\S\n]*(?:[\u3011\uE201\uE202]|[\u2020\u2021])/g, "")
    .replace(/turn\d+(?:search|view|fetch)\d+/g, "")
    .replace(/[\u3010\u3011\uE200\uE201\uE202]/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
}

export function formatAnswerCitations(text: string, sourceCount: number) {
  return stripProviderCitations(text).replace(/\[(\d+)\]/g, (marker, number: string) =>
    Number(number) >= 1 && Number(number) <= sourceCount ? marker : "",
  );
}
