// A response read aloud: what is spoken, in which pieces, and in which language's voice. Pure: no I/O, no audio.
// Nothing is read aloud unless the user turned Talk on (the default is silent text), and what is spoken is exactly
// the text the card shows for the current response.

/**
 * A piece takes at most this much (a sentence, or part of a long one), so an interruption drops what was not yet
 * spoken, and a piece is said within the time a voice gives one piece. A letter takes 1.
 */
export const PIECE_MAX = 220;
/** A Chinese character is a syllable of its own: it takes about as long to say as three letters. */
export const HAN_COST = 3;
const HAN = /\p{Script=Han}/u;
/** The languages a voice may be asked for. */
export type Culture = 'en-US' | 'zh-CN';
/** The voice a piece is said in: Chinese when it has a Chinese character (the Chinese voice also says Latin words), else English. */
export const speechCulture = (piece: string): Culture => (HAN.test(piece) ? 'zh-CN' : 'en-US');

/**
 * The text as it is spoken, in order: sentences, and long sentences cut at a space or a pause mark. Every character
 * of the text is in exactly one piece, apart from the white space between pieces; nothing is added or reworded.
 */
export function speechPieces(text: string, max = PIECE_MAX): string[] {
  const pieces: string[] = [];
  // A sentence ends at . ! ? followed by white space, at a full-width 。！？ (with what closes it), or at a line break.
  for (const sentence of text.split(/(?<=[。！？][」』”’）)]*)(?![」』”’）)。！？])|(?<=[.!?])\s+|\n+/u)) {
    let rest = sentence.trim();
    for (;;) {
      // The longest start of what is left that fits, and the last place in it to cut at.
      let used = 0;
      let end = 0;
      let cut = 0;
      for (const ch of rest) {
        // by character, so never between the halves of a pair
        const cost = ch.length * (HAN.test(ch) ? HAN_COST : 1);
        if (end > 0 && used + cost > max) break; // (one character is always taken, whatever it costs)
        used += cost;
        end += ch.length;
        if (/[\s，、；：,;:]/.test(ch)) cut = end;
      }
      if (end >= rest.length) break;
      if (/\s/.test(rest[end]!)) cut = end;
      const at = cut > end / 2 ? cut : end; // nowhere to cut at: a hard cut, never a dropped character
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest.length > 0) pieces.push(rest);
  }
  return pieces;
}
