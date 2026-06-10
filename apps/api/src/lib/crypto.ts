import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'crm-encryption-key-change-in-prod-32chars!';

export function encrypt(text: string): string {
  if (!text) return '';
  const key = Buffer.concat([Buffer.from(ENCRYPTION_KEY)], 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
  if (!text) return '';
  try {
    const key = Buffer.concat([Buffer.from(ENCRYPTION_KEY)], 32);
    const textParts = text.split(':');
    if (textParts.length < 2) {
      // If it doesn't contain a colon, it's not encrypted or is malformed
      return text;
    }
    const iv = Buffer.from(textParts.shift() || '', 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    const decryptedUpdate = decipher.update(encryptedText);
    const decryptedFinal = decipher.final();
    return Buffer.concat([decryptedUpdate, decryptedFinal]).toString('utf8');
  } catch (err) {
    console.error('[Crypto] Decryption failed, returning raw text:', err);
    return text;
  }
}
