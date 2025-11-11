export const VOICES = [
  { name: "Puck", description: "Calm Male Voice — Medium-Fast" },
  { name: "Zephyr", description: "Friendly Male Voice — Fast" },
  { name: "Charon", description: "Deep Male Voice — Slow" },
  { name: "Kore", description: "Warm Female Voice — Medium" },
  { name: "Fenrir", description: "Rich Male Voice — Medium-Slow" },
];

export type VoiceName = (typeof VOICES)[number]["name"];
