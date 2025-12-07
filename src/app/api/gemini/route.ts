import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

interface SlideContent {
  headline: string;
  subheadline?: string;
  bullets?: string[];
  visualDescription: string;
  category: string;
  sourceTranscript: string;
}

interface StyleReference {
  headline: string;
  visualDescription: string;
  category: string;
  slideNumber: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Support both old format (title/content/category) and new format (slideContent)
    const slideContent: SlideContent | null = body.slideContent || null;
    const title = slideContent?.headline || body.title;
    const content = slideContent?.sourceTranscript || body.content;
    const category = slideContent?.category || body.category;
    const visualDescription = slideContent?.visualDescription;

    // Style reference from previous slides (first 1-2 slides establish the style)
    const styleReferences: StyleReference[] = body.styleReferences || [];
    const slideNumber: number = body.slideNumber || 1;

    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });

    // Build styling context from previous slides
    let styleContext = "";
    if (styleReferences.length > 0) {
      styleContext = `
STYLE CONSISTENCY REQUIREMENTS:
This is slide #${slideNumber} in an ongoing presentation. You MUST maintain visual consistency with the established slide style.

Previous slides in this presentation:
${styleReferences.map((ref) => `- Slide ${ref.slideNumber}: "${ref.headline}" (${ref.category}) - ${(ref.visualDescription || "").slice(0, 100)}...`).join("\n")}

CRITICAL STYLE RULES:
- Use the SAME color palette and visual style as the previous slides
- Maintain consistent typography treatment (headline size, font weight, positioning)
- Keep the same layout approach and visual hierarchy
- Use similar graphic/illustration style (if previous slides used flat icons, continue with flat icons; if they used photography, continue with photography)
- Match the overall mood and tone established in earlier slides
- This should look like it belongs to the SAME presentation deck as the previous slides
`;
    } else {
      styleContext = `
ESTABLISHING PRESENTATION STYLE:
This is the FIRST slide of a new presentation. Establish a strong, cohesive visual style that can be maintained throughout subsequent slides.
- Choose a distinctive color palette that will work for multiple slides
- Establish a consistent typography treatment
- Set a visual style (modern, corporate, creative, minimal, etc.) that will carry through
`;
    }

    // Build a richer prompt when we have structured content from the gate
    let prompt: string;
    if (slideContent) {
      prompt = `Create a professional presentation slide image with the following specifications:

HEADLINE: ${slideContent.headline}
${slideContent.subheadline ? `SUBHEADLINE: ${slideContent.subheadline}` : ""}
${slideContent.bullets?.length ? `KEY POINTS:\n${slideContent.bullets.map((b) => `- ${b}`).join("\n")}` : ""}

VISUAL DIRECTION: ${visualDescription}

SLIDE TYPE: ${category}
${styleContext}
Design requirements:
- Clean, modern presentation aesthetic
- Clear visual hierarchy with the headline prominent
- Professional color scheme appropriate for the content
- Any supporting visuals should reinforce the message
- 16:9 aspect ratio suitable for presentations`;
    } else {
      // Fallback to original simple prompt for stream-of-consciousness mode
      prompt = `Create a presentation slide image that visually explains the following idea from a speaker:

Title: ${title}
Content: ${content}
Category: ${category}
${styleContext}
The image should be a professional, modern presentation slide. It should include the title and visual elements that explain the content.
16:9 aspect ratio suitable for presentations.`;
    }
    console.log("Prompt:", prompt);
    const result = await model.generateContent(prompt);
    const response = result.response;

    const candidate = response.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find((part) => part.inlineData);

    if (!imagePart || !imagePart.inlineData) {
      throw new Error("No image generated");
    }

    const imageBase64 = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType || "image/png";
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    return NextResponse.json({
      success: true,
      slide: {
        id: crypto.randomUUID(),
        imageUrl: dataUrl,
        headline: slideContent?.headline,
        subheadline: slideContent?.subheadline,
        bullets: slideContent?.bullets,
        visualDescription: visualDescription || content,
        originalIdea: { title, content, category },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Gemini API error:", errorMessage, error);
    return NextResponse.json(
      { error: "Failed to generate slide content", details: errorMessage },
      { status: 500 }
    );
  }
}
