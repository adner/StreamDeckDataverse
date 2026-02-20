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

export async function renderIncidentKey(
  originEmoji: string,
  priorityLabel: string,
  bgColor: string,
  size: number = 96
): Promise<Buffer> {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bgColor}" />
      <text x="50%" y="46" text-anchor="middle"
        font-family="sans-serif" font-size="44"
        dominant-baseline="central">${originEmoji}</text>
      <text x="50%" y="82" text-anchor="middle"
        font-family="sans-serif" font-size="16"
        fill="rgba(255,255,255,0.7)">${escapeXml(priorityLabel)}</text>
    </svg>`;

  return sharp(Buffer.from(svg))
    .resize(size, size)
    .removeAlpha()
    .raw()
    .toBuffer();
}

/**
 * Renders a full-panel splash image for the Stream Deck XL (768x384 px).
 * Pass the result to `deck.fillPanelBuffer(buf, { format: "rgb" })`.
 */
export async function renderSplashScreen(
  imagePath: string,
  width: number = 768,
  height: number = 384
): Promise<Buffer> {
  return sharp(imagePath)
    .resize(width, height, { fit: "cover" })
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
