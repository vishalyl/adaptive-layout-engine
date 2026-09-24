// Text measurement, injected rather than imported, so the engine can stay
// DOM-free. `resolve()` takes a `TextMeasurer` as a
// parameter with `estimateMeasurer` as the default — that keeps `resolve`
// a pure function of its arguments, which is what makes it testable without
// a browser.
//
// `canvasMeasurer` (a real `measureText` implementation) is a Gate 7 bonus;
// until then every caller — including the demo — uses this pure heuristic.

export interface TextMeasurer {
  measure(
    text: string,
    fontPx: number,
    weight: number,
    family: string,
    maxWidthPx: number,
  ): { width: number; lines: number; lineWidths: number[] };
}

// Calibrated against Archivo-ish proportional sans at typical weights. This
// is deliberately the "standard shortcut" that is
// wrong enough to cause visible overflow at large font sizes — it is here as
// the DOM-free fallback and the deterministic value tests run against, not
// as the final word on layout quality. The canvas measurer replaces it at
// the render boundary once Gate 7 lands.
const AVERAGE_CHAR_WIDTH_RATIO = 0.55;

function estimateWordWidth(word: string, fontPx: number, weight: number): number {
  // Heavier weights render slightly wider glyphs at the same font size.
  const weightFactor = 0.9 + ((weight - 400) / 400) * 0.25;
  return word.length * fontPx * AVERAGE_CHAR_WIDTH_RATIO * weightFactor;
}

export const estimateMeasurer: TextMeasurer = {
  measure(text, fontPx, weight, _family, maxWidthPx) {
    const spaceWidth = fontPx * AVERAGE_CHAR_WIDTH_RATIO * 0.6;
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    // Greedy word-wrap: walk the words, start a new line whenever the next
    // word would push the current line past maxWidthPx. `noUncheckedIndexedAccess`
    // is why this tracks `currentWidth`/`wordsOnLine` as plain locals instead
    // of reading the last entry of `lineWidths` back out on every word.
    const lineWidths: number[] = [];
    let currentWidth = 0;
    let wordsOnLine = 0;

    for (const word of words) {
      const wordWidth = estimateWordWidth(word, fontPx, weight);
      const addedWidth = wordsOnLine > 0 ? spaceWidth + wordWidth : wordWidth;
      if (wordsOnLine > 0 && currentWidth + addedWidth > maxWidthPx) {
        lineWidths.push(currentWidth);
        currentWidth = wordWidth;
        wordsOnLine = 1;
      } else {
        currentWidth += addedWidth;
        wordsOnLine += 1;
      }
    }
    lineWidths.push(currentWidth);

    return {
      width: Math.max(...lineWidths),
      lines: lineWidths.length,
      lineWidths,
    };
  },
};
