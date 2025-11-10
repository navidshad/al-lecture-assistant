# AI Lecture Assistant

![AI Lecture Assistant screenshot](https://github.com/navidshad/ai-lecture-assistant/raw/main/screenshot.jpeg)

A lightweight, browser‑based assistant for teaching and studying. Load a PDF of your slides, talk to the AI about any page, get quick explanations, and keep a searchable transcript. Built with React, Vite, TypeScript and Google Gemini.

## What it’s good for
- Classroom lectures with an AI co‑presenter that can explain a slide on demand
- Self‑study and revision: ask questions, summarize, or clarify tricky parts
- Reading groups, paper walkthroughs, and team demos with live Q&A

## Features
- PDF slide viewer with thumbnails, page navigation, and zoom
- Canvas tab for quick sketches alongside your slides
- Transcript panel for your full conversation with the AI
- Microphone capture and optional spoken responses (where supported)
- Gemini‑powered explanations, summaries, and slide‑aware Q&A
- Local session history and configurable preferences (API key, language, etc.)
- Fast Vite development setup with React + TypeScript

---

## Quick Start

Prerequisites: Node.js 18+

1) Install dependencies

```bash
npm install
```

2) Provide your Gemini API key

- Easiest: paste it in the in‑app “API Key” modal at first run, or
- Create an `.env.local` file in the project root:

```bash
echo "GEMINI_API_KEY=your_key_here" > .env.local
```

3) Run the app

```bash
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## Project Structure (high level)

```text
ai-lecture-assistant/
├─ components/          # UI: slide viewer, canvas, controls, modals, toasts
├─ hooks/               # API key, Gemini Live, toast helpers
├─ pages/               # Intro, lecture, sessions
├─ services/            # audio, pdf, db, logging utilities
├─ types.ts             # shared types
├─ App.tsx              # app shell and routing
└─ vite.config.ts       # Vite configuration
```

## Configuration
- `GEMINI_API_KEY`: required. Set via `.env.local` or the in‑app modal.
- Other preferences (like language) are available in the app’s settings UI.

## Contributing
Contributions are welcome!

1. Fork the repo and create a feature branch
2. Make your change with clear, descriptive names and types
3. Ensure `npm run build` succeeds
4. Open a Pull Request describing the change and screenshots if UI updates

Suggested conventions:
- Keep components small and focused
- Prefer explicit, descriptive names over abbreviations
- Add comments only for non‑obvious intent or edge cases

## License
Open for personal, academic, and other non‑commercial use. Commercial use is not permitted without prior written permission. See the `LICENSE` file for details.
