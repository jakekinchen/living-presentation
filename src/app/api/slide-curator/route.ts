import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

// Tool for curator decision
const curatorDecisionTool = {
  name: "curator_decision",
  description: "Make a decision about which slides to show as options to the presenter",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: {
        type: SchemaType.STRING,
        description: "The action to take: 'replace_slot_1' (new slide replaces option 1), 'replace_slot_2' (new slide replaces option 2), 'discard' (keep current options, discard new slide)",
      },
      reasoning: {
        type: SchemaType.STRING,
        description: "Brief explanation of why this decision was made",
      },
    },
    required: ["action", "reasoning"],
  },
};

interface SlideOption {
  id: string;
  headline?: string;
  sourceTranscript?: string;
  category?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { newSlide, currentOptions } = await request.json() as {
      newSlide: SlideOption;
      currentOptions: [SlideOption | null, SlideOption | null];
    };

    // If we don't have 2 options yet, just add to empty slot
    if (!currentOptions[0]) {
      return NextResponse.json({ action: "replace_slot_1", reasoning: "Slot 1 was empty" });
    }
    if (!currentOptions[1]) {
      return NextResponse.json({ action: "replace_slot_2", reasoning: "Slot 2 was empty" });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      tools: [{ functionDeclarations: [curatorDecisionTool] }],
    });

    const prompt = `You are a presentation slide curator. The presenter is giving a live talk and you're helping them choose the best slides.

You currently have TWO slide options visible to the presenter. A NEW slide has just been generated.

CURRENT OPTION 1:
- Headline: ${currentOptions[0].headline || "No headline"}
- Content: ${currentOptions[0].sourceTranscript?.slice(0, 200) || "No content"}
- Category: ${currentOptions[0].category || "unknown"}

CURRENT OPTION 2:
- Headline: ${currentOptions[1].headline || "No headline"}
- Content: ${currentOptions[1].sourceTranscript?.slice(0, 200) || "No content"}
- Category: ${currentOptions[1].category || "unknown"}

NEW SLIDE:
- Headline: ${newSlide.headline || "No headline"}
- Content: ${newSlide.sourceTranscript?.slice(0, 200) || "No content"}
- Category: ${newSlide.category || "unknown"}

DECISION CRITERIA:
- Replace the WEAKEST current option if the new slide is stronger
- Consider: clarity of message, relevance, completeness, visual potential
- Prefer variety in slide types (don't have two very similar slides)
- If the new slide is weaker than both options or too similar to one, discard it
- If in doubt, discard - quality over quantity

Call curator_decision with your choice: 'replace_slot_1', 'replace_slot_2', or 'discard'.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const candidate = response.candidates?.[0];

    const functionCall = candidate?.content?.parts?.find(
      (part) => part.functionCall
    )?.functionCall;

    if (functionCall && functionCall.name === "curator_decision") {
      const args = functionCall.args as {
        action: string;
        reasoning: string;
      };

      // Validate action
      const validActions = ["replace_slot_1", "replace_slot_2", "discard"];
      const action = validActions.includes(args.action) ? args.action : "discard";

      return NextResponse.json({
        action,
        reasoning: args.reasoning,
      });
    }

    // Default to discard if no clear decision
    return NextResponse.json({
      action: "discard",
      reasoning: "Could not determine best action",
    });
  } catch (error) {
    console.error("Slide curator error:", error);
    // On error, default to replacing slot 2 (keep newest content flowing)
    return NextResponse.json({
      action: "replace_slot_2",
      reasoning: "Error in curator, defaulting to replace slot 2",
    });
  }
}
