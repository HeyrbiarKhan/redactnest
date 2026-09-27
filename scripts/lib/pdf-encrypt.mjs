/**
 * The PDF standard security handler, written out by hand for the fixtures.
 *
 * Spec 0004, AC-10: a document that opens without a password but carries an
 * owner password is redacted, and the output is unencrypted and unrestricted.
 * The fixtures that prove it are encrypted here with `node:crypto` rather than
 * by MuPDF, so the engine never authors a file it is tested on.
 *
 * Three schemes, the ones real files use:
 *
 *   - `rc4`:     V 2, R 3, 128 bit RC4
 *   - `aes-128`: V 4, R 4, AESV2
 *   - `aes-256`: V 5, R 6, AESV3
 *
 * Each has an empty user password, so the file opens for anyone, and an owner
 * password with editing forbidden. Only stream data is encrypted: the fixtures
 * put every string they carry inside a stream, which keeps this to the
 * algorithms and away from parsing dictionaries.
 *
 * Deterministic on purpose. Keys, salts and IVs are derived from fixed seeds,
 * so running the fixture script again writes the same bytes and a reviewer can
 * diff the result. That is fine for a fixture and wrong for anything real.
 */

import { createCipheriv, createHash } from "node:crypto";

import { stream } from "./pdf-writer.mjs";

/** Algorithm 2's padding string, PDF 32000 7.6.4.3. */
const PAD = Buffer.from(
  "28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a",
  "hex",
);

/** Print, copy, fill forms, accessibility, assemble and print well; no editing. */
export const OWNER_ONLY_PERMISSIONS = -44;

const OWNER_PASSWORD = Buffer.from("owner-secret", "latin1");
const USER_PASSWORD = Buffer.alloc(0);

const md5 = (...parts) => createHash("md5").update(Buffer.concat(parts)).digest();
const sha = (bits, data) => createHash(`sha${bits}`).update(data).digest();

/** RC4, which OpenSSL 3 no longer offers by default. A few lines of its own. */
function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }

  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let index = 0; index < data.length; index += 1) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    out[index] = data[index] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

function aesCbc(bits, key, iv, data, padding) {
  const cipher = createCipheriv(`aes-${bits}-cbc`, key, iv);
  cipher.setAutoPadding(padding);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

function int32le(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeInt32LE(value);
  return bytes;
}

/** A fixed IV per object, so the fixture is reproducible. */
function ivFor(num) {
  return md5(Buffer.from(`RedactNest fixture IV ${num}`, "latin1"));
}

/** Algorithms 2, 3 and 5, for R 3 and R 4: the key, and the O and U entries. */
function legacyHandler(revision, id, permissions) {
  const length = 16;

  // Algorithm 3: the O entry.
  let ownerHash = md5(Buffer.concat([OWNER_PASSWORD, PAD]).subarray(0, 32));
  for (let round = 0; round < 50; round += 1)
    ownerHash = md5(ownerHash.subarray(0, length));
  const ownerKey = ownerHash.subarray(0, length);
  let owner = rc4(ownerKey, Buffer.concat([USER_PASSWORD, PAD]).subarray(0, 32));
  for (let round = 1; round <= 19; round += 1) {
    owner = rc4(
      ownerKey.map((byte) => byte ^ round),
      owner,
    );
  }

  // Algorithm 2: the file key.
  let keyHash = md5(
    Buffer.concat([USER_PASSWORD, PAD]).subarray(0, 32),
    owner,
    int32le(permissions),
    id,
  );
  for (let round = 0; round < 50; round += 1) keyHash = md5(keyHash.subarray(0, length));
  const key = keyHash.subarray(0, length);

  // Algorithm 5: the U entry.
  let user = rc4(key, md5(PAD, id));
  for (let round = 1; round <= 19; round += 1) {
    user = rc4(
      key.map((byte) => byte ^ round),
      user,
    );
  }
  user = Buffer.concat([user, Buffer.alloc(16)]);

  return { key, owner, user, revision };
}

/** Algorithm 2.B, the R 6 password hash. */
function hash2B(password, salt, userEntry) {
  let k = sha(256, Buffer.concat([password, salt, userEntry]));
  let e = Buffer.alloc(0);

  for (let round = 0; round < 64 || e[e.length - 1] > round - 32; round += 1) {
    const k1 = Buffer.concat(Array(64).fill(Buffer.concat([password, k, userEntry])));
    e = aesCbc(128, k.subarray(0, 16), k.subarray(16, 32), k1, false);
    const remainder = [...e.subarray(0, 16)].reduce((sum, byte) => sum + byte, 0) % 3;
    k = sha([256, 384, 512][remainder], e);
  }
  return k.subarray(0, 32);
}

/** Algorithms 8, 9 and 10: the R 6 key and its five entries. */
function aes256Handler(permissions) {
  const key = sha(256, Buffer.from("RedactNest AES-256 fixture key", "latin1"));
  const seed = sha(512, Buffer.from("RedactNest AES-256 fixture salts", "latin1"));
  const [userValidation, userKeySalt, ownerValidation, ownerKeySalt] = [0, 8, 16, 24].map(
    (at) => seed.subarray(at, at + 8),
  );
  const zeroIv = Buffer.alloc(16);

  const user = Buffer.concat([
    hash2B(USER_PASSWORD, userValidation, Buffer.alloc(0)),
    userValidation,
    userKeySalt,
  ]);
  const userEncrypted = aesCbc(
    256,
    hash2B(USER_PASSWORD, userKeySalt, Buffer.alloc(0)),
    zeroIv,
    key,
    false,
  );

  const owner = Buffer.concat([
    hash2B(OWNER_PASSWORD, ownerValidation, user),
    ownerValidation,
    ownerKeySalt,
  ]);
  const ownerEncrypted = aesCbc(
    256,
    hash2B(OWNER_PASSWORD, ownerKeySalt, user),
    zeroIv,
    key,
    false,
  );

  const perms = Buffer.concat([
    int32le(permissions),
    Buffer.from([0xff, 0xff, 0xff, 0xff]),
    Buffer.from("Tadb", "latin1"),
    seed.subarray(32, 36),
  ]);
  const cipher = createCipheriv("aes-256-ecb", key, null);
  cipher.setAutoPadding(false);
  const permsEncrypted = Buffer.concat([cipher.update(perms), cipher.final()]);

  return { key, owner, user, ownerEncrypted, userEncrypted, permsEncrypted };
}

const hex = (bytes) => `<${Buffer.from(bytes).toString("hex")}>`;

/**
 * Encrypt a fixture's objects under `scheme`.
 *
 * `objects[i]` is object `i + 1`, exactly as `writePdf` numbers them. Returns
 * the objects with every stream's data encrypted and the Encrypt dictionary
 * appended, plus the trailer entries the file needs (`/Encrypt` and `/ID`).
 */
export function encryptObjects(objects, scheme, permissions = OWNER_ONLY_PERMISSIONS) {
  const id = md5(Buffer.from(`RedactNest ${scheme} fixture`, "latin1"));
  const encryptNum = objects.length + 1;

  let encryptStream;
  let encryptDict;

  if (scheme === "aes-256") {
    const handler = aes256Handler(permissions);
    encryptStream = (num, data) =>
      Buffer.concat([ivFor(num), aesCbc(256, handler.key, ivFor(num), data, true)]);
    encryptDict =
      "<< /Filter /Standard /V 5 /R 6 /Length 256 " +
      "/CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV3 /Length 32 >> >> /StmF /StdCF /StrF /StdCF " +
      `/O ${hex(handler.owner)} /U ${hex(handler.user)} /OE ${hex(handler.ownerEncrypted)} ` +
      `/UE ${hex(handler.userEncrypted)} /P ${permissions} /Perms ${hex(handler.permsEncrypted)} >>`;
  } else {
    const aes = scheme === "aes-128";
    const handler = legacyHandler(aes ? 4 : 3, id, permissions);
    const objectKey = (num) =>
      md5(
        handler.key,
        Buffer.from([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, 0, 0]),
        aes ? Buffer.from("sAlT", "latin1") : Buffer.alloc(0),
      ).subarray(0, Math.min(handler.key.length + 5, 16));

    encryptStream = aes
      ? (num, data) =>
          Buffer.concat([ivFor(num), aesCbc(128, objectKey(num), ivFor(num), data, true)])
      : (num, data) => rc4(objectKey(num), data);
    encryptDict = aes
      ? "<< /Filter /Standard /V 4 /R 4 /Length 128 " +
        "/CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV2 /Length 16 >> >> /StmF /StdCF /StrF /StdCF " +
        `/O ${hex(handler.owner)} /U ${hex(handler.user)} /P ${permissions} >>`
      : "<< /Filter /Standard /V 2 /R 3 /Length 128 " +
        `/O ${hex(handler.owner)} /U ${hex(handler.user)} /P ${permissions} >>`;
  }

  const encrypted = objects.map((body, index) =>
    typeof body === "string"
      ? body
      : stream(body.dict, encryptStream(index + 1, Buffer.from(body.data))),
  );

  return {
    objects: [...encrypted, encryptDict],
    trailer: `/Encrypt ${encryptNum} 0 R /ID [${hex(id)} ${hex(id)}]`,
  };
}
