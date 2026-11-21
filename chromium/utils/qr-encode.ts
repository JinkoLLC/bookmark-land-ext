/**
 * A QR code encoder for addresses: byte mode, error correction level M,
 * versions 1 to 40 (ISO/IEC 18004). Written here so the extension ships no
 * QR dependency; `qr-encode.test.ts` decodes its output with a separate
 * decoder.
 */

// Level M, by version (index 0 unused): error correction codewords per block,
// and the number of blocks.
const ECC_PER_BLOCK = [
  0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
  26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const BLOCKS = [
  0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
  17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

const sizeOf = (version: number) => version * 4 + 17;

/** Centres of the alignment patterns along one axis. */
function alignmentCentres(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const centres = [6];
  for (let at = sizeOf(version) - 7; centres.length < count; at -= step) centres.splice(1, 0, at);
  return centres;
}

/** Codewords (data plus error correction) that fit beside the function patterns. */
function totalCodewords(version: number): number {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const count = Math.floor(version / 7) + 2;
    modules -= (25 * count - 10) * count - 55;
    if (version >= 7) modules -= 36;
  }
  return modules >> 3;
}

const dataCodewords = (version: number) => totalCodewords(version) - ECC_PER_BLOCK[version] * BLOCKS[version];

/** Bits of the byte-mode header: mode indicator and character count. */
const headerBits = (version: number) => 4 + (version < 10 ? 8 : 16);

/** The smallest version that holds `byteLength` bytes; null when none does. */
export function qrVersionFor(byteLength: number): number | null {
  for (let version = 1; version <= 40; version++) {
    if (dataCodewords(version) * 8 >= headerBits(version) + byteLength * 8) return version;
  }
  return null;
}

// ---- Reed-Solomon over GF(2^8), polynomial 0x11d -------------------------------

function multiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Generator polynomial of the given degree, without its leading 1. */
function generator(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = multiply(root, 2);
  }
  return result;
}

function remainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    divisor.forEach((coefficient, i) => (result[i] ^= multiply(coefficient, factor)));
  }
  return result;
}

// ---- codewords -----------------------------------------------------------------

/** The data as padded codewords, split into blocks, each with its error correction, interleaved. */
function codewords(bytes: Uint8Array, version: number): number[] {
  const capacity = dataCodewords(version);
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, headerBits(version) - 4);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, capacity * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

  const blocks = BLOCKS[version];
  const total = totalCodewords(version);
  const shortLength = Math.floor(total / blocks) - ECC_PER_BLOCK[version];
  const shortBlocks = blocks - (total % blocks);
  const divisor = generator(ECC_PER_BLOCK[version]);
  const dataBlocks: number[][] = [];
  for (let i = 0, from = 0; i < blocks; i++) {
    const length = shortLength + (i < shortBlocks ? 0 : 1);
    dataBlocks.push(data.slice(from, from + length));
    from += length;
  }
  const eccBlocks = dataBlocks.map((block) => remainder(block, divisor));

  const result: number[] = [];
  for (let i = 0; i <= shortLength; i++) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]);
  }
  for (let i = 0; i < divisor.length; i++) {
    for (const block of eccBlocks) result.push(block[i]);
  }
  return result;
}

// ---- matrix --------------------------------------------------------------------

type Matrix = boolean[][];

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** `value` followed by the remainder of its division by `polynomial` (a BCH code). */
function withBch(value: number, polynomial: number, degree: number): number {
  let rest = value;
  for (let i = 0; i < degree; i++) rest = (rest << 1) ^ ((rest >>> (degree - 1)) * polynomial);
  return (value << degree) | rest;
}

/** Both copies of the format information (level M is 0, then the mask) and the dark module. */
function drawFormat(set: (x: number, y: number, dark: boolean) => void, size: number, mask: number) {
  const bits = withBch(mask, 0x537, 10) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);
}

/** The standard's four penalty rules; the mask with the lowest total wins. */
function penalty(modules: Matrix): number {
  const size = modules.length;
  let score = 0;
  const columns = modules[0].map((_, x) => modules.map((row) => row[x]));
  let dark = 0;
  for (const line of [...modules, ...columns]) {
    const text = line.map((module) => (module ? "1" : "0")).join("");
    // Rule 1: runs of five or more.
    for (const run of text.match(/0+|1+/g)!) if (run.length >= 5) score += run.length - 2;
    // Rule 3: a finder-like 1:1:3:1:1 with four light modules beside it.
    score += 40 * (text.match(/(?=10111010000|00001011101)/g)?.length ?? 0);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) dark++;
      // Rule 2: 2x2 blocks of one colour.
      if (x + 1 < size && y + 1 < size) {
        const colour = modules[y][x];
        if (colour === modules[y][x + 1] && colour === modules[y + 1][x] && colour === modules[y + 1][x + 1]) score += 3;
      }
    }
  }
  // Rule 4: distance of the dark share from a half, in steps of 5%.
  const total = size * size;
  return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
}

/**
 * The QR code for `text` as rows of modules (true is dark), without a quiet
 * zone; null when the text is longer than a version 40 code holds (2,331
 * bytes at level M).
 */
export function encodeQr(text: string): Matrix | null {
  const bytes = new TextEncoder().encode(text);
  const version = qrVersionFor(bytes.length);
  if (version === null) return null;

  const size = sizeOf(version);
  const modules: Matrix = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved: Matrix = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    reserved[y][x] = true;
  };
  /** A square pattern around a centre: `dark` decides by ring. */
  const square = (cx: number, cy: number, radius: number, dark: (ring: number) => boolean) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dark(Math.max(Math.abs(dx), Math.abs(dy))));
      }
    }
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Finder patterns with their light separators.
  for (const [x, y] of [[3, 3], [size - 4, 3], [3, size - 4]]) square(x, y, 4, (ring) => ring !== 2 && ring !== 4);
  const centres = alignmentCentres(version);
  const last = centres.length - 1;
  centres.forEach((y, row) =>
    centres.forEach((x, column) => {
      // The three corners that hold finder patterns have none.
      const inFinder = (row === 0 && column === 0) || (row === 0 && column === last) || (row === last && column === 0);
      if (!inFinder) square(x, y, 2, (ring) => ring !== 1);
    }),
  );
  drawFormat(set, size, 0);
  if (version >= 7) {
    const bits = withBch(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // The codewords, in two-module columns from the right, alternately up and down.
  const data = codewords(bytes, version);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing pattern's column is skipped
    for (let step = 0; step < size; step++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - step : step;
        if (reserved[y][x] || i >= data.length * 8) continue;
        modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }

  let best: Matrix = modules;
  let lowest = Infinity;
  MASKS.forEach((flips, mask) => {
    const masked = modules.map((row, y) => row.map((dark, x) => (reserved[y][x] ? dark : dark !== flips(x, y))));
    drawFormat((x, y, dark) => (masked[y][x] = dark), size, mask);
    const score = penalty(masked);
    if (score < lowest) {
      lowest = score;
      best = masked;
    }
  });
  return best;
}
