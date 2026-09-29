// Background entry of the WebExtension (generated as webextension/ink-format.js, loaded with
// importScripts): the ink document reader, so the background checks stored and incoming ink with
// exactly the code the page uses.
import { copyRecord, isCopy, parseCopy, parseInk } from './ink.ts';

(globalThis as typeof globalThis & { lcInkFormat?: unknown }).lcInkFormat = { parseInk, parseCopy, isCopy, copyRecord };
