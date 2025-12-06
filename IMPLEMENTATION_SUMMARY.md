# PDF Upload & On-Demand Slide Generation Implementation

## Overview
Modified the Living Presentation application to support PDF upload for existing slides and on-demand slide generation based on voice descriptions.

## Changes Made

### 1. PDF Processing (`src/utils/pdfToImages.ts`)
- **New file**: Utility to convert PDF pages to slide images
- Uses `pdfjs-dist` library to render each PDF page to a canvas
- Converts canvas to data URL (PNG format)
- Returns an array of `SlideData` objects with `imageUrl` set

### 2. Updated Realtime API Hook (`src/hooks/useRealtimeAPI.ts`)
- **New function**: `addSlides()` - Allows adding multiple slides to the queue
- **Modified recording flow**:
  - Recording now accumulates a full transcript during the session
  - Transcript is processed into a slide only when "Stop Recording" is clicked
  - Each recording session is intended for describing ONE new slide
- **Ref changes**: Replaced `lastIdeaTextRef` with `fullTranscriptRef` to accumulate speech

### 3. Enhanced Main Page (`src/app/page.tsx`)

#### Splash Screen
- Added PDF upload button with drag-and-drop style UI
- Shows upload status and number of slides loaded
- Option to upload a different PDF
- Updated messaging: "Upload your slides, then speak new ideas into existence"

#### Presenter View
- **New prop**: `initialSlides` - Accepts PDF slides from upload
- **useEffect**: Automatically adds PDF slides to the queue when presentation starts
- **Updated recording controls**:
  - Button now says "Record New Slide" instead of "Start Recording"
  - Visual indicator (pulsing dot) while recording
  - "Stop Recording" button processes the accumulated description
- **Updated transcript section**:
  - Header changes to "Recording New Slide..." when active
  - Helpful prompts guide users on the workflow

### 4. Dependencies
- Added `pdfjs-dist` package for PDF processing

## User Workflow

### Step 1: Upload Existing Slides (Optional)
1. On the splash screen, click "Upload Existing Slides (PDF)"
2. Select a PDF file
3. Application converts each page to an image
4. Shows confirmation: "X slides loaded"

### Step 2: Start Presentation
1. Click "Start Presenting"
2. PDF slides are added to the slide queue
3. Accept slides one by one to display them

### Step 3: Generate New Slide On-Demand
1. Click "Record New Slide" button
2. Describe the new slide idea (e.g., "I just thought of a new concept about...")
3. Click "Stop Recording"
4. Application generates a slide based on your description
5. New slide appears in the queue for you to accept or skip

## Technical Details

### Slide Queue Management
- PDF slides are marked with `source: "voice"` to appear in the main queue
- Question slides (from audience) appear in a separate queue
- Slides can be accepted (added to history) or skipped (removed from queue)

### Recording Flow
- Each recording session captures a complete description
- Transcript accumulates during recording and is processed on stop
- Only descriptions longer than 10 characters are processed
- Slides are generated via the `/api/gemini` endpoint

## Files Modified
1. `src/app/page.tsx` - Main UI updates
2. `src/hooks/useRealtimeAPI.ts` - Recording flow changes
3. `src/utils/pdfToImages.ts` - New PDF processing utility
4. `package.json` - Added pdfjs-dist dependency

## Testing Recommendations
1. Test PDF upload with various PDF files (different page counts)
2. Verify slide queue shows PDF slides correctly
3. Test recording a new slide while PDF slides are in queue
4. Verify the generated slide appears after stop recording
5. Test without uploading a PDF (blank presentation)
