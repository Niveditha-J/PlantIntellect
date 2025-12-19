Setup

1) Backend

- Go to `server`
- Create `.env` with:
  - `OPENWEATHER_API_KEY=YOUR_KEY`
  - `PLANTNET_API_KEY=YOUR_KEY` (optional; identify endpoint is stubbed now)
  - `PORT=4000`
- Run: `npm run dev`

2) App (Android + Web)

- Go to `plantintellect-app`
- Run: `npm run web` for web, or `npm run android` for Android

Notes

- On Android device/emulator, replace `http://localhost:4000` in `plantintellect-app/App.js` with your machine IP, e.g. `http://192.168.1.5:4000`.
- Identification uses a placeholder; wire real Pl@ntNet multipart call next.
- Dataset for India includes paddy, millets, and common home garden plants. Extend `server/data/plants.in.json` as needed.

# PlantIntellect — Chatbot Frontend

This is a small React + Vite frontend scaffold that provides a chatbot-style UI where users can:

- Send text messages
- Upload plant images from their device
- Paste a Google Drive share link (public/shareable) to preview an image

How to run (Windows, cmd.exe):

```cmd
npm install
npm run dev
```

Open the URL printed by Vite (usually http://localhost:5173).

Notes & next steps:
- For private Google Drive files or a polished Drive UX, integrate the Google Drive Picker API and OAuth to access users' Drive directly.
- To actually analyze the plant image you'll need a backend image processing endpoint or an ML model; hook the upload handlers to POST images to that API.
"# PlantIntellect" 
