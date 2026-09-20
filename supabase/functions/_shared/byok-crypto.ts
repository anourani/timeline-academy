// AES-256-GCM for the BYOK keys stored against an account.
//
// The encryption key lives in the BYOK_ENCRYPTION_KEY function secret and
// nowhere else — not in the database, not in any file, not in the client
// bundle. So a database dump on its own yields nothing readable, which is the
// whole point of storing ciphertext rather than the key.
//
// Rotating the secret invalidates every stored key: there is no key-id column
// and no second slot to decrypt against. That is a deliberate trade for a
// simpler table. Callers must treat a decrypt failure as "no key for this
// provider" rather than an error, so a rotation degrades to "users re-add
// their key" instead of a site-wide 500.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** GCM's standard nonce length. 12 bytes, fresh per write, never reused. */
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The AES key from BYOK_ENCRYPTION_KEY, or null when the secret is unset or
 * malformed.
 *
 * Returns null rather than throwing so the function can answer 503 with a
 * message that names the real cause. The secret is base64 of exactly 32 bytes
 * (`openssl rand -base64 32`); anything else is a misconfiguration we would
 * rather surface immediately than discover as a decrypt failure later.
 */
export async function loadByokKey(): Promise<CryptoKey | null> {
  const raw = Deno.env.get("BYOK_ENCRYPTION_KEY");
  if (!raw) return null;

  let bytes: Uint8Array;
  try {
    bytes = fromBase64(raw.trim());
  } catch {
    console.error("BYOK_ENCRYPTION_KEY is not valid base64.");
    return null;
  }
  if (bytes.length !== 32) {
    console.error(
      `BYOK_ENCRYPTION_KEY must decode to 32 bytes, got ${bytes.length}.`
    );
    return null;
  }

  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * `aad` is additional authenticated data: not encrypted, but covered by the
 * auth tag. We pass `${userId}:${provider}`, which binds a ciphertext to the
 * row it belongs to — copying one user's ciphertext into another user's row
 * (or from their Anthropic slot into their OpenAI slot) fails authentication
 * instead of decrypting to a usable key.
 */
export async function encryptSecret(
  key: CryptoKey,
  plaintext: string,
  aad: string
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
    key,
    encoder.encode(plaintext)
  );
  return {
    // WebCrypto appends the 16-byte auth tag to the ciphertext, so this one
    // column carries both.
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  };
}

/** Throws on a wrong key, a tampered ciphertext, or a mismatched `aad`. */
export async function decryptSecret(
  key: CryptoKey,
  ciphertext: string,
  iv: string,
  aad: string
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(iv),
      additionalData: encoder.encode(aad),
    },
    key,
    fromBase64(ciphertext)
  );
  return decoder.decode(decrypted);
}
