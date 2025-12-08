import { GoogleGenerativeAI, DynamicRetrievalMode } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

interface AnswerResponse {
  headline: string;
  subheadline?: string;
  bullets?: string[];
  visualDescription: string;
  category: string;
  originalQuestion: string;
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
    const { question, presentationContext } = body;

    if (!question) {
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
      tools: [
        {
          googleSearchRetrieval: {
            dynamicRetrievalConfig: {
              mode: DynamicRetrievalMode.MODE_DYNAMIC,
            },
          },
        },
      ],
    });

    const contextInfo = presentationContext
      ? `\n\nPresentation context (previous slides covered):\n${presentationContext}`
      : "";

    const prompt = `You are an expert presenter answering an audience question during a live presentation.

AUDIENCE QUESTION: "${question}"
${contextInfo}

Your task is to:
1. Provide a clear, helpful answer to this question
2. Format it as a presentation slide that ANSWERS the question (not just restates it)

You can use Google Search to ground your answer in accurate, up-to-date information when the question involves facts, statistics, recent events, or topics where accuracy is critical. Use search when it will add important, specific, and directly relevant facts to your answer.

IMPORTANT: The slide should contain the ANSWER, not the question. The headline should be the key insight or answer.

Respond with a JSON object containing:
{
  "headline": "The main answer or key insight (concise, 5-10 words)",
  "subheadline": "A supporting statement that expands on the headline (optional)",
  "bullets": ["Key point 1", "Key point 2", "Key point 3"] (2-4 bullet points explaining the answer),
  "visualDescription": "Description of visuals that would help explain this answer (icons, diagrams, illustrations)",
  "category": "One of: explanation, comparison, process, concept, data, example"
}

Focus on being informative and educational. The audience asked this question because they want to understand something better.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    let answerContent: AnswerResponse;
    try {
      answerContent = JSON.parse(text);
      answerContent.originalQuestion = question;
    } catch {
      // Fallback if JSON parsing fails
      answerContent = {
        headline: "Answer to Your Question",
        subheadline: question,
        bullets: [text.slice(0, 200)],
        visualDescription: "Clean informational slide with relevant icons",
        category: "explanation",
        originalQuestion: question,
      };
    }

    return NextResponse.json({
      success: true,
      answer: answerContent,
    });
  } catch (error) {
    console.error("Answer question API error:", error);
    return NextResponse.json(
      { error: "Failed to generate answer" },
      { status: 500 }
    );
  }
}
