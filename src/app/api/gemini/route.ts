import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

export async function POST(request: NextRequest) {
  try {
    const { title, content, category } = await request.json();

    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });

    const prompt = `Create a presentation slide image that visually explains the following idea from a speaker:
    
Title: ${title}
Content: ${content}
Category: ${category}

The image should be a professional, modern presentation slide. It should include the title and visual elements that explain the content.`;

    const result = await model.generateContent(prompt);
    const response = result.response;

    // Extract image data
    // Assuming the model returns an image in the first part of the first candidate
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
        originalIdea: { title, content, category },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Gemini API error:", error);
    return NextResponse.json(
      { error: "Failed to generate slide content" },
      { status: 500 }
    );
  }
}
