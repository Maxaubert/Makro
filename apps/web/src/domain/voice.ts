// Rule-based voice and typed logging (decision 49, pinned by packages/contracts/voice/parse.json).
// A food line becomes items: a search query, a quantity and a unit. No AI and no nutrition numbers
// (rule 1): products are found afterwards by the normal search, and the user confirms before saving.
// Norwegian and English. Pure: no clock, no database.

export type VoiceUnit = 'g' | 'ml' | 'piece' | 'serving';
export interface ParsedItem {
  query: string;
  /** A number, a [low, high] range, or null when no amount was said. */
  quantity: number | [number, number] | null;
  /** null exactly when quantity is null. */
  unit: VoiceUnit | null;
}

const NUMBER_WORDS: Record<string, number> = {
  to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10, elleve: 11, tolv: 12, tretten: 13, fjorten: 14, femten: 15,
  seksten: 16, sytten: 17, atten: 18, nitten: 19, tjue: 20, tretti: 30, førti: 40, femti: 50, seksti: 60, sytti: 70, åtti: 80, nitti: 90, hundre: 100, tusen: 1000,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const UNIT_NUMBERS: Record<string, number> = { en: 1, ett: 1, et: 1, ei: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9 };

/** A number written as one word: "femti", "hundreogfemti", "tohundre", "tjuefem". null if it is not one. */
function numberWord(w: string): number | null {
  if (w in NUMBER_WORDS) return NUMBER_WORDS[w];
  const h = w.indexOf('hundre');
  if (h >= 0) {
    const before = w.slice(0, h);
    const after = w.slice(h + 6).replace(/^og/, '');
    const times = before === '' ? 1 : UNIT_NUMBERS[before];
    const rest = after === '' ? 0 : numberWord(after);
    return times !== undefined && rest !== null ? times * 100 + rest : null;
  }
  for (const tens of ['tjue', 'tretti', 'førti', 'femti', 'seksti', 'sytti', 'åtti', 'nitti']) {
    if (w.startsWith(tens) && w.length > tens.length) {
      const unit = UNIT_NUMBERS[w.slice(tens.length)];
      return unit !== undefined ? NUMBER_WORDS[tens] + unit : null;
    }
  }
  return null;
}
const ARTICLES = new Set(['en', 'et', 'ett', 'ei', 'a', 'an']);
/** "et par", "a couple of": 2. */
const COUPLE = new Set(['par', 'couple']);
const HALF = new Set(['halv', 'halvt', 'halve', 'half']);
/** "litt ketsjup" with no amount is 1 serving (eval/README.md conventions). */
const VAGUE = new Set(['litt', 'noe', 'some', 'little', 'bit']);

/** Unit words: what they become and the factor to g or ml. */
const UNITS: Record<string, { unit: VoiceUnit; factor: number }> = {
  g: { unit: 'g', factor: 1 }, gr: { unit: 'g', factor: 1 }, gram: { unit: 'g', factor: 1 }, grams: { unit: 'g', factor: 1 }, gramm: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 }, kilo: { unit: 'g', factor: 1000 }, kilos: { unit: 'g', factor: 1000 }, kilogram: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 }, cl: { unit: 'ml', factor: 10 }, dl: { unit: 'ml', factor: 100 },
  l: { unit: 'ml', factor: 1000 }, liter: { unit: 'ml', factor: 1000 }, litre: { unit: 'ml', factor: 1000 }, liters: { unit: 'ml', factor: 1000 }, litres: { unit: 'ml', factor: 1000 },
  stk: { unit: 'piece', factor: 1 }, stykk: { unit: 'piece', factor: 1 }, stykker: { unit: 'piece', factor: 1 }, piece: { unit: 'piece', factor: 1 }, pieces: { unit: 'piece', factor: 1 },
  skive: { unit: 'piece', factor: 1 }, skiver: { unit: 'piece', factor: 1 }, slice: { unit: 'piece', factor: 1 }, slices: { unit: 'piece', factor: 1 }, bit: { unit: 'piece', factor: 1 }, biter: { unit: 'piece', factor: 1 },
  kopp: { unit: 'serving', factor: 1 }, kopper: { unit: 'serving', factor: 1 }, cup: { unit: 'serving', factor: 1 }, cups: { unit: 'serving', factor: 1 },
  glass: { unit: 'serving', factor: 1 }, glasses: { unit: 'serving', factor: 1 }, skål: { unit: 'serving', factor: 1 }, skåler: { unit: 'serving', factor: 1 },
  bowl: { unit: 'serving', factor: 1 }, bowls: { unit: 'serving', factor: 1 }, porsjon: { unit: 'serving', factor: 1 }, porsjoner: { unit: 'serving', factor: 1 },
  serving: { unit: 'serving', factor: 1 }, servings: { unit: 'serving', factor: 1 },
  // A pack is one piece of that product; its size is a separate question.
  boks: { unit: 'piece', factor: 1 }, bokser: { unit: 'piece', factor: 1 }, pakke: { unit: 'piece', factor: 1 }, pakker: { unit: 'piece', factor: 1 }, pose: { unit: 'piece', factor: 1 },
  flaske: { unit: 'piece', factor: 1 }, beger: { unit: 'piece', factor: 1 }, kartong: { unit: 'piece', factor: 1 }, can: { unit: 'piece', factor: 1 }, bottle: { unit: 'piece', factor: 1 }, pack: { unit: 'piece', factor: 1 },
  håndfull: { unit: 'serving', factor: 1 }, neve: { unit: 'serving', factor: 1 }, handful: { unit: 'serving', factor: 1 },
  desiliter: { unit: 'ml', factor: 100 }, centiliter: { unit: 'ml', factor: 10 }, milliliter: { unit: 'ml', factor: 1 }, halvliter: { unit: 'ml', factor: 500 },
};

/** Phrases that carry no food: meal names, "I had", hedges. Longest first. */
const FILLER_PHRASES = [
  'til frokost', 'til lunsj', 'til middag', 'til kvelds', 'til kveldsmat', 'til mellommåltid', 'for breakfast', 'for lunch', 'for dinner',
  'hadde jeg', 'jeg hadde', 'jeg spiste', 'spiste jeg', 'jeg tok', 'tok jeg', 'jeg drakk', 'drakk jeg', 'i had', 'i ate', 'i drank',
  'a little', 'a bit of', 'i dag', 'i går', 'i kveld', 'i morges', 'etter trening', 'før trening', 'after the gym', 'after training',
];
const FILLER_WORDS = new Set([
  'tok', 'spiste', 'drakk', 'hadde', 'jeg', 'i', 'had', 'ate', 'drank', 'så', 'deretter', 'etterpå', 'også', 'then', 'also',
  'rundt', 'ca', 'cirka', 'omtrent', 'kanskje', 'mellom', 'about', 'around', 'approximately', 'roughly', 'maybe', 'between', 'just', 'bare',
  'av', 'of', 'fra', 'from', 'the', 'my', 'min', 'mitt', 'mine',
  'frokost', 'lunsj', 'middag', 'kvelds', 'kveldsmat', 'breakfast', 'lunch', 'dinner',
  'har', 'tatt', 'have', 'taken', 'hel', 'hele', 'whole', 'stor', 'store', 'liten', 'lite', 'lille', 'små', 'mellomstor', 'big', 'large', 'small', 'medium',
  'hver', 'each', 'today', 'yesterday', 'den', 'det', 'dem', 'denne', 'dette', 'that', 'it', 'this', 'those',
  'eh', 'ehm', 'øh', 'uh', 'um', 'umm', 'jo', 'altså', 'liksom', 'sånn', 'like', 'ok', 'okay', 'yeah', 'ja', 'well',
]);
/** "eller nei", "actually": the item before is replaced by what follows. */
const CORRECTIONS = ['eller nei', 'nei vent', 'nei forresten', 'actually make that', 'actually', 'make that', 'i mean', 'no wait'];
/** A clause with one of these is talk about the food, not food ("jeg husker ikke merket"). */
const CHATTER = new Set([
  'husker', 'tror', 'ikke', 'men', 'var', 'er', 'vet', 'skal', 'legge', 'legg', 'logg', 'logge', 'glemte', 'glemt', 'besto', 'dro', 'kom', 'hente', 'tilbake',
  'think', 'remember', 'not', "don't", 'was', 'is', 'but', 'know', 'forgot', 'log', 'went', 'place',
]);
/** Words that start a new item. Ranges ("100 og 150") are joined before this split. */
const CONNECTORS = /\s(?:og|and|med|with|pluss|plus|samt|så|deretter|etterpå|then|på|on)\s/g;

const NUM = String.raw`\d+(?:\.\d+)?`;

function normalise(text: string): string {
  let s = ` ${text.toLowerCase().replace(/[–—]/g, '-')} `;
  s = s.replace(/(\d),(\d)/g, '$1.$2'); // decimal comma
  s = s.replace(/(\d)(kg|g|gr|ml|dl|cl|l)\b/g, '$1 $2'); // "200g"
  s = s.replace(/[a-zæøå]+/g, (w) => {
    const n = numberWord(w);
    return n === null ? w : String(n);
  });
  // Ranges: "10-15", "100 og 150", "10 til 15", "between 1 and 2"
  s = s.replace(new RegExp(`(${NUM})\\s*(?:-|og|til|and|to)\\s*(${NUM})`, 'g'), '$1-$2');
  return s;
}

interface Draft extends ParsedItem {
  /** The amount came from "litt" or "some", so a following amount-only clause replaces it. */
  vague: boolean;
}

function parseClause(clause: string): Draft | 'amount-only' | null {
  let s = ` ${clause.replace(/[^a-z0-9æøåäöüé.\-' ]/g, ' ')} `;
  for (const p of FILLER_PHRASES) s = s.split(` ${p} `).join(' ');
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.some((t) => CHATTER.has(t))) return null;
  const words = tokens.filter((t) => !FILLER_WORDS.has(t));

  let quantity: number | [number, number] | null = null;
  let unit: VoiceUnit | null = null;
  let vague = false;
  const rest: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    const range = w.match(new RegExp(`^(${NUM})-(${NUM})$`));
    const single = w.match(new RegExp(`^${NUM}$`));
    if (quantity === null && (range || single)) {
      const u = next !== undefined ? UNITS[next] : undefined;
      const factor = u?.factor ?? 1;
      const scale = (n: string) => Math.round(Number(n) * factor * 1000) / 1000;
      quantity = range ? [scale(range[1]), scale(range[2])] : scale(w);
      unit = u?.unit ?? 'piece';
      if (u) i++;
      continue;
    }
    if (quantity === null && ARTICLES.has(w) && next !== undefined && new RegExp(`^${NUM}(?:-${NUM})?$`).test(next)) continue; // "en tre-fire skiver"
    if (quantity === null && (ARTICLES.has(w) || HALF.has(w))) {
      // "en halv", "half an": 0.5; a lone article: 1. A unit word may follow ("en kopp").
      let n = HALF.has(w) ? 0.5 : 1;
      let j = i + 1;
      if (words[j] !== undefined && (HALF.has(words[j]) || ARTICLES.has(words[j]) || COUPLE.has(words[j]))) {
        if (HALF.has(words[j])) n = 0.5;
        if (COUPLE.has(words[j])) n = 2;
        j++;
      }
      const u = words[j] !== undefined ? UNITS[words[j]] : undefined;
      quantity = Math.round(n * (u?.factor ?? 1) * 1000) / 1000;
      unit = u ? u.unit : 'piece';
      i = u ? j : j - 1;
      continue;
    }
    if (quantity === null && VAGUE.has(w)) {
      quantity = 1;
      unit = 'serving';
      vague = true;
      continue;
    }
    if (ARTICLES.has(w)) continue;
    // "brødskiver", "grovbrødskive": the bread, counted in slices.
    const slice = w.match(/^(.{3,})skiver?$/);
    if (slice) {
      if (unit === null) unit = 'piece';
      rest.push(slice[1]);
      continue;
    }
    rest.push(w);
  }
  const query = rest.join(' ').trim();
  if (query === '') return quantity !== null && !vague ? 'amount-only' : null;
  // A long clause with no amount is talk, not a food ("dro etter å hente").
  if (quantity === null && rest.length > 4) return null;
  return { query, quantity, unit, vague };
}

export function parseFoodLine(text: string): ParsedItem[] {
  const out: Draft[] = [];
  const clauses = normalise(text)
    .split(/[,;:!?\n]|\.(?!\d)/)
    .flatMap((part) => ` ${part} `.split(CONNECTORS));
  let replaceNext = false;
  for (let clause of clauses) {
    if (clause.trim() === '') continue;
    // A correction drops the item before it; what follows (here or in the next clause) takes its place.
    const marker = CORRECTIONS.find((m) => ` ${clause} `.includes(` ${m} `));
    if (marker) {
      clause = ` ${clause} `.split(` ${marker} `).slice(1).join(' ');
      replaceNext = true;
      if (clause.trim() === '') continue;
    }
    const parsed = parseClause(clause);
    if (parsed === null) continue;
    if (parsed === 'amount-only') {
      // "litt grønnsaker, kanskje 100 gram": the amount belongs to the item before it.
      const prev = out[out.length - 1];
      if (prev && (prev.quantity === null || prev.vague)) {
        const again = parseClause(`${clause} x`);
        if (again && again !== 'amount-only') {
          prev.quantity = again.quantity;
          prev.unit = again.unit;
          prev.vague = false;
        }
      }
      continue;
    }
    if (replaceNext && out.length > 0) out.pop();
    replaceNext = false;
    out.push(parsed);
  }
  return out.map(({ query, quantity, unit }) => ({ query, quantity, unit }));
}
