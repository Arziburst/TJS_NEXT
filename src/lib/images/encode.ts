import sharp from "sharp";

/*
 * Product photos as they are stored: the type is read from the bytes, never from a file name or a header the
 * browser chose; the stored file is the uploaded picture turned upright and re-encoded without any metadata
 * (a phone photo carries EXIF, often the GPS position of where it was taken). Self-contained (no `@/` imports,
 * no `server-only`) so scripts/images/strip-metadata.mjs runs the same code under plain Node.
 */

/** The largest photo accepted, before and after re-encoding (a phone photo at full resolution). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
/** The most pixels decoded per photo (a 108 MP phone sensor), so a small file cannot unpack into gigabytes. */
export const MAX_IMAGE_PIXELS = 120_000_000;
/** Side of the blur placeholder, as in the legacy import and seed:images. */
export const BLUR_SIZE = 8;

export const IMAGE_TYPES = {
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" },
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

/** The photo type by its magic bytes (PNG, JPEG, WebP), or null for anything else. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  return null;
}

export type EncodedImage = {
  bytes: Buffer;
  type: ImageType;
  contentType: string;
  extension: string;
  width: number;
  height: number;
  blurDataUrl: string;
};

export type EncodeResult =
  | { ok: true; image: EncodedImage }
  | { ok: false; reason: "tooLarge" | "unsupportedType" | "invalidImage" };

/**
 * Checks an uploaded photo and prepares it for storage: size and type by content, decodable, at most
 * MAX_IMAGE_PIXELS; turned by its EXIF orientation, re-encoded in its own format at high quality (PNG
 * lossless) with every metadata block dropped; its displayed width and height and a blur placeholder.
 */
export async function encodeForStorage(input: Uint8Array): Promise<EncodeResult> {
  if (input.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: "tooLarge" };
  const type = detectImageType(input);
  if (!type) return { ok: false, reason: "unsupportedType" };
  try {
    // sharp drops EXIF, XMP, IPTC and the ICC profile (converting to sRGB) unless told to keep them
    const pipeline = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate();
    const encoded =
      type === "jpeg"
        ? pipeline.jpeg({ quality: 90, mozjpeg: true })
        : type === "webp"
          ? pipeline.webp({ quality: 90 })
          : pipeline.png({ compressionLevel: 9 });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    if (data.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: "tooLarge" };
    const blur = await sharp(data).resize(BLUR_SIZE, BLUR_SIZE, { fit: "inside" }).png().toBuffer();
    return {
      ok: true,
      image: {
        bytes: data,
        type,
        ...IMAGE_TYPES[type],
        width: info.width,
        height: info.height,
        blurDataUrl: `data:image/png;base64,${blur.toString("base64")}`,
      },
    };
  } catch {
    // not decodable, truncated, or more pixels than MAX_IMAGE_PIXELS
    return { ok: false, reason: "invalidImage" };
  }
}

export type MetadataReport = { exif: boolean; xmp: boolean; iptc: boolean; gps: boolean };

/** Which metadata blocks a stored photo carries, and whether its EXIF holds a GPS position. */
export async function readMetadata(input: Uint8Array): Promise<MetadataReport> {
  const meta = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  return {
    exif: meta.exif !== undefined,
    xmp: meta.xmp !== undefined,
    iptc: meta.iptc !== undefined,
    gps: meta.exif !== undefined && exifHasGpsPosition(meta.exif),
  };
}

const GPS_IFD_POINTER = 0x8825;
const GPS_LATITUDE = 0x0002;
const GPS_LONGITUDE = 0x0004;

/**
 * Whether an EXIF block (as sharp returns it: "Exif\0\0" and a TIFF structure) has a GPS IFD with a latitude
 * or a longitude. A GPS IFD with only its version tag holds no position.
 */
export function exifHasGpsPosition(exif: Uint8Array): boolean {
  const start = startsWith(exif, ascii("Exif\0\0")) ? 6 : 0;
  const view = new DataView(exif.buffer, exif.byteOffset + start, exif.byteLength - start);
  if (view.byteLength < 8) return false;
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return false;
  const little = order === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);

  const tags = (ifd: number): Map<number, number> => {
    const found = new Map<number, number>();
    if (ifd + 2 > view.byteLength) return found;
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      found.set(u16(entry), u32(entry + 8));
    }
    return found;
  };

  const gpsIfd = tags(u32(4)).get(GPS_IFD_POINTER);
  if (gpsIfd === undefined) return false;
  const gps = tags(gpsIfd);
  return gps.has(GPS_LATITUDE) || gps.has(GPS_LONGITUDE);
}
