import { SUPPORTED_LANGUES } from '../languages.static';

// Provide a correctly spelled export for new code
export const SUPPORTED_LANGUAGES = SUPPORTED_LANGUES;

export type LanguageTitle = (typeof SUPPORTED_LANGUAGES)[number]['title'];

// Optional default export for convenience
export default SUPPORTED_LANGUAGES;


