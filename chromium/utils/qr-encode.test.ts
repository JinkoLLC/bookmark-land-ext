import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { encodeQr, qrVersionFor } from "./qr-encode";
import { qrSvg } from "./qr-render";

/** Decodes a grid of modules (quiet zone included) with jsQR, an independent decoder. */
function decodeGrid(dark: (x: number, y: number) => boolean, size: number): string | undefined {
  const scale = 4;
  const width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      if (dark(Math.floor(x / scale), Math.floor(y / scale))) pixels.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    }
  }
  return jsQR(pixels, width, width)?.data;
}

function decode(matrix: boolean[][]): string | undefined {
  return decodeGrid((x, y) => matrix[y - 4]?.[x - 4] === true, matrix.length + 8);
}

/** The modules an SVG from qrSvg paints dark, read back from its path. */
function decodeSvg(svg: string): string | undefined {
  const size = Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
  const grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  for (const [, x, y, run] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1/g)) grid[Number(y)].fill(true, Number(x), Number(x) + Number(run));
  return decodeGrid((x, y) => grid[y][x], size);
}

const SHORT = "https://gridnotes.example/";
const TRACKED = "https://bkmk.to/k7m2qx?qr";
const LONG = `https://gridnotes.example/long-duration-storage-pilots?${"ref=newsletter&utm_campaign=storage-digest-2026&".repeat(38)}page=2#results-and-what-they-mean`;

describe("encodeQr", () => {
  it("decodes back to a short address, a tracked address and a long one", () => {
    expect(LONG.length).toBeGreaterThan(1750);
    for (const text of [SHORT, TRACKED, LONG]) expect(decode(encodeQr(text)!)).toBe(text);
  });

  it("decodes at every version, at each version's full capacity", () => {
    let length = 0;
    for (let version = 1; version <= 40; version++) {
      // The longest text that still fits this version.
      while (qrVersionFor(length + 1) === version) length++;
      const text = Array.from({ length }, (_, i) => "abcdefghijklmnopqrstuvwxyz0123456789/?=&.-"[(i * 7 + version) % 42]).join("");
      const matrix = encodeQr(text)!;
      expect(matrix.length, `version ${version}`).toBe(version * 4 + 17);
      expect(decode(matrix), `version ${version}`).toBe(text);
    }
    expect(length).toBe(2331);
  });

  it("encodes text outside ASCII as UTF-8", () => {
    expect(decode(encodeQr("https://example.com/café/日本")!)).toBe("https://example.com/café/日本");
  });

  it("returns null for more than a version 40 code holds", () => {
    expect(encodeQr("a".repeat(2331))).not.toBeNull();
    expect(encodeQr("a".repeat(2332))).toBeNull();
  });

  it("keeps the matrix of a fixed input (this one decodes, see above)", () => {
    const rows = encodeQr(TRACKED)!.map((row) => row.map((dark) => (dark ? "#" : ".")).join(""));
    expect(rows).toMatchInlineSnapshot(`
      [
        "#######..####.#...#######",
        "#.....#..#...####.#.....#",
        "#.###.#.##.##.#...#.###.#",
        "#.###.#.#..####...#.###.#",
        "#.###.#.#.#.##..#.#.###.#",
        "#.....#.###...###.#.....#",
        "#######.#.#.#.#.#.#######",
        "........#..#..#.#........",
        "#.#####...####....#####..",
        "##.....###.##.#....#...#.",
        "##....#..#####.##...##.##",
        "..#.....#.##....##......#",
        ".###.###..#.###..##.#.###",
        "####.#...#....#.#..#.#.#.",
        "#.###.###..##..#.#.###.##",
        "#.###..##..#..#######...#",
        "#.....##..###########.#..",
        "........###.###.#...##...",
        "#######.....#...#.#.#.###",
        "#.....#.##.##...#...##.##",
        "#.###.#.#.#..#.######.#..",
        "#.###.#.####.######.#####",
        "#.###.#.#....##.#....##.#",
        "#.....#.....#.###..###..#",
        "#######.#....###.#.######",
      ]
    `);
  });
});

describe("qrSvg", () => {
  it("draws the matrix dark on white with a four-module quiet zone", () => {
    const svg = qrSvg(encodeQr(SHORT)!);
    expect(svg).toContain('viewBox="0 0 33 33"');
    expect(svg).toContain('<rect width="33" height="33" fill="#ffffff"/>');
    expect(svg).toContain('fill="#111111"');
    expect(decodeSvg(svg)).toBe(SHORT);
    expect(decodeSvg(qrSvg(encodeQr(LONG)!))).toBe(LONG);
  });
});
