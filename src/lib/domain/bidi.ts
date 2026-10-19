/**
 * Splits mixed Arabic text into runs so Latin notation (formulas, electron
 * configurations, ions) can be isolated as LTR inside an RTL paragraph.
 * Without isolation, "[Ar] 3d³" or "X⁴⁺ : [Ar] 3d¹" render reordered in RTL.
 */
export type BidiRun = { text: string; ltr: boolean };

// Arabic, Arabic Supplement, and Arabic Presentation Forms A and B.
const ARABIC_CLASS = [[0x0600, 0x06ff], [0x0750, 0x077f], [0xfb50, 0xfdff], [0xfe70, 0xfeff]]
  .map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`)
  .join("");
const ARABIC = new RegExp(`[${ARABIC_CLASS}]`);
const SEGMENTS = new RegExp(`[${ARABIC_CLASS}]+|[^${ARABIC_CLASS}]+`, "g");
// Latin letters, digits, and superscript or subscript digits and signs.
const LATIN_OR_DIGIT = /[A-Za-z0-9²³¹⁰-₟]/;
// Separators that belong to the surrounding Arabic sentence, not to the formula.
const EDGE = /^[\s.,:;!?]+|[\s.,:;!?]+$/g;

export function splitBidiRuns(text: string): BidiRun[] {
  if (!ARABIC.test(text)) return [{ text, ltr: false }];

  const runs: BidiRun[] = [];
  const push = (value: string, ltr: boolean) => {
    if (!value) return;
    const last = runs[runs.length - 1];
    if (last && !last.ltr && !ltr) last.text += value;
    else runs.push({ text: value, ltr });
  };

  // Segments alternate between Arabic and non-Arabic text.
  for (const segment of text.match(SEGMENTS) ?? []) {
    if (ARABIC.test(segment) || !LATIN_OR_DIGIT.test(segment)) {
      push(segment, false);
      continue;
    }
    const core = segment.replace(EDGE, "");
    const start = segment.indexOf(core);
    push(segment.slice(0, start), false);
    push(core, true);
    push(segment.slice(start + core.length), false);
  }
  return runs;
}
