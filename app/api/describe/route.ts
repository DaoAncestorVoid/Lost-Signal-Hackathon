import { NextResponse } from "next/server";
import { analyzeItem } from "@/lib/gemini";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const description = body.description;

    if (
      typeof description !== "string" ||
      !description.trim() ||
      description.length > 2000
    ) {
      return NextResponse.json(
        { error: "Invalid description" },
        { status: 400 }
      );
    }

    const analysis = await analyzeItem(description);

    return NextResponse.json({
      success: true,
      analysis,
    });

  } catch (error) {
    console.error("Gemini analysis failed:", error);

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error
        ? Number(error.status)
        : 500;

    if (status === 503) {
      return NextResponse.json(
        {
          success: false,
          error: "Gemini is temporarily overloaded. Please try again later.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to analyze item.",
      },
      { status: 500 }
    );
  }
}