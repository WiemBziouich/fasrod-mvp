import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024;

function detectImage(buffer: Buffer): string | null {
  // JPEG
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return ".jpg";
  }

  // PNG
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) {
    return ".png";
  }

  // WebP
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return ".webp";
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "missing_file" },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "invalid_size" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = detectImage(buffer);

    if (!extension) {
      return NextResponse.json(
        { error: "invalid_image" },
        { status: 400 }
      );
    }

    const directory = path.join(
      process.cwd(),
      "public",
      "products"
    );

    await mkdir(directory, { recursive: true });

    const filename = `${randomUUID()}${extension}`;
    const destination = path.join(directory, filename);

    await writeFile(destination, buffer, { flag: "wx" });

    return NextResponse.json(
      { ok: true, path: `/products/${filename}` },
      { status: 201 }
    );
  } catch (error) {
    console.error("Product image upload failed:", error);

    return NextResponse.json(
      { error: "upload_failed" },
      { status: 500 }
    );
  }
}