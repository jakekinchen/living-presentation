import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

interface SlideHistoryEntry {
  headline: string;
  visualDescription: string;
  category: string;
}

interface QuestionGateResponse {
  accept: boolean;
  reason: string;
  normalizedQuestion: string;
  category: string;
  priority: "low" | "normal" | "high";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      question,
      slideHistory = [],
    } = body as {
      question?: string;
      slideHistory?: SlideHistoryEntry[];
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

    const slideHistoryText =
      slideHistory && slideHistory.length > 0
        ? `\n\nRECENT PRESENTATION SLIDES:\n${slideHistory
            .slice(-5)
            .map(
              (s, i) =>
                `${i + 1}. "${s.headline}" (${s.category}) - ${s.visualDescription.slice(
                  0,
                  80
                )}...`
            )
            .join("\n")}`
        : "";

    const prompt = `You are helping a presenter triage live audience questions during a presentation.

AUDIENCE QUESTION: "${question.trim()}"${slideHistoryText}

Your job is to decide whether this question should be turned into a slide for live Q&A.

Guidelines for ACCEPTING a question:
- It is clear enough to answer in 1-2 slides
- It is relevant to the current presentation
- It is not abusive, spammy, or completely off-topic
- It is not an exact duplicate of something that has already been clearly addressed

Guidelines for REJECTING a question:
- It is very low quality (e.g., just "lol", "hi", "you suck")
- It is obviously spam, trolling, or abusive
- It has nothing to do with the talk or topic
- It would require a very long, multi-part answer that does not fit a single slide

If you ACCEPT:
- Clean up the wording of the question to make it concise and presenter-friendly
- Classify the question type (e.g., "clarification", "deep-dive", "example", "challenge", "logistics")
- Set a priority:
  - "high" for especially insightful, broadly relevant questions
  - "normal" for most reasonable questions
  - "low" for edge cases or niche questions

If you REJECT:
- Explain briefly why (e.g., "off-topic", "abusive", "too vague").

Respond with a single JSON object:
{
  "accept": true or false,
  "reason": "Very short explanation of why you accepted or rejected",
  "normalizedQuestion": "Cleaned-up version of the question text for the slide (or empty string if rejected)",
  "category": "Short category label for the question type",
  "priority": "low" | "normal" | "high"
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    let gate: QuestionGateResponse;
    try {
      gate = JSON.parse(text) as QuestionGateResponse;
    } catch {
      // Fallback: if parsing fails, default to accepting the question as-is
      gate = {
        accept: true,
        reason: "Fallback accept due to parsing error",
        normalizedQuestion: question.trim(),
        category: "general",
        priority: "normal",
      };
    }

    // Ensure normalizedQuestion is at least the original question when accepted
    if (gate.accept && !gate.normalizedQuestion) {
      gate.normalizedQuestion = question.trim();
    }

    return NextResponse.json(gate);
  } catch (error) {
    console.error("Audience question gate API error:", error);
    // On error, default to accepting the question so we don't lose it
    return NextResponse.json(
      {
        accept: true,
        reason: "Gate error - automatically accepting question",
        normalizedQuestion: "",
        category: "general",
        priority: "normal",
      },
      { status: 200 }
    );
  }
}

