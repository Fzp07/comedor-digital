"use client";

const KEY_STORAGE = "comedor.device.key.v1";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function getDeviceKey(): Promise<CryptoKey> {
  const stored = window.localStorage.getItem(KEY_STORAGE);
  if (stored) {
    return crypto.subtle.importKey("raw", base64ToBytes(stored), "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  const raw = crypto.getRandomValues(new Uint8Array(32));
  window.localStorage.setItem(KEY_STORAGE, bytesToBase64(raw));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptText(plain: string): Promise<string> {
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

export async function decryptText(payload: string): Promise<string> {
  const [ivPart, cipherPart] = payload.split(".");
  if (!ivPart || !cipherPart) throw new Error("Formato de caché inválido");
  const key = await getDeviceKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivPart) },
    key,
    base64ToBytes(cipherPart),
  );
  return new TextDecoder().decode(plain);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
