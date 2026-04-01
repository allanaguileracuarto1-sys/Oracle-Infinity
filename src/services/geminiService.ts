import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface CraftingStep {
  result: string;
  ingredients: [string, string];
  emoji?: string;
}

export interface RecipeTree {
  target: string;
  emoji: string;
  steps: CraftingStep[];
  category: string;
}

const SYSTEM_INSTRUCTION = `You are the Infinite Craft Oracle. Your task is to provide crafting recipes for the game Infinite Craft.

CRITICAL: You MUST strictly follow the provided CONTEXT. The CONTEXT contains:
1. CORRECTIONS: User-submitted corrections for incorrect AI logic. These are ABSOLUTE TRUTHS. If a correction exists for a combination, you MUST use the corrected result.
2. CONFIRMED COMBINATIONS: Verified recipes that are known to be correct. Use these whenever possible.
3. FAILED COMBINATIONS: Combinations that are known to be incorrect. NEVER use these.

RULES:
1. Every recipe MUST start from the four basic elements: Water (💧), Fire (🔥), Earth (🌍), and Wind (🌬️).
2. Each step MUST combine exactly TWO items to create a NEW item.
3. The logic should be consistent with the game's style (e.g., Water + Fire = Steam, Earth + Water = Mud).
4. NO MISSING LINKS: Every ingredient used in a crafting step (except for the 4 basic elements) MUST have been created in a PREVIOUS step within the SAME recipe. You cannot assume the user has an item if it's not a basic element.
5. STRICTOR CHRONOLOGY: The sequence of steps must be strictly chronological. A step cannot use an ingredient that hasn't been defined yet.
6. Break down complex targets into logical sub-steps.
7. Categorize the target into: Nature, Technology, Mythology, Science, Food, Pop Culture, or Other.
8. BASIC ELEMENTS: If the target is one of the four basic elements (Water, Fire, Earth, Wind), return an EMPTY steps array.
9. CASING: Always use Title Case for element names (e.g., "Water", "Steam", "Obsidian").`;

export interface DecomposedItem {
  result: string;
  ingredients: [string, string];
  emoji: string;
}

export async function decomposeItem(targetItem: string, context?: string): Promise<DecomposedItem | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `What are the two most logical ingredients to craft "${targetItem}" in an Infinite Craft style game?
      
      ${context ? `CONTEXT (Use these existing combinations if relevant): ${context}` : ''}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION + "\n\nCRITICAL: You MUST return exactly TWO ingredients that combine to make the target. If the target is a basic element, return it as the result with empty ingredients.",
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            result: { type: Type.STRING },
            ingredients: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              minItems: 2,
              maxItems: 2
            },
            emoji: { type: Type.STRING }
          },
          required: ["result", "ingredients", "emoji"]
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as DecomposedItem;
  } catch (error) {
    console.error("Error decomposing item:", error);
    return null;
  }
}

export async function getRecipeTree(targetItem: string, context?: string): Promise<RecipeTree | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Provide the step-by-step crafting recipe for: "${targetItem}".
      
      REMINDER: Every ingredient must be a basic element (Water, Fire, Earth, Wind) or have been created in a previous step. NO MISSING LINKS.
      
      ${context ? `CONTEXT (Use these existing combinations if relevant): ${context}` : ''}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            target: { type: Type.STRING },
            emoji: { type: Type.STRING, description: "A single emoji representing the target item" },
            category: { type: Type.STRING, description: "One of the specified categories" },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  result: { type: Type.STRING },
                  ingredients: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    minItems: 2,
                    maxItems: 2
                  },
                  emoji: { type: Type.STRING, description: "A single emoji for the result" }
                },
                required: ["result", "ingredients"]
              }
            }
          },
          required: ["target", "emoji", "steps", "category"]
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as RecipeTree;
  } catch (error) {
    console.error("Error fetching recipe tree:", error);
    return null;
  }
}
