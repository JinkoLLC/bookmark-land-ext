/** Light modules around the code, which scanners need. */
const QUIET = 4;
const EXPORT_PX = 1024;

/**
 * A QR matrix as SVG: square modules, dark on white in either theme, with
 * the quiet zone. The accessible name is the caller's (an `<img alt>`).
 */
export function qrSvg(matrix: boolean[][]): string {
  const size = matrix.length + QUIET * 2;
  let path = "";
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let run = 1;
      while (row[x + run]) run++;
      path += `M${x + QUIET} ${y + QUIET}h${run}v1h-${run}z`;
      x += run;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${EXPORT_PX}" height="${EXPORT_PX}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><path fill="#111111" d="${path}"/></svg>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * The SVG drawn on a canvas, as a 1024 px PNG. Each module gets a whole
 * number of pixels and what is left over widens the white margin: modules of
 * uneven width make a dense code (a long address) hard to scan.
 */
export async function qrPng(svg: string): Promise<Blob> {
  const image = new Image();
  image.src = svgDataUrl(svg);
  await image.decode();
  const modules = Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
  const side = Math.floor(EXPORT_PX / modules) * modules;
  const margin = Math.floor((EXPORT_PX - side) / 2);
  const canvas = Object.assign(document.createElement("canvas"), { width: EXPORT_PX, height: EXPORT_PX });
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, EXPORT_PX, EXPORT_PX);
  context.drawImage(image, margin, margin, side, side);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png"),
  );
}
