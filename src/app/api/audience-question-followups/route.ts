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
      question,
      answer,
      presentationContext,
    } = body as {
      question?: string;
      answer?: {
        headline?: string;
        subheadline?: string;
        bullets?: string[];
        visualDescription?: string;
        category?: string;
      };
      presentationContext?: string;
    };

    if (!question || !question.trim()) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const contextInfo = presentationContext
      ? `\n\nRECENT PRESENTATION CONTEXT:\n${presentationContext}`
      : "";

    const answerSummary = answer
      ? `\n\nANSWER SLIDE SUMMARY:
- Headline: ${answer.headline || "N/A"}
- Subheadline: ${answer.subheadline || "N/A"}
- Key points: ${
          answer.bullets && answer.bullets.length > 0
            ? answer.bullets.join("; ")
            : "N/A"
        }
- Visual focus: ${answer.visualDescription || "N/A"}
- Category: ${answer.category || "N/A"}`
      : "";

    const prompt = `You are helping a presenter create follow-up slides that build on a live audience Q&A.

AUDIENCE QUESTION: "${question.trim()}"${answerSummary}${contextInfo}

The presenter has just shown an answer slide for this question. Now you should propose 1-2 FOLLOW-UP SLIDES that:
- Go deeper on the most interesting or valuable aspect of the answer
- Provide concrete examples, frameworks, or visuals
- Stay tightly focused on the original question and answer

Each follow-up slide should:
- Have a clear headline (5-10 words)
- Optionally have a subheadline
- Optionally include 2-4 bullets
- Include a visualDescription describing what visuals/diagram/imagery would best support it
- Have a category such as "deep-dive", "example", "framework", "implication", or "next-steps"

Do NOT repeat the original answer slide. Extend it.

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
            headline: "Follow-up on the audience question",
            subheadline: question.trim(),
            bullets: [text.slice(0, 200)],
            visualDescription:
              "A follow-up slide expanding on the audience question answer",
            category: "deep-dive",
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
    console.error("Audience question follow-ups API error:", error);
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

