
import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

function detectImage(buffer: Buffer): { ext: string; mime: string } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: ".jpg", mime: "image/jpeg" };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { ext: ".png", mime: "image/png" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { ext: ".webp", mime: "image/webp" };
  }
  return null;
}

async function uploadToCloudinary(
  buffer: Buffer,
  mime: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = "fasrod/products";
  const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash("sha1").update(toSign).digest("hex");
  const base64Data = `data:${mime};base64,${buffer.toString("base64")}`;

  const formData = new FormData();
  formData.append("file", base64Data);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", folder);
  formData.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: formData }
  );
  const json = await response.json();

  if (!response.ok || !json.secure_url) {
    throw new Error(json.error?.message || "Cloudinary upload failed");
  }
  return json.secure_url;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing_file" }, { status: 400 });
    }

    const maxUploadBytes =
      Number(process.env.CLOUDINARY_MAX_UPLOAD_BYTES) || DEFAULT_MAX_SIZE;

    if (file.size === 0 || file.size > maxUploadBytes) {
      return NextResponse.json({ error: "invalid_size" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectImage(buffer);

    if (!detected) {
      return NextResponse.json({ error: "invalid_image" }, { status: 400 });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (cloudName && apiKey && apiSecret) {
      const secureUrl = await uploadToCloudinary(
        buffer, detected.mime, cloudName, apiKey, apiSecret
      );
      return NextResponse.json({ ok: true, path: secureUrl }, { status: 201 });
    }

    // Never rely on Vercel's temporary filesystem for production images.
    if (process.env.NODE_ENV === "production") {
      console.error("Product image upload unavailable: Cloudinary is not configured.");
      return NextResponse.json(
        { error: "cloudinary_not_configured" },
        { status: 503 }
      );
    }

    // Local fallback is only for development.
    const directory = path.join(process.cwd(), "public", "products");
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}${detected.ext}`;
    await writeFile(path.join(directory, filename), buffer, { flag: "wx" });

    return NextResponse.json(
      { ok: true, path: `/products/${filename}` },
      { status: 201 }
    );
  } catch (error) {
    console.error("Product image upload failed:", error);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
