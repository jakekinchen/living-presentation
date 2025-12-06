import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

// Tool definition for creating a slide
const createSlideTool = {
  name: "create_slide",
  description: "Create a presentation slide when there is enough substantive information. Only call this when the transcript contains a complete, well-formed idea worth presenting as a slide.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      headline: {
        type: SchemaType.STRING,
        description: "A clear, concise headline for the slide (5-10 words)",
      },
      subheadline: {
        type: SchemaType.STRING,
        description: "Optional supporting text that adds context (10-20 words)",
      },
      bullets: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: "Optional bullet points for key details (2-4 bullets, each 5-15 words)",
      },
      visualDescription: {
        type: SchemaType.STRING,
        description: "A detailed description of what visual/image would best represent this content for the slide",
      },
      category: {
        type: SchemaType.STRING,
        description: "The type of slide: concept, data, process, comparison, quote, or summary",
      },
    },
    required: ["headline", "visualDescription", "category"],
  },
};

interface PriorIdea {
  title: string;
  content: string;
  category: string;
}

interface AcceptedSlide {
  id: string;
  headline: string;
  visualDescription: string;
  category: string;
}

// Conclusion detection patterns
const CONCLUSION_PATTERNS = [
  /in\s+conclusion/i,
  /to\s+summarize/i,
  /to\s+sum\s+up/i,
  /in\s+summary/i,
  /wrapping\s+up/i,
  /to\s+conclude/i,
  /finally/i,
  /that('s|s)\s+(all|it)\s+for\s+(today|now|this)/i,
  /thank\s+you\s+(all\s+)?for\s+(listening|watching|your\s+time|attending)/i,
  /any\s+questions/i,
];

function detectsConclusionIntent(text: string): boolean {
  return CONCLUSION_PATTERNS.some(pattern => pattern.test(text));
}

export async function POST(request: NextRequest) {
  try {
    const { transcript, priorIdeas = [], acceptedSlides = [], isFirstSlide = false } = await request.json() as {
      transcript: string;
      priorIdeas?: PriorIdea[];
      acceptedSlides?: AcceptedSlide[];
      isFirstSlide?: boolean;
    };

    if (!transcript || transcript.trim().length < 10) {
      return NextResponse.json({
        shouldCreateSlide: false,
        reason: "Transcript too short",
      });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      tools: [{ functionDeclarations: [createSlideTool] }],
    });

    const priorIdeasText = priorIdeas.length > 0
      ? `\nPRIOR SLIDES ALREADY CREATED (do not duplicate these):\n${priorIdeas.map((idea: PriorIdea) => `- ${idea.title}: ${idea.content.slice(0, 100)}...`).join("\n")}\n`
      : "";

    // Build slide history context from accepted slides
    const slideHistoryText = acceptedSlides.length > 0
      ? `\nPRESENTATION SLIDE HISTORY (${acceptedSlides.length} slides so far):\n${acceptedSlides.map((slide: AcceptedSlide, i: number) => `${i + 1}. "${slide.headline}" - ${slide.visualDescription.slice(0, 80)}...`).join("\n")}\n`
      : "";

    // Detect if this looks like a conclusion
    const isConclusionIntent = detectsConclusionIntent(transcript);

    // Build special instructions based on context
    let specialInstructions = "";

    if (isFirstSlide) {
      specialInstructions = `
SPECIAL CONTEXT: This is the FIRST SLIDE of the presentation.
- Create an engaging INTRO/TITLE slide that sets up the presentation topic
- Even if the speaker is just introducing themselves or the topic, create a welcoming title slide
- The headline should be the presentation title or topic
- The visual should be inviting and set the tone for the presentation
- Category should be "intro"
`;
    } else if (isConclusionIntent && acceptedSlides.length > 0) {
      specialInstructions = `
SPECIAL CONTEXT: The speaker is CONCLUDING the presentation.
- Create a SUMMARY/CONCLUSION slide that wraps up the key points
- Reference the main themes from the slides that have been presented
- The headline should signal conclusion (e.g., "Key Takeaways", "In Summary", "Thank You")
- The visual should convey completion and key learnings
- Category should be "summary"

The presentation covered these slides:
${acceptedSlides.map((slide: AcceptedSlide, i: number) => `${i + 1}. ${slide.headline}`).join("\n")}
`;
    }

    const prompt = `You are analyzing a live presentation transcript to determine if it contains enough information to create a meaningful presentation slide.

TRANSCRIPT:
"${transcript}"
${priorIdeasText}${slideHistoryText}${specialInstructions}
GUIDELINES FOR CREATING A SLIDE:
- Only create a slide if there is a COMPLETE, substantive idea worth presenting
- The idea should have enough detail to fill a slide meaningfully
- Look for: key concepts, important points, data/statistics, processes, comparisons, or memorable quotes
${isFirstSlide ? "- For the FIRST slide, be MORE LENIENT - an introduction of the topic is enough to create a title slide" : ""}
${isConclusionIntent ? "- For CONCLUSION, create a summary slide even if the closing remarks are brief" : ""}
- Do NOT create a slide for:
  - Incomplete thoughts or sentences (unless it's an intro or conclusion)
  - Filler words or transitional phrases
  - Repetitive content that was already covered in prior slides
  - Content that is essentially the same as a prior slide (avoid duplicates)

If the transcript contains a complete, slide-worthy idea that is NEW and different from prior slides, call the create_slide function.
If not ready for a slide yet, simply respond with a brief explanation of what you're waiting for.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const candidate = response.candidates?.[0];

    // Check if the model called the create_slide function
    const functionCall = candidate?.content?.parts?.find(
      (part) => part.functionCall
    )?.functionCall;

    if (functionCall && functionCall.name === "create_slide") {
      const args = functionCall.args as {
        headline: string;
        subheadline?: string;
        bullets?: string[];
        visualDescription: string;
        category: string;
      };

      return NextResponse.json({
        shouldCreateSlide: true,
        slideContent: {
          headline: args.headline,
          subheadline: args.subheadline,
          bullets: args.bullets,
          visualDescription: args.visualDescription,
          category: args.category,
          sourceTranscript: transcript,
        },
      });
    }

    // Model decided not to create a slide
    const textResponse = candidate?.content?.parts?.find(
      (part) => part.text
    )?.text;

    return NextResponse.json({
      shouldCreateSlide: false,
      reason: textResponse || "Not enough content for a slide yet",
    });
  } catch (error) {
    console.error("Slide gate API error:", error);
    return NextResponse.json(
      { error: "Failed to analyze transcript" },
      { status: 500 }
    );
  }
}
