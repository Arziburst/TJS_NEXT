import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  detectImageType,
  encodeForStorage,
  exifHasGpsPosition,
  readMetadata,
} from "./encode";

const GPS_EXIF = {
  IFD0: { Make: "Phone", Model: "Camera" },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 27/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "30/1 31/1 0/1" },
};

function picture(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 90 } } });
}

/** A 40×20 phone-like JPEG stored sideways (EXIF orientation 6: shown turned a quarter, 20×40) with GPS. */
async function phoneJpeg(): Promise<Buffer> {
  return picture(40, 20).jpeg().withExif(GPS_EXIF).withMetadata({ orientation: 6 }).toBuffer();
}

// a Windows executable renamed to photo.jpg: its bytes start with "MZ"
const EXE = Buffer.concat([Buffer.from("MZ\x90\x00\x03\x00\x00\x00", "latin1"), Buffer.alloc(512)]);

describe("detectImageType", () => {
  it("reads PNG, JPEG and WebP by their magic bytes", async () => {
    expect(detectImageType(await picture(4, 4).png().toBuffer())).toBe("png");
    expect(detectImageType(await picture(4, 4).jpeg().toBuffer())).toBe("jpeg");
    expect(detectImageType(await picture(4, 4).webp().toBuffer())).toBe("webp");
  });

  it("refuses everything else, whatever its name", async () => {
    expect(detectImageType(EXE)).toBeNull();
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(await picture(4, 4).gif().toBuffer())).toBeNull();
    expect(detectImageType(await picture(4, 4).avif().toBuffer())).toBeNull();
    expect(detectImageType(Buffer.from("RIFF\0\0\0\0WAVE"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("encodeForStorage", () => {
  it("refuses a renamed executable", async () => {
    expect(await encodeForStorage(EXE)).toEqual({ ok: false, reason: "unsupportedType" });
  });

  it("refuses a file over the limit before decoding it", async () => {
    const jpeg = await picture(8, 8).jpeg().toBuffer();
    const oversize = Buffer.concat([jpeg, Buffer.alloc(MAX_IMAGE_BYTES + 1 - jpeg.byteLength)]);
    expect(oversize.byteLength).toBe(MAX_IMAGE_BYTES + 1);
    expect(await encodeForStorage(oversize)).toEqual({ ok: false, reason: "tooLarge" });
  });

  it("refuses a truncated photo", async () => {
    const jpeg = await picture(64, 64).jpeg().toBuffer();
    expect(await encodeForStorage(jpeg.subarray(0, 40))).toEqual({ ok: false, reason: "invalidImage" });
  });

  it("refuses more pixels than it decodes", async () => {
    // 11000 × 11000 = 121 MP, a few kilobytes as PNG
    const huge = await sharp({ create: { width: 11_000, height: 11_000, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    expect(huge.byteLength).toBeLessThan(MAX_IMAGE_BYTES);
    expect(await encodeForStorage(huge)).toEqual({ ok: false, reason: "invalidImage" });
  });

  it("turns a phone photo upright and drops its EXIF and GPS", async () => {
    const input = await phoneJpeg();
    expect(await readMetadata(input)).toMatchObject({ exif: true, gps: true });

    const result = await encodeForStorage(input);
    if (!result.ok) throw new Error(result.reason);
    const { image } = result;
    expect(image).toMatchObject({ type: "jpeg", contentType: "image/jpeg", extension: "jpg", width: 20, height: 40 });
    expect(await readMetadata(image.bytes)).toEqual({ exif: false, xmp: false, iptc: false, gps: false });
    const stored = await sharp(image.bytes).metadata();
    expect([stored.width, stored.height, stored.orientation]).toEqual([20, 40, undefined]);
    expect(image.blurDataUrl).toMatch(/^data:image\/png;base64,/);
    // the blur keeps the photo's shape: 4×8 for a 20×40 photo
    const blur = await sharp(Buffer.from(image.blurDataUrl.split(",")[1]!, "base64")).metadata();
    expect([blur.width, blur.height]).toEqual([4, 8]);
    // the column of product_images allows 4096 characters
    expect(image.blurDataUrl.length).toBeLessThanOrEqual(4096);
  });

  it("keeps PNG and WebP in their format", async () => {
    for (const format of ["png", "webp"] as const) {
      const input = await picture(30, 10)[format]().withExif(GPS_EXIF).toBuffer();
      const result = await encodeForStorage(input);
      if (!result.ok) throw new Error(result.reason);
      expect(result.image).toMatchObject({ type: format, width: 30, height: 10 });
      expect(detectImageType(result.image.bytes)).toBe(format);
      expect((await readMetadata(result.image.bytes)).exif).toBe(false);
    }
  });
});

describe("exifHasGpsPosition", () => {
  it("finds a position, and none in EXIF without GPS", async () => {
    const withGps = await sharp(await phoneJpeg()).metadata();
    expect(exifHasGpsPosition(withGps.exif!)).toBe(true);
    const withoutGps = await sharp(await picture(4, 4).jpeg().withExif({ IFD0: { Make: "Phone" } }).toBuffer()).metadata();
    expect(exifHasGpsPosition(withoutGps.exif!)).toBe(false);
  });

  it("does not trip over a broken block", () => {
    expect(exifHasGpsPosition(Buffer.from("Exif\0\0II*\0\xff\xff\xff\x7f", "latin1"))).toBe(false);
    expect(exifHasGpsPosition(new Uint8Array(3))).toBe(false);
  });
});
