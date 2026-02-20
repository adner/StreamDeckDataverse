import sharp from "sharp";

export async function renderTextKey(
  text: string,
  bgColor: string = "#000000",
  textColor: string = "#ffffff",
  size: number = 96
): Promise<Buffer> {
  const fontSize = Math.floor(size * 0.3);

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bgColor}" />
      <text
        x="50%" y="50%"
        dominant-baseline="central"
        text-anchor="middle"
        font-family="sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="${textColor}"
      >${escapeXml(text)}</text>
    </svg>`;

  return sharp(Buffer.from(svg))
    .resize(size, size)
    .removeAlpha()
    .raw()
    .toBuffer();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
