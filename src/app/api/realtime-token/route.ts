import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "verse",
          instructions: `You are an intelligent presentation assistant. Your job is to listen to the presenter speak and extract valuable ideas, insights, and key points that would make great slides for a presentation.

When you hear something that would make a good slide point - an interesting idea, a key insight, a memorable quote, important data, or a compelling argument - use the insert_idea tool to capture it.

Be selective but proactive. Look for:
- Key concepts and definitions
- Important statistics or data points
- Memorable quotes or phrases
- Main arguments or thesis statements
- Transitions between major topics
- Conclusions and takeaways

Format each idea clearly and concisely as it would appear on a slide. Keep the presenter engaged with brief acknowledgments but don't interrupt the flow.`,
          tools: [
            {
              type: "function",
              name: "insert_idea",
              description:
                "Insert a key idea or point from the presenter's speech that would make a good slide. Use this when you hear valuable content worth capturing.",
              parameters: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description:
                      "A short, punchy title for the slide (3-6 words)",
                  },
                  content: {
                    type: "string",
                    description:
                      "The main idea or point, formatted as it would appear on a slide (1-3 bullet points or a key statement)",
                  },
                  category: {
                    type: "string",
                    enum: [
                      "concept",
                      "data",
                      "quote",
                      "argument",
                      "conclusion",
                      "transition",
                    ],
                    description: "The type of content being captured",
                  },
                },
                required: ["title", "content", "category"],
              },
            },
          ],
          tool_choice: "auto",
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI API error:", error);
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating realtime session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
