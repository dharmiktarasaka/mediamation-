import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'fallback-secret-key-1234567890').digest();

/**
 * Encrypts plain text if not already encrypted.
 * Returns format "iv_hex:ciphertext_hex"
 */
export function encrypt(text) {
  if (!text) return '';
  // Check if already encrypted to avoid double encryption
  if (/^[a-f0-9]{32}:[a-f0-9]+$/.test(text)) {
    return text;
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts encrypted text back to plain text.
 * Safely returns the input if not encrypted or decryption fails.
 */
export function decrypt(encryptedText) {
  if (!encryptedText) return '';
  if (!/^[a-f0-9]{32}:[a-f0-9]+$/.test(encryptedText)) {
    return encryptedText;
  }
  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Crypto Decrypt Error]', err.message);
    return encryptedText;
  }
}
