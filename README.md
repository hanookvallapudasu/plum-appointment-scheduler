# AI-Powered Appointment Scheduler

Hi! This repository is my submission for **Problem Statement 1: AI-Powered Appointment Scheduler Assistant** for the Plum SDE Intern campus hiring process.

It is a backend service built with Node.js and Express that takes either typed text or scanned document/notes images and converts them into structured appointment JSON, resolving relative dates to `Asia/Kolkata` time and applying guardrails to catch ambiguous or missing details.

🌐 **Live Cloud Demo (Render):** [https://plum-appointment-scheduler.onrender.com/api/docs](https://plum-appointment-scheduler.onrender.com/api/docs)  
🩺 **Health Endpoint:** [https://plum-appointment-scheduler.onrender.com/health](https://plum-appointment-scheduler.onrender.com/health)

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
```
*(Default settings in `.env.example` work out of the box. If you want to test with live Gemini API, add your `LLM_API_KEY`. If left blank, the app uses a built-in deterministic entity extractor so the service and test suite work 100% offline without needing an API key.)*

### 3. Run tests
```bash
npm test
```

### 4. Start the server
```bash
npm run dev   # dev mode with nodemon
# or
npm start     # standard start
```
The server will boot on `http://localhost:3000`.  
Swagger documentation is available at `http://localhost:3000/api/docs`.

---

## Architectural Approach & Engineering Decisions

When approaching this assignment, the most critical design challenge was **reliability**: language models are great at semantic extraction from messy text, but they should **never** be trusted to make final scheduling decisions, invent missing details, or do calendar math.

I chose a sequential, modular pipeline:

```
[ Input: Text or Image ]
          │
          ├── (If Image) ──> Sharp (Grayscale, Contrast, Sharpen) ──> Tesseract.js OCR
          │
          ▼
   Raw Text Extraction
          │
          ▼
  LLM Entity Extraction  ──> (date_phrase, time_phrase, department, confidence)
          │
          ▼
   Zod Schema Validation ──> Rejects malformed structures or invalid types
          │
          ▼
Deterministic Normalization:
  - Department: Canonical catalog lookup (e.g., "dentist" -> "Dentistry")
  - Date: Chrono-node anchored to current runtime date in Asia/Kolkata
  - Time: 24-hour conversion (e.g., "3pm" -> "15:00")
          │
          ▼
  Guardrail Engine:
  - Checks if department, date, or time are missing/vague
  - Verifies extraction confidence threshold (>= 0.60)
  - Checks for non-appointment inputs (e.g., "hello how are you")
          │
     ┌────┴────────────────────────┐
     ▼                             ▼
[ Needs Clarification (422) ]   [ Final Appointment JSON (200) ]
```

### Key Decisions:
1. **Decoupling OCR, Extraction, and Normalization**:
   Instead of asking an LLM to take an image and directly output the final JSON (which is a black box and prone to hallucinating missing dates), each stage has single responsibility. If OCR produces garbled text, it fails immediately before wasting tokens.
2. **Deterministic Date/Time Normalization**:
   Relative dates like `"next Friday"` or `"tomorrow"` are resolved dynamically relative to the current runtime timestamp in `Asia/Kolkata` using `chrono-node` and `date-fns-tz`. Vague phrases like `"sometime next week"` or `"morning"` are intentionally mapped to `null` so the guardrail engine can ask the user for clarification.
3. **No Native OS Dependency for OCR**:
   I used `tesseract.js` (WebAssembly) bundled with local language data (`src/data/tessdata/eng.traineddata.gz`). This means anyone reviewing or grading this project can run `npm install && npm test` immediately without needing to install C++ libraries like `tesseract-ocr` via brew or apt.
4. **Offline / Fallback Capability**:
   The LLM service connects to Google Gemini (`gemini-2.0-flash`) using JSON schema structured output, but also includes a local rule-based extractor fallback when `LLM_API_KEY` is not provided. This ensures tests run quickly and deterministically in CI/grading environments.

---

## Guardrails Implemented

The service enforces strict validation and guardrails before returning any appointment:

| Condition | Example Input | Handled Behavior |
| :--- | :--- | :--- |
| **Missing Time** | `"Book dentist next Friday"` | Returns `422` asking for a specific appointment time |
| **Missing Department** | `"Book an appointment next Friday at 3pm"` | Returns `422` asking for the doctor/department |
| **Ambiguous Date** | `"Book dentist sometime next week"` | Returns `422` with `"Ambiguous date/time or department."` |
| **Vague Time** | `"Book dentist tomorrow morning"` | Rejects arbitrary time selection, asks for exact time |
| **Past Date** | `"Book dentist yesterday at 3pm"` | Rejects dates in the past, asks for valid date |
| **Conversational / Noise** | `"hello how are you"` | Rejects with `"No appointment request detected..."` |
| **Mutually Exclusive Input** | Both `text` and `image` supplied in one request | Returns `400` validation error |
| **Unreadable Image** | Blurry image or blank scan | Returns `422` with code `OCR_FAILED` |
| **Invalid Upload** | Text file or PDF uploaded to `image` field | Returns `400` with code `INVALID_IMAGE` |

---

## API Usage & Examples

### 1. Parse Appointment (`POST /api/v1/appointments/parse`)

#### A. JSON Text Request
```bash
curl -X POST http://localhost:3000/api/v1/appointments/parse \
  -H "Content-Type: application/json" \
  -d '{"text": "Book dentist next Friday at 3pm"}'
```
**Response (200 OK)**:
```json
{
  "appointment": {
    "department": "Dentistry",
    "date": "2026-10-09",
    "time": "15:00",
    "tz": "Asia/Kolkata"
  },
  "status": "ok"
}
```

#### B. Image Upload Request
```bash
curl -X POST http://localhost:3000/api/v1/appointments/parse \
  -F "image=@samples/valid/appointment_note.png"
```
**Response (200 OK)**:
```json
{
  "appointment": {
    "department": "Dentistry",
    "date": "2026-10-09",
    "time": "15:00",
    "tz": "Asia/Kolkata"
  },
  "status": "ok"
}
```

#### C. Clarification Example (Missing Time)
```bash
curl -X POST http://localhost:3000/api/v1/appointments/parse \
  -H "Content-Type: application/json" \
  -d '{"text": "Book dentist next Friday"}'
```
**Response (422 Unprocessable Entity)**:
```json
{
  "status": "needs_clarification",
  "message": "Please provide a specific appointment time."
}
```

#### D. Clarification Example (Ambiguous Date)
```bash
curl -X POST http://localhost:3000/api/v1/appointments/parse \
  -H "Content-Type: application/json" \
  -d '{"text": "Book dentist sometime next week"}'
```
**Response (422 Unprocessable Entity)**:
```json
{
  "status": "needs_clarification",
  "message": "Ambiguous date/time or department."
}
```

---

### 2. Health Check (`GET /health`)
```bash
curl -X GET http://localhost:3000/health
```
```json
{
  "status": "ok"
}
```

---

## Testing

The test suite covers unit tests for normalization and guardrails, as well as full HTTP integration tests using Supertest.

```bash
npm test
```

Test files:
* `tests/normalization.test.js`: Department alias matching, date resolution relative to `Asia/Kolkata`, past-date guards, and 12h/24h time parsing.
* `tests/guardrails.test.js`: Valid appointment verification, missing field triggers, low-confidence handling, and conversational text detection.
* `tests/appointment.test.js`: End-to-end integration tests for text parsing, image OCR parsing, bad requests, MIME filtering, and Swagger UI.

---

## Testing with ngrok (for Demo)

To test or demo the endpoints remotely:
```bash
npm start
ngrok http 3000
```
Use the forwarded `https://*.ngrok-free.app` URL in Postman or curl.

---

## Project Structure

```
├── samples/                     # Test fixtures (valid, noisy, ambiguous)
├── src/
│   ├── config/env.js            # Environment validation with Zod
│   ├── controllers/             # HTTP controller logic
│   ├── data/tessdata/           # Bundled offline language files for OCR
│   ├── docs/swagger.json        # OpenAPI 3.0 specification
│   ├── middleware/              # Multer upload & error handling middlewares
│   ├── routes/                  # Express route definitions
│   ├── schemas/                 # Zod validation schemas
│   ├── services/                # OCR, LLM, Normalization, Guardrail services
│   ├── utils/                   # Timezone, logger, and string helpers
│   ├── app.js                   # Express app setup
│   └── server.js                # Server entry point
├── tests/                       # Jest & Supertest test suites
├── .env.example
├── package.json
└── README.md
```
# plum-appointment-scheduler
# plum-appointment-scheduler
