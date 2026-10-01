// A response read aloud: what is spoken, in which pieces, and in which language's voice. Pure: no I/O, no audio.
// Nothing is read aloud unless the user turned Talk on (the default is silent text), and what is spoken is exactly
// the text the card shows for the current response.

/**
 * A piece takes at most this much (a sentence, or part of a long one), so an interruption drops what was not yet
 * spoken, and a piece is said within the time a voice gives one piece. A letter takes 1.
 */
export const PIECE_MAX = 220;
/** A Chinese character, or a digit, is a syllable (or a word) of its own: it takes about as long to say as three letters. */
export const HAN_COST = 3;
const HAN = /\p{Script=Han}/u;
const SLOW = /[\p{Script=Han}\p{Nd}]/u;
/** The languages a voice may be asked for. */
export type Culture = 'en-US' | 'zh-CN';
/** The voice a piece is said in: Chinese when it has a Chinese character (the Chinese voice also says Latin words), else English. */
export const speechCulture = (piece: string): Culture => (HAN.test(piece) ? 'zh-CN' : 'en-US');
/**
 * The voice of each piece of a response. A piece without any letter (a list number, a bare figure) has no language
 * of its own: it is said in the voice of the next piece that has one, else of the one before, else in English.
 */
export function speechCultures(pieces: readonly string[]): Culture[] {
  const own = pieces.map((p) => (/\p{L}/u.test(p) ? speechCulture(p) : null));
  const out: Array<Culture | null> = [...own];
  let next: Culture | null = null;
  for (let i = own.length - 1; i >= 0; i -= 1) next = own[i] ?? next, (out[i] = next);
  let before: Culture = 'en-US';
  return out.map((c) => (before = c ?? before));
}

/**
 * The text as it is spoken, in order: sentences, and long sentences cut at a space or a pause mark. Every character
 * of the text is in exactly one piece, apart from the white space between pieces; nothing is added or reworded.
 */
export function speechPieces(text: string, max = PIECE_MAX): string[] {
  const pieces: string[] = [];
  // A piece with nothing to pronounce (only marks) is said with the piece before it, or (the first one) with the
  // piece after it, when that still fits: never by itself.
  const mute = (piece: string): boolean => !/[\p{L}\p{N}]/u.test(piece);
  const push = (piece: string): void => {
    const last = pieces.length - 1;
    if (last >= 0 && mute(piece) && pieces[last]!.length + piece.length <= max) pieces[last] += piece;
    else if (last >= 0 && mute(pieces[last]!) && pieces[last]!.length + 1 + piece.length <= max) pieces[last] = `${pieces[last]!} ${piece}`;
    else pieces.push(piece);
  };
  // A sentence ends at . ! ? followed by white space, at a full-width 。！？ (with every stop and closing mark right
  // after it, unless a pause mark follows: the sentence goes on), or at a line break. One pass marks the full-width
  // ends, then the text is split: the work grows with the text, never with its square.
  const marked = text.replace(/[。！？][。！？!?.」』”’）)】》〉］\]"'*_]*/gu, (run: string, at: number) => (/[，、；：,;:]/.test(text[at + run.length] ?? '') ? run : `${run}\n`));
  for (const sentence of marked.split(/(?<=[.!?])\s+|\n+/u)) {
    let rest = sentence.trim();
    for (;;) {
      // The longest start of what is left that fits, and the last place in it to cut at.
      let used = 0;
      let end = 0;
      let cut = 0;
      let stop = false; // the character before was a half-width . ! ?
      for (const ch of rest) {
        // by character, so never between the halves of a pair
        const cost = ch.length * (SLOW.test(ch) ? HAN_COST : 1);
        if (end > 0 && used + cost > max) break; // (one character is always taken, whatever it costs)
        if (stop && HAN.test(ch)) cut = end; // a half-width stop with a Chinese character right after it
        used += cost;
        end += ch.length;
        // A full-width pause mark, or white space; a half-width , ; : only before white space or a Chinese character
        // (inside a number, a time or an address it is no pause: 1,250,000 and 10:45 stay whole).
        if (/[\s，、；：]/.test(ch) || (/[,;:]/.test(ch) && end < rest.length && /[\s\p{Script=Han}]/u.test(String.fromCodePoint(rest.codePointAt(end)!)))) cut = end;
        stop = /[.!?]/.test(ch);
      }
      if (end >= rest.length) break;
      const next = String.fromCodePoint(rest.codePointAt(end)!);
      if (/\s/.test(next) || (stop && HAN.test(next))) cut = end;
      const at = cut > end / 2 ? cut : end; // nowhere to cut at: a hard cut, never a dropped character
      push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest.length > 0) push(rest);
  }
  return pieces;
}
