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
  ticketNumber: string,
  title: string,
  priorityLabel: string,
  bgColor: string,
  size: number = 96
): Promise<Buffer> {
  // Truncate title into two lines of up to 11 chars each
  const maxLineLen = 11;
  let line1 = title.slice(0, maxLineLen);
  let line2 = title.length > maxLineLen ? title.slice(maxLineLen, maxLineLen * 2) : "";
  if (title.length > maxLineLen * 2) {
    line2 = line2.slice(0, maxLineLen - 1) + "\u2026";
  }

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bgColor}" />
      <text x="50%" y="18" text-anchor="middle"
        font-family="sans-serif" font-size="14" font-weight="bold"
        fill="#ffffff">${escapeXml(ticketNumber)}</text>
      <text x="50%" y="42" text-anchor="middle"
        font-family="sans-serif" font-size="15"
        fill="#ffffff">${escapeXml(line1)}</text>
      <text x="50%" y="60" text-anchor="middle"
        font-family="sans-serif" font-size="15"
        fill="#ffffff">${escapeXml(line2)}</text>
      <text x="50%" y="84" text-anchor="middle"
        font-family="sans-serif" font-size="12"
        fill="rgba(255,255,255,0.7)">${escapeXml(priorityLabel)}</text>
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
