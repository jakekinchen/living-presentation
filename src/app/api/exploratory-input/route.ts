import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

interface ExploratorySlide {
  headline: string;
  subheadline?: string;
  bullets?: string[];
  visualDescription: string;
  category: string;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_API_KEY environment variable" },
        { status: 500 }
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const body = await request.json();
    const {
      prompt,
      currentSlide,
      transcriptContext,
      slideHistoryContext,
      uploadedSlidesContext,
      audienceContext,
    } = body as {
      prompt?: string;
      currentSlide?: {
        headline?: string;
        subheadline?: string;
        bullets?: string[];
        visualDescription?: string;
        category?: string;
      } | null;
      transcriptContext?: string;
      slideHistoryContext?: string;
      uploadedSlidesContext?: string;
      audienceContext?: string;
    };

    const trimmedPrompt = (prompt || "").trim();
    if (!trimmedPrompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const slideContext = currentSlide
      ? `\n\nCURRENT SLIDE (being presented):
- Headline: ${currentSlide.headline || "Untitled"}
${currentSlide.subheadline ? `- Subheadline: ${currentSlide.subheadline}` : ""}${
          currentSlide.bullets && currentSlide.bullets.length
            ? `\n- Bullets: ${currentSlide.bullets.join("; ")}`
            : ""
        }${
          currentSlide.visualDescription
            ? `\n- Visual summary: ${currentSlide.visualDescription}`
            : ""
        }
- Category: ${currentSlide.category || "concept"}`
      : "";

    const transcriptInfo = transcriptContext
      ? `\n\nLIVE TRANSCRIPT CONTEXT (recent narration from the presenter):
${transcriptContext}`
      : "";

    const historyInfo = slideHistoryContext
      ? `\n\nSLIDE HISTORY (what has already been covered):
${slideHistoryContext}`
      : "";

    const uploadedInfo = uploadedSlidesContext
      ? `\n\nUPLOADED DECK CONTEXT (slides from the deck that may not have been shown yet):
${uploadedSlidesContext}`
      : "";

    const audienceInfo = audienceContext
      ? `\n\nAUDIENCE CONTEXT (questions or feedback themes):
${audienceContext}`
      : "";

    // Detect if this is the first slide (no history, no current slide)
    const isFirstSlide = !currentSlide && !slideHistoryContext?.trim();

    const introSlidePrompt = `You are a presentation title slide designer.

The PRESENTER wants to start a presentation about:
"${trimmedPrompt}"

Your job is to create ONE compelling INTRO/TITLE SLIDE that:
- Has a powerful, concise title (3-7 words) that captures the essence of the topic
- Has an engaging subtitle that hints at what the presentation will cover
- Does NOT have any bullet points (this is a title slide)
- Has a visualDescription for a dramatic, professional title slide background image related to the topic

The intro slide should feel like the opening of a TED talk - bold, intriguing, and visually striking.

Respond with a JSON object of the form:
{
  "followups": [
    {
      "headline": "The powerful title",
      "subheadline": "An engaging subtitle",
      "bullets": [],
      "visualDescription": "A dramatic visual description for the title slide background - abstract, professional, evocative of the topic",
      "category": "intro"
    }
  ]
}

Return ONLY ONE slide. DO NOT wrap the JSON in markdown.`;

    const followUpSlidePrompt = `You are an exploratory presentation assistant.

The PRESENTER has just typed the following idea or direction they want to explore next:
"${trimmedPrompt}"

Your job is to propose 1–2 powerful NEXT SLIDES that:
- Are primarily driven by this typed idea
- But also thoughtfully use the surrounding context (current slide, previous slides, uploaded deck, live transcript, audience signals) when it's genuinely helpful
- Extend the narrative forward rather than repeating what has already been shown

CONTEXT YOU MAY USE (ONLY when relevant):${slideContext}${historyInfo}${uploadedInfo}${audienceInfo}${transcriptInfo}

Design slides that feel like the natural "next move" in this presentation.

Each slide you return should:
- Have a clear, compelling headline (5–10 words)
- Optionally have a subheadline
- Optionally include 2–4 concise bullets
- Include a visualDescription describing the ideal visual/diagram/imagery
- Have a category such as "concept", "deep-dive", "example", "framework", "process", "next-steps", or "summary"

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

Limit to at most 2 slides and DO NOT wrap the JSON in markdown.`;

    const systemPrompt = isFirstSlide ? introSlidePrompt : followUpSlidePrompt;

    const result = await model.generateContent(systemPrompt);
    const response = result.response;
    const text = response.text();

    let parsed: { followups?: ExploratorySlide[] };
    try {
      parsed = JSON.parse(text) as { followups?: ExploratorySlide[] };
    } catch {
      parsed = {
        followups: [
          {
            headline: trimmedPrompt.slice(0, 60),
            subheadline: "Exploratory slide based on presenter's idea",
            bullets: [text.slice(0, 200)],
            visualDescription:
              "An exploratory slide that extends the presenter's typed idea using the broader presentation context",
            category: "concept",
          },
        ],
      };
    }

    const followups = parsed.followups || [];
    const cleanedFollowups = followups
      .filter((f) => f && typeof f.headline === "string")
      .slice(0, 2);

    return NextResponse.json({
      success: true,
      followups: cleanedFollowups,
    });
  } catch (error) {
    console.error("Exploratory input API error:", error);
    return NextResponse.json(
      {
        success: false,
        followups: [],
        error: "Failed to generate exploratory slides from input",
      },
      { status: 500 }
    );
  }
}
