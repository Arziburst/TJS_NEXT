// The legacy importer's photos (#90): stored as the admin upload stores them, and recognised again on a re-run.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { currentImageOf, encodeLegacyPhoto } from "../../scripts/import/legacy-catalogue.mjs";
import { readMetadata } from "@/lib/images/encode";

/** A sideways phone photo (EXIF orientation 6) with a GPS position, as one legacy photo is. */
async function sidewaysPhotoWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 32, channels: 3, background: { r: 230, g: 120, b: 90 } } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 27/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "30/1 31/1 0/1" } })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

describe("encodeLegacyPhoto", () => {
  it("turns a photo upright and drops its metadata, GPS included", async () => {
    const original = await sidewaysPhotoWithGps();
    expect(await readMetadata(original)).toMatchObject({ exif: true, gps: true });

    const photo = await encodeLegacyPhoto(original, { publicId: "oldsc94wylzdo7nfrniw", fileName: "oldsc94wylzdo7nfrniw.jpg" });

    expect(await readMetadata(photo.bytes)).toEqual({ exif: false, xmp: false, iptc: false, gps: false });
    expect((await sharp(photo.bytes).metadata()).orientation).toBeUndefined();
    expect([photo.width, photo.height]).toEqual([32, 64]);
    expect(photo).toMatchObject({ contentType: "image/jpeg", fileName: "oldsc94wylzdo7nfrniw.jpg" });
    expect(photo.blurDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("names the file by its encoded format and refuses a file that is no photo", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).png().toBuffer();
    // an archive file named .jpg that holds a PNG is stored as the PNG it is
    expect((await encodeLegacyPhoto(png, { publicId: "x", fileName: "x.jpg" })).fileName).toBe("x.png");
    await expect(encodeLegacyPhoto(Buffer.from("not a photo"), { publicId: "y", fileName: "y.jpg" })).rejects.toThrow(
      "y.jpg: cannot be stored (unsupportedType)",
    );
  });
});

describe("currentImageOf", () => {
  const productId = "0b5c2a6e-0000-4000-8000-000000000001";
  const other = "0b5c2a6e-0000-4000-8000-000000000002";
  const planned = (position: number) => ({ storage_path: `legacy/${productId}/${position + 1}-p${position}.jpg`, position });
  const plannedPaths = new Set([planned(0).storage_path, planned(1).storage_path]);
  const row = (product_id: string, storage_path: string, position: number) => ({ id: storage_path, product_id, storage_path, position });

  it("finds a photo at its legacy path", () => {
    const rows = new Map([[planned(1).storage_path, row(productId, planned(1).storage_path, 1)]]);
    expect(currentImageOf(planned(1), rows, plannedPaths, productId)?.id).toBe(planned(1).storage_path);
  });

  it("finds a photo strip-metadata moved to a new file in the product's folder, at its position", () => {
    const moved = row(productId, `legacy/${productId}/7a3e0c1d-2b4f-4c5d-9e8f-0123456789ab.jpg`, 0);
    const rows = new Map([
      [planned(1).storage_path, row(productId, planned(1).storage_path, 1)],
      [moved.storage_path, moved],
    ]);
    expect(currentImageOf(planned(0), rows, plannedPaths, productId)).toBe(moved);
  });

  it("is new when no such row exists: another product's file, another photo's path or another position", () => {
    const rows = new Map(
      [
        row(other, `legacy/${other}/7a3e0c1d-2b4f-4c5d-9e8f-0123456789ab.jpg`, 0),
        // the second photo, moved to the first position in the admin: still the second photo
        row(productId, planned(1).storage_path, 0),
        row(productId, `legacy/${productId}/9f9f0c1d-2b4f-4c5d-9e8f-0123456789ab.jpg`, 5),
        row(productId, `products/${productId}/1d2e0c1d-2b4f-4c5d-9e8f-0123456789ab.jpg`, 0),
      ].map((r) => [r.storage_path, r]),
    );
    expect(currentImageOf(planned(0), rows, plannedPaths, productId)).toBeUndefined();
  });
});
