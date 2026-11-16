const QRCode = require('qrcode');
const sharp = require('sharp');
const designConfig = require('../utils/ticketDesignConfig');

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a QR Code Data URL for any payload string.
 */
async function generateQrDataUrl(payload) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 260,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

/**
 * Generates an inline SVG QR code (rectangles path) so it embeds directly inside the Ticket SVG
 * before converting to a high-resolution JPG image via sharp.
 */
async function generateQrSvgString(payload, size = 180) {
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

/**
 * Generates a downloadable JPG Buffer for a confirmed ticket.
 * IMPORTANT: The QR code contains ONLY the secure verification_token,
 * never the ticket number or customer mobile number.
 */
async function generateTicketJpgBuffer(ticketData) {
  const {
    eventName = designConfig.labels.defaultEventName,
    eventSubtitle = designConfig.labels.defaultSubtitle,
    ticketNumber,
    customerName,
    purchaseDate,
    sellerName,
    sellerCode,
    ticketPrice,
    verificationToken,
    status = 'SOLD',
  } = ticketData;

  if (!verificationToken) {
    throw new Error('Cannot generate digital ticket without a verification token');
  }

  // The QR payload ONLY stores the random verification token (no PII, no ticket number)
  const qrPayload = verificationToken;
  const rawQrSvg = await generateQrSvgString(qrPayload, 175);

  // Wrap the QR SVG inside a translated <g> group so no SVG attributes are duplicated
  const nestedQrSvg = `<g transform="translate(742, 110)">${rawQrSvg.replace(/<\?xml.*?\?>/g, '')}</g>`;

  const formattedDate = purchaseDate
    ? new Date(purchaseDate).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

  const c = designConfig.colors;
  const shortTokenPreview = `${verificationToken.slice(0, 8).toUpperCase()}...${verificationToken.slice(-6).toUpperCase()}`;

  const svgTicket = `
<svg xmlns="http://www.w3.org/2000/svg" width="${designConfig.width}" height="${designConfig.height}" viewBox="0 0 1000 460">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c.backgroundPrimary}" />
      <stop offset="100%" stop-color="${c.backgroundSecondary}" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="50%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
  </defs>

  <!-- Outer Canvas Background -->
  <rect width="1000" height="460" fill="#090d16" />

  <!-- Main Ticket Card Body (Left Section) -->
  <rect x="20" y="20" width="660" height="420" rx="16" fill="url(#bgGrad)" stroke="url(#goldGrad)" stroke-width="3" />

  <!-- Right Verification Stub -->
  <rect x="680" y="20" width="300" height="420" rx="16" fill="${c.stubBackground}" stroke="url(#goldGrad)" stroke-width="3" />

  <!-- Perforation Line & Cutout Notches -->
  <circle cx="680" cy="20" r="14" fill="#090d16" />
  <circle cx="680" cy="440" r="14" fill="#090d16" />
  <line x1="680" y1="38" x2="680" y2="422" stroke="#94a3b8" stroke-width="2" stroke-dasharray="8,8" />

  <!-- Top Gold Header Banner on Left -->
  <rect x="45" y="45" width="610" height="58" rx="10" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5" />
  <text x="65" y="72" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="#fbbf24" letter-spacing="1.5">
    ${escapeXml(eventName.toUpperCase())}
  </text>
  <text x="65" y="93" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#cbd5e1" letter-spacing="2">
    ${escapeXml(eventSubtitle.toUpperCase())}
  </text>

  <!-- Ticket Number Highlight Box -->
  <rect x="45" y="122" width="250" height="105" rx="12" fill="#0f172a" stroke="#f59e0b" stroke-width="2" />
  <text x="65" y="148" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" fill="#94a3b8" letter-spacing="1.5">
    TICKET NUMBER
  </text>
  <text x="65" y="202" font-family="Courier New, monospace, Arial" font-size="46" font-weight="bold" fill="#fbbf24">
    #${escapeXml(ticketNumber)}
  </text>

  <!-- Status & Price Box -->
  <rect x="315" y="122" width="340" height="105" rx="12" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
  <text x="335" y="148" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" fill="#94a3b8" letter-spacing="1">
    PAYMENT &amp; AUTHENTICITY STATUS
  </text>
  <rect x="335" y="160" width="145" height="32" rx="6" fill="#065f46" />
  <text x="352" y="181" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="bold" fill="#34d399">
    PAID • ${escapeXml(status)}
  </text>
  <text x="505" y="172" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#94a3b8">
    PRICE
  </text>
  <text x="505" y="198" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold" fill="#f8fafc">
    INR ${escapeXml(Number(ticketPrice || 50).toFixed(0))}
  </text>

  <!-- Customer & Purchase Metadata Grid -->
  <rect x="45" y="245" width="610" height="122" rx="12" fill="#0f172a" stroke="#334155" stroke-width="1.5" />

  <!-- Customer Name -->
  <text x="65" y="272" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#94a3b8" letter-spacing="1">
    ISSUED TO CUSTOMER
  </text>
  <text x="65" y="297" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">
    ${escapeXml(customerName)}
  </text>

  <!-- Purchase Date -->
  <text x="65" y="328" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#94a3b8" letter-spacing="1">
    PURCHASE DATE &amp; TIME
  </text>
  <text x="65" y="349" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="bold" fill="#e2e8f0">
    ${escapeXml(formattedDate)}
  </text>

  <!-- Authorized Seller Info -->
  <text x="375" y="272" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#94a3b8" letter-spacing="1">
    AUTHORIZED SELLER
  </text>
  <text x="375" y="297" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="bold" fill="#fbbf24">
    ${escapeXml(sellerName)} (${escapeXml(sellerCode)})
  </text>

  <!-- Authenticity Token Fingerprint -->
  <text x="375" y="328" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#94a3b8" letter-spacing="1">
    SECURITY SIGNATURE
  </text>
  <text x="375" y="349" font-family="Courier New, monospace" font-size="13" font-weight="bold" fill="#38bdf8">
    SIG-${escapeXml(shortTokenPreview)}
  </text>

  <!-- Footer Authenticity Bar -->
  <text x="45" y="395" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#10b981" letter-spacing="1">
    ✓ ${escapeXml(designConfig.labels.authenticityNotice)}
  </text>
  <text x="45" y="416" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#94a3b8">
    ${escapeXml(designConfig.labels.termsNotice)}
  </text>

  <!-- RIGHT STUB: QR Verification Section -->
  <text x="830" y="58" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="bold" fill="${c.stubTextDark}" letter-spacing="1">
    TICKET VERIFICATION
  </text>
  <text x="830" y="78" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${c.stubTextMuted}">
    Scan QR to verify authenticity
  </text>

  <!-- QR Frame -->
  <rect x="732" y="100" width="195" height="195" rx="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" />
  ${nestedQrSvg}

  <!-- Stub Ticket Number Badge -->
  <rect x="725" y="315" width="210" height="54" rx="10" fill="#0f172a" />
  <text x="830" y="335" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="bold" fill="#94a3b8" letter-spacing="1.5">
    TICKET NO.
  </text>
  <text x="830" y="359" text-anchor="middle" font-family="Courier New, monospace" font-size="22" font-weight="bold" fill="#fbbf24">
    #${escapeXml(ticketNumber)}
  </text>

  <text x="830" y="395" text-anchor="middle" font-family="Courier New, monospace" font-size="10" fill="#64748b">
    TOKEN: ${escapeXml(shortTokenPreview)}
  </text>
  <text x="830" y="414" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="bold" fill="#059669">
    OFFICIAL DIGITAL STUB
  </text>
</svg>`.trim();

  // Render SVG into a high-quality JPG buffer using sharp
  const jpgBuffer = await sharp(Buffer.from(svgTicket))
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return jpgBuffer;
}

module.exports = {
  generateQrDataUrl,
  generateTicketJpgBuffer,
};
