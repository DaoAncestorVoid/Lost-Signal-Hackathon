
import { NextResponse } from "next/server";
import { z } from "zod";
import { findMatches } from "@/lib/matching";
import type { Item } from "@/types/item";

const ItemSchema = z
  .object({
    id: z.string().min(1),
    reportType: z.enum(["lost", "found"]),
    status: z.enum(["open", "resolved"]),
    description: z.string().max(2000),
    title: z.string().max(200).optional(),
    itemDate: z.string().datetime({ offset: true }).nullable().optional(),
    category: z.string().max(100).optional(),
    color: z.string().max(100).optional(),
    brand: z.string().max(100).optional(),
    features: z.array(z.string().max(200)).max(20).optional(),
    location: z.string().max(200).optional(),
  }) satisfies z.ZodType<Item>;

const RequestSchema = z.object({
  source: ItemSchema,
  candidates: z.array(ItemSchema).max(25),
});

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid matching request",
        },
        { status: 400 }
      );
    }

    const { source, candidates } = parsed.data;

    const matches = findMatches(source, candidates, {
      minScore: 30,
      limit: 10,
    });

    return NextResponse.json({
      success: true,
      count: matches.length,
      matches,
    });
  } catch (error) {
    console.error("Matching error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to calculate matches",
      },
      { status: 500 }
    );
  }
}
