import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

interface FollowupSlide {
  headline: string;
  subheadline?: string;
  bullets?: string[];
  visualDescription: string;
  category: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      currentSlide,
      presentationContext,
      transcriptContext,
    } = body as {
      currentSlide?: {
        headline?: string;
        subheadline?: string;
        bullets?: string[];
        visualDescription?: string;
        category?: string;
        source?: string;
      };
      presentationContext?: string;
      transcriptContext?: string;
    };

    if (!currentSlide || !currentSlide.headline) {
      return NextResponse.json(
        { error: "currentSlide.headline is required" },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const bulletsText =
      currentSlide.bullets && currentSlide.bullets.length > 0
        ? `\n- Bullets: ${currentSlide.bullets.join("; ")}`
        : "";

    const visualText = currentSlide.visualDescription
      ? `\n- Visual summary: ${currentSlide.visualDescription}`
      : "";

    const slideCategory = currentSlide.category || "concept";

    const slideContextInfo = presentationContext
      ? `\n\nRECENT PRESENTATION CONTEXT (previous slides):\n${presentationContext}`
      : "";

    const transcriptInfo = transcriptContext
      ? `\n\nLIVE TRANSCRIPT CONTEXT (recent speaker narration):\n${transcriptContext}`
      : "";

    const prompt = `You are helping a presenter extend an existing slide deck.

CURRENT SLIDE (shown right now):
- Headline: ${currentSlide.headline}
${currentSlide.subheadline ? `- Subheadline: ${currentSlide.subheadline}` : ""}${bulletsText}${visualText}
- Category: ${slideCategory}${slideContextInfo}${transcriptInfo}

Your job is to propose 1-2 HIGH-VALUE NEXT SLIDES that would logically follow from the current slide. These slides should:
- Deepen the idea, provide concrete examples, or introduce a simple framework
- Stay tightly connected to the current slide's topic
- Avoid simply restating the current slide
- Feel like natural “next steps” if the presenter had more time or wanted to go deeper

Each follow-up slide should:
- Have a clear headline (5-10 words)
- Optionally have a subheadline
- Optionally include 2-4 bullets
- Include a visualDescription describing what visuals/diagram/imagery would best support it
- Have a category such as "concept", "deep-dive", "example", "framework", "process", or "next-steps"

Respond with a JSON object of the form:
{
  "followups": [
    {
      "headline": "...",
      "subheadline": "...",
      "bullets": ["...", "..."],
      "visualDescription": "...",
      "category": "..."
    }
  ]
}

Limit to at most 2 follow-up slides.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    let parsed: { followups?: FollowupSlide[] };
    try {
      parsed = JSON.parse(text) as { followups?: FollowupSlide[] };
    } catch {
      // Fallback: treat the whole response as one bullet point on a single slide
      parsed = {
        followups: [
          {
            headline: `Next step after "${currentSlide.headline}"`,
            subheadline: currentSlide.subheadline,
            bullets: [text.slice(0, 200)],
            visualDescription:
              "A follow-up slide that continues the story from the current slide",
            category: slideCategory,
          },
        ],
      };
    }

    const followups = parsed.followups || [];

    // Filter out any obviously invalid entries
    const cleanedFollowups = followups
      .filter((f) => f && typeof f.headline === "string")
      .slice(0, 2);

    return NextResponse.json({
      success: true,
      followups: cleanedFollowups,
    });
  } catch (error) {
    console.error("Slide follow-ups API error:", error);
    return NextResponse.json(
      {
        success: false,
        followups: [],
        error: "Failed to generate follow-up slides",
      },
      { status: 500 }
    );
  }
}
