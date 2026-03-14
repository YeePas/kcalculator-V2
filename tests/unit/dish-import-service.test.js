import { describe, expect, it } from 'vitest';

import {
  analyzeDishNameWithAI,
  buildAiTextFallbackProposal,
  createProposalFromNutritionText,
  extractDishNameFromFreeText,
} from '../../src/ai/dish-import-service.js';

describe('extractDishNameFromFreeText', () => {
  it('extracts the dish name from a natural-language calorie question', () => {
    expect(extractDishNameFromFreeText("mag ik de calorieen voor pasta alla norma met alle macro's"))
      .toBe('pasta alla norma');
  });

  it('keeps a plain dish name intact', () => {
    expect(extractDishNameFromFreeText('caesar salad')).toBe('caesar salad');
  });
});

describe('createProposalFromNutritionText', () => {
  it('parses a pasted macro summary into a proposal', () => {
    const proposal = createProposalFromNutritionText(`🍝 Voedingswaarden per portie
Nutrient Hoeveelheid
🔥 Calorieën ±650 kcal
🍞 Koolhydraten 85 g
🍗 Eiwit 20 g
🧈 Vet 25 g
🌾 Vezels 8 g`);

    expect(proposal).not.toBeNull();
    expect(proposal?.calories).toBe(650);
    expect(proposal?.carbs_g).toBe(85);
    expect(proposal?.protein_g).toBe(20);
    expect(proposal?.fat_g).toBe(25);
    expect(proposal?.fiber_g).toBe(8);
    expect(proposal?.providerUsed).toBe('manual-parse');
  });
});

describe('buildAiTextFallbackProposal', () => {
  it('can recover macros from a non-JSON AI answer', () => {
    const proposal = buildAiTextFallbackProposal(`🍝 Voedingswaarden per portie
Calorieën 650 kcal
Koolhydraten 85 g
Eiwit 20 g
Vet 25 g
Vezels 8 g`, 'mag ik de calorieen voor pasta alla norma met alle macro\'s', 'openai');

    expect(proposal.title.toLowerCase()).toBe('pasta alla norma');
    expect(proposal.providerUsed).toBe('openai');
    expect(proposal.calories).toBe(650);
    expect(proposal.confidence).toBe('medium');
  });
});

describe('analyzeDishNameWithAI', () => {
  it('returns the locally parsed proposal when macro text is pasted', async () => {
    const proposal = await analyzeDishNameWithAI(`Voedingswaarden per portie
Calorieën 650 kcal
Koolhydraten 85 g
Eiwit 20 g
Vet 25 g
Vezels 8 g`);

    expect(proposal.calories).toBe(650);
    expect(proposal.providerUsed).toBe('manual-parse');
    expect(proposal.confidence).toBe('high');
  });
});
