import { splitBidiRuns } from "@/lib/domain/bidi";

/** Question text with Latin notation isolated as LTR, so formulas keep their order in RTL. */
export function MixedText({ text, className }: { text: string; className?: string }) {
  return (
    <bdi className={className}>
      {splitBidiRuns(text).map((run, index) =>
        run.ltr ? (
          <bdi key={index} dir="ltr">
            {run.text}
          </bdi>
        ) : (
          run.text
        ),
      )}
    </bdi>
  );
}
