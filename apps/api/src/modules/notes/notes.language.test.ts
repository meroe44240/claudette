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
