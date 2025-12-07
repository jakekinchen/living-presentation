import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, readdir, unlink, mkdir, rmdir } from "fs/promises";
import { join, basename, extname } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";
import { LibreOfficeFileConverter } from "libreoffice-file-converter";

export const runtime = "nodejs";

const OFFICE_CONVERSION_ENABLED = process.env.NODE_ENV === "development";

// Allowed file extensions for conversion
const ALLOWED_EXTENSIONS = new Set([".pptx", ".ppt", ".key", ".odp", ".pdf"]);
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

/**
 * Sanitize filename to prevent path traversal attacks
 */
function sanitizeFilename(filename: string): string {
  // Extract just the base name (removes any directory components)
  const base = basename(filename);
  // Remove any remaining path separators or null bytes
  return base.replace(/[/\\<>:"|?*\x00-\x1f]/g, "_");
}

const execAsync = promisify(exec);
const libreOfficeConverter = new LibreOfficeFileConverter();

interface ConvertedSlide {
  dataUrl: string;
  pageNumber: number;
}

/**
 * Check if LibreOffice is available
 */
async function isLibreOfficeAvailable(): Promise<boolean> {
  const possiblePaths = [
    "soffice", // Linux/macOS if in PATH
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice", // macOS
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe", // Windows
  ];

  for (const path of possiblePaths) {
    try {
      await execAsync(`"${path}" --version`);
      return true;
    } catch {
      // Not found at this path
    }
  }

  return false;
}

/**
 * Convert a presentation file to PDF using libreoffice-file-converter
 */
async function convertToPdf(inputPath: string, outputDir: string): Promise<string> {
  const outputPath = join(outputDir, "converted.pdf");

  try {
    // Read input file as buffer
    const inputBuffer = await readFile(inputPath);

    // Convert to PDF using LibreOfficeFileConverter
    const pdfBuffer = await libreOfficeConverter.convert({
      buffer: inputBuffer,
      format: "pdf",
      input: "buffer",
      output: "buffer",
    });

    // Write the PDF to output path
    await writeFile(outputPath, pdfBuffer);
  } catch (error) {
    console.error("LibreOffice conversion error:", error);
    throw new Error("Failed to convert file with LibreOffice");
  }

  if (!existsSync(outputPath)) {
    throw new Error("PDF output not found after conversion");
  }

  return outputPath;
}

/**
 * Convert PDF to images using pdftoppm (poppler-utils) or fallback
 */
async function pdfToImages(pdfPath: string, outputDir: string): Promise<string[]> {
  // Try using pdftoppm from poppler-utils
  try {
    const outputPrefix = join(outputDir, "slide");
    await execAsync(`pdftoppm -png -r 150 "${pdfPath}" "${outputPrefix}"`, { timeout: 120000 });

    const files = await readdir(outputDir);
    return files
      .filter(f => f.startsWith("slide") && f.endsWith(".png"))
      .sort()
      .map(f => join(outputDir, f));
  } catch {
    // pdftoppm not available - try with ImageMagick
    try {
      await execAsync(`convert -density 150 "${pdfPath}" "${join(outputDir, "slide-%03d.png")}"`, { timeout: 120000 });

      const files = await readdir(outputDir);
      return files
        .filter(f => f.startsWith("slide") && f.endsWith(".png"))
        .sort()
        .map(f => join(outputDir, f));
    } catch {
      throw new Error("No PDF to image converter available (install poppler-utils or imagemagick)");
    }
  }
}

/**
 * Clean up temporary files
 */
async function cleanup(dir: string): Promise<void> {
  try {
    const files = await readdir(dir);
    await Promise.all(files.map(f => unlink(join(dir, f))));
    await rmdir(dir);
  } catch {
    // Ignore cleanup errors
  }
}

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!OFFICE_CONVERSION_ENABLED) {
      return NextResponse.json(
        {
          error: "PowerPoint/Keynote conversion is not available on this deployment.",
          suggestion:
            "Please export your deck to PDF or images and upload those instead. Office uploads are only supported when running locally in development.",
        },
        { status: 501 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB." },
        { status: 400 }
      );
    }

    // Validate file extension
    const ext = extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed types: ${[...ALLOWED_EXTENSIONS].join(", ")}` },
        { status: 400 }
      );
    }

    // Check for LibreOffice
    const hasLibreOffice = await isLibreOfficeAvailable();
    if (!hasLibreOffice) {
      return NextResponse.json(
        {
          error: "LibreOffice is not installed. Please install LibreOffice to convert PowerPoint/Keynote files, or export your presentation as PDF/images first.",
          suggestion: "You can export your presentation as PDF from PowerPoint/Keynote, then upload the PDF instead."
        },
        { status: 501 }
      );
    }

    // Create temp directory
    tempDir = join(tmpdir(), `slide-convert-${Date.now()}`);
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    // Save uploaded file with sanitized filename
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeFilename = sanitizeFilename(file.name);
    const inputPath = join(tempDir, safeFilename);
    await writeFile(inputPath, buffer);

    // Convert to PDF first using libreoffice-file-converter
    console.log(`Converting ${file.name} to PDF...`);
    const pdfPath = await convertToPdf(inputPath, tempDir);

    // Convert PDF to images
    console.log("Converting PDF to images...");
    const imagePaths = await pdfToImages(pdfPath, tempDir);

    if (imagePaths.length === 0) {
      throw new Error("No slides were extracted from the file");
    }

    // Read images and convert to data URLs
    const slides: ConvertedSlide[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const imageBuffer = await readFile(imagePaths[i]);
      const base64 = imageBuffer.toString("base64");
      slides.push({
        dataUrl: `data:image/png;base64,${base64}`,
        pageNumber: i + 1,
      });
    }

    // Cleanup
    await cleanup(tempDir);

    return NextResponse.json({
      success: true,
      slides,
      count: slides.length,
    });
  } catch (error) {
    console.error("Slide conversion error:", error);

    // Cleanup on error
    if (tempDir) {
      await cleanup(tempDir);
    }

    const message = error instanceof Error ? error.message : "Failed to convert file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
