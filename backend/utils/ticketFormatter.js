const crypto = require('crypto');

/**
 * Formats a sequential integer (1, 2, ... 999, 1000) into the required ticket format:
 * 001..999 (3 digits), 1000+ (4+ digits).
 */
function formatTicketNumber(num) {
  const n = parseInt(num, 10);
  if (isNaN(n) || n < 1) {
    throw new Error(`Invalid ticket sequence number: ${num}`);
  }
  if (n <= 999) {
    return String(n).padStart(3, '0');
  }
  return String(n);
}

/**
 * Normalizes a ticket number input string (e.g., "1" -> "001", "015" -> "015", "1000" -> "1000")
 */
function normalizeTicketInput(input) {
  if (!input) return '';
  const trimmed = String(input).trim();
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (num >= 1) {
      return formatTicketNumber(num);
    }
  }
  return trimmed;
}

/**
 * Generates a cryptographically secure random hex token (used for reservation_token and verification_token)
 */
function generateSecureToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
  formatTicketNumber,
  normalizeTicketInput,
  generateSecureToken,
};

