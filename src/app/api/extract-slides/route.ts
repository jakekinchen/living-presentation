import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

export interface ExtractedSlide {
  id: string;
  imageUrl: string; // The original uploaded image
  headline: string;
  subheadline?: string;
  bullets?: string[];
  visualDescription: string;
  category: string;
  originalIdea: {
    title: string;
    content: string;
    category: string;
  };
  timestamp: string;
  isUploaded: true; // Flag to identify uploaded slides
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images } = body as { images: { dataUrl: string; fileName: string }[] };

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: "No images provided" },
        { status: 400 }
      );
    }

    // Use Flash Lite for fast extraction
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    const prompt = `Analyze this presentation slide image and extract the following information in JSON format:

{
  "headline": "The main title or headline of the slide (string)",
  "subheadline": "Any subtitle or secondary text (string or null)",
  "bullets": ["Array of bullet points or key text items on the slide"],
  "visualDescription": "A detailed description of the visual elements, graphics, charts, or imagery on the slide",
  "category": "One of: concept, data, process, comparison, quote, summary, intro, conclusion, diagram",
  "contentSummary": "A brief 1-2 sentence summary of what this slide is about"
}

Focus on extracting the text content accurately and describing the visual layout. If there's no subheadline or bullets, use null or empty array. Return ONLY valid JSON, no markdown formatting.`;

    // Process slides with limited parallelism for better latency on multi-slide uploads
    const maxConcurrency = 4;
    const results: (ExtractedSlide | null)[] = new Array(images.length).fill(null);
    let currentIndex = 0;

    async function processImage(index: number): Promise<void> {
      const image = images[index];
      const { dataUrl, fileName } = image;

      // Extract the base64 data and mime type from data URL
      const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        console.error("Invalid data URL format for:", fileName);
        return;
      }

      const mimeType = matches[1];
      const base64Data = matches[2];

      try {
        const result = await model.generateContent([
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          prompt,
        ]);

        const response = result.response;
        const text = response.text();

        // Parse the JSON response
        let parsed;
        try {
          // Remove any markdown code block formatting if present
          const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsed = JSON.parse(cleanedText);
        } catch {
          console.error("Failed to parse extraction result:", text);
          // Create a fallback structure
          parsed = {
            headline: fileName.replace(/\.[^.]+$/, ""),
            subheadline: null,
            bullets: [],
            visualDescription: "Uploaded slide image",
            category: "concept",
            contentSummary: "Content from uploaded slide",
          };
        }

        const extractedSlide: ExtractedSlide = {
          id: crypto.randomUUID(),
          imageUrl: dataUrl,
          headline: parsed.headline || "Untitled Slide",
          subheadline: parsed.subheadline || undefined,
          bullets: parsed.bullets || undefined,
          visualDescription: parsed.visualDescription || "",
          category: parsed.category || "concept",
          originalIdea: {
            title: parsed.headline || "Untitled",
            content: parsed.contentSummary || parsed.visualDescription || "",
            category: parsed.category || "concept",
          },
          timestamp: new Date().toISOString(),
          isUploaded: true,
        };

        results[index] = extractedSlide;
      } catch (err) {
        console.error("Failed to extract slide:", fileName, err);
      }
    }

    async function worker() {
      while (true) {
        const index = currentIndex++;
        if (index >= images.length) break;
        // eslint-disable-next-line no-await-in-loop
        await processImage(index);
      }
    }

    const workerCount = Math.min(maxConcurrency, images.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const extractedSlides: ExtractedSlide[] = results.filter(
      (slide): slide is ExtractedSlide => slide !== null
    );

    return NextResponse.json({
      success: true,
      slides: extractedSlides,
      count: extractedSlides.length,
    });
  } catch (error) {
    console.error("Extract slides API error:", error);
    return NextResponse.json(
      { error: "Failed to extract slide content" },
      { status: 500 }
    );
  }
}
