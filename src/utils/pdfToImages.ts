import * as pdfjsLib from 'pdfjs-dist';
import type { SlideData } from '@/hooks/useRealtimeAPI';

// Configure the worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export async function convertPdfToSlides(file: File): Promise<SlideData[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const slides: SlideData[] = [];
  const numPages = pdf.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Set scale for better quality
    const viewport = page.getViewport({ scale: 2.0 });

    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Could not get canvas context');
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    };
    await page.render(renderContext).promise;

    // Convert canvas to data URL
    const imageUrl = canvas.toDataURL('image/png');

    // Create slide data
    const slide: SlideData = {
      id: crypto.randomUUID(),
      imageUrl,
      originalIdea: {
        title: `Slide ${pageNum}`,
        content: `PDF slide ${pageNum} from ${file.name}`,
        category: 'pdf-upload',
      },
      timestamp: new Date().toISOString(),
      source: 'voice', // Mark as voice so it goes into the main queue
    };

    slides.push(slide);
  }

  return slides;
}
