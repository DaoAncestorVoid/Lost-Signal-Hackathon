
import { NextResponse } from "next/server";
import { analyzeImage } from "@/lib/gemini";



const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_SIZE = 4 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "An image is required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(image.type)) {
      return NextResponse.json(
        { error: "Unsupported image format" },
        { status: 400 }
      );
    }

    if (image.size === 0 || image.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Image must be under 4 MB" },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const attributes = await analyzeImage(
      base64,
      image.type
    );

    return NextResponse.json({
      success: true,
      attributes,
    });
  } catch (error) {
    const apiError = error as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = apiError.status ?? apiError.statusCode ?? 500;

    if (status === 429) {
      return NextResponse.json(
        {
          success: false,
          error: "Gemini API quota exceeded. Try again later.",
        },
        { status: 429 }
      );
    }

    if (status === 503) {
      return NextResponse.json(
        {
          success: false,
          error: "Gemini is temporarily overloaded.",
        },
        { status: 503 }
      );
    }

    console.error("Image analysis failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Image analysis failed",
      },
      { status: 500 }
    );
  }
}
