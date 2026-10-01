// A response read aloud: what is spoken, in which pieces. Pure: no I/O, no audio.
// Nothing is read aloud unless the user turned Talk on (the default is silent text), and what is spoken is exactly
// the text the card shows for the current response.

/** A piece is at most this long (a sentence, or part of a long one), so an interruption drops what was not yet spoken. */
export const PIECE_MAX = 220;

/**
 * The text as it is spoken, in order: sentences, and long sentences cut at a space. Every character of the text is
 * in exactly one piece, apart from the white space between pieces; nothing is added or reworded.
 */
export function speechPieces(text: string, max = PIECE_MAX): string[] {
  const pieces: string[] = [];
  // A sentence ends at . ! ? (or their full-width forms, or a line break) followed by white space or the end.
  for (const sentence of text.split(/(?<=[.!?。！？])\s+|\n+/)) {
    let rest = sentence.trim();
    while (rest.length > max) {
      const cut = rest.lastIndexOf(' ', max);
      let at = cut > max / 2 ? cut : max; // no space to cut at: a hard cut, never a dropped character
      if (at === max && rest.charCodeAt(at - 1) >= 0xd800 && rest.charCodeAt(at - 1) <= 0xdbff) at -= 1; // not between the halves of a pair
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest.length > 0) pieces.push(rest);
  }
  return pieces;
}
