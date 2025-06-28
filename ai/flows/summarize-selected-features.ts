// Summarize Selected Features
'use server';
/**
 * @fileOverview Summarizes selected geospatial features using AI.
 *
 * - summarizeSelectedFeatures - A function that summarizes the key attributes of selected geospatial features.
 * - SummarizeSelectedFeaturesInput - The input type for the summarizeSelectedFeatures function.
 * - SummarizeSelectedFeaturesOutput - The return type for the summarizeSelectedFeatures function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeSelectedFeaturesInputSchema = z.object({
  features: z
    .string()
    .describe('A JSON string representing an array of selected geospatial features.  Each feature should include relevant attributes.'),
});

export type SummarizeSelectedFeaturesInput = z.infer<
  typeof SummarizeSelectedFeaturesInputSchema
>;

const SummarizeSelectedFeaturesOutputSchema = z.object({
  summary: z
    .string()
    .describe('A concise summary of the key attributes and characteristics of the selected features.'),
});

export type SummarizeSelectedFeaturesOutput = z.infer<
  typeof SummarizeSelectedFeaturesOutputSchema
>;

export async function summarizeSelectedFeatures(
  input: SummarizeSelectedFeaturesInput
): Promise<SummarizeSelectedFeaturesOutput> {
  return summarizeSelectedFeaturesFlow(input);
}

const summarizeSelectedFeaturesPrompt = ai.definePrompt({
  name: 'summarizeSelectedFeaturesPrompt',
  input: {schema: SummarizeSelectedFeaturesInputSchema},
  output: {schema: SummarizeSelectedFeaturesOutputSchema},
  prompt: `You are an AI assistant that summarizes geospatial features.

  Given a JSON string representing an array of geospatial features and their attributes, provide a concise summary of their key attributes and characteristics.

  The JSON string representing the geospatial features is:
  {{features}}`,
});

const summarizeSelectedFeaturesFlow = ai.defineFlow(
  {
    name: 'summarizeSelectedFeaturesFlow',
    inputSchema: SummarizeSelectedFeaturesInputSchema,
    outputSchema: SummarizeSelectedFeaturesOutputSchema,
  },
  async input => {
    try {
      const {output} = await summarizeSelectedFeaturesPrompt(input);
      return output!;
    } catch (e) {
      console.error('Error in summarizeSelectedFeaturesFlow:', e);
      throw e;
    }
  }
);
