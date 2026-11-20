import { describe, it, expect } from 'vitest';
import { guessLanguageFromText, guessTextLanguage, questionsAlreadyIn } from './notes.language.js';
import { liveLanguageRules } from './notes.live.js';
import { missingLabel } from './notes.emails.js';
import { newQuestion } from './notes.questions.js';

describe('call language guesses', () => {
  it('reads the language of a text, or null when nothing decides', () => {
    expect(guessTextLanguage('What is your notice period and what are you looking for?')).toBe('en');
    expect(guessTextLanguage('Quel est ton préavis et pourquoi tu veux partir ?')).toBe('fr');
    expect(guessTextLanguage('Qualif Max')).toBeNull();
  });

  it('falls back to the member language instead of French', () => {
    expect(guessLanguageFromText({ titre: 'Qualif Max', questions: [] }, 'en')).toBe('en');
    expect(guessLanguageFromText({ titre: 'Qualif Max', questions: [] })).toBe('fr');
  });

  it('skips translation when questions are already in the target language', () => {
    const en = [newQuestion('What is your notice period?'), newQuestion('Salary expectations')];
    expect(questionsAlreadyIn(en, 'en')).toBe(true);
    expect(questionsAlreadyIn([newQuestion('Quel est ton préavis ?')], 'en')).toBe(false);
  });
});

describe('live panel language rules', () => {
  it('answers in the member language, follow-ups in the spoken language', () => {
    const rules = liveLanguageRules('en', 'en');
    expect(rules).toContain('"answer" et "contradiction.text" en anglais');
    expect(rules).toContain('écris-la en anglais (langue parlée du call)');
    expect(liveLanguageRules('fr', null)).toContain('langue parlée dans les échanges');
  });
});

describe('brief email labels', () => {
  it('translates the missing items for English readers', () => {
    expect(missingLabel('CV du candidat', 'en')).toBe('Candidate CV');
    expect(missingLabel('CV du candidat', 'fr')).toBe('CV du candidat');
  });
});

describe('caption language check', () => {
  it('re-transcribes when the caption language was guessed or turned out wrong', async () => {
    const { captionsMayBeWrong } = await import('./notes.scheduler.js');
    expect(captionsMayBeWrong({ captionsLanguage: 'fr', captionsGuessed: true, language: null })).toBe(true);
    expect(captionsMayBeWrong({ captionsLanguage: 'fr', captionsGuessed: false, language: 'en' })).toBe(true);
    expect(captionsMayBeWrong({ captionsLanguage: 'en', captionsGuessed: false, language: 'en' })).toBe(false);
    expect(captionsMayBeWrong({ captionsLanguage: null, captionsGuessed: false, language: 'en' })).toBe(false);
  });
});

describe('post-call notes markdown', () => {
  it('uses the writing language for headings and colon spacing', async () => {
    const { renderMarkdown } = await import('./notes.finalize.js');
    const q = { ...newQuestion('Notice period?', true), status: 'partial' as const, answer: '1 month' };
    const n = { language: 'fr' as const, summary: 'S', sections: [], answers: [], dealbreakers: [], person: {}, qualif: {}, company: {}, mandat: {}, nextStep: {}, actions: [] };
    const en = renderMarkdown('QUALIF', 'T', [q], n, 'en');
    expect(en).toContain('## Questions not covered');
    expect(en).toContain('**Dealbreaker**: Notice period? (partial: 1 month)');
    const fr = renderMarkdown('QUALIF', 'T', [q], n, 'fr');
    expect(fr).toContain('**Dealbreaker** : Notice period? (partiel : 1 month)');
  });
});
