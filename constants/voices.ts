export const VOICES = [
  { name: 'Zephyr', description: 'Friendly Male Voice' },
  { name: 'Puck', description: 'Calm Male Voice' },
  { name: 'Charon', description: 'Deep Male Voice' },
  { name: 'Kore', description: 'Warm Female Voice' },
  { name: 'Fenrir', description: 'Rich Male Voice' },
];

export type VoiceName = (typeof VOICES)[number]['name'];


