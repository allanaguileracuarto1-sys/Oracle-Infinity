/**
 * Tipos centrales de la aplicación
 * Definiciones TypeScript para todo el proyecto
 */

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

export interface DecomposedItem {
  result: string;
  ingredients: [string, string];
  emoji: string;
}

export interface User {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role?: 'admin' | 'user';
}

export interface GlobalRecipe extends RecipeTree {
  id: string;
  discoverer: string;
  discovererName: string;
  discoveredAt: string;
}

export interface FailedRecipe {
  ingredients: [string, string];
  reportedResult: string;
  parentTarget: string;
  reportedAt: string;
  reporter: string;
}

export interface Correction {
  id: string;
  ingredients: [string, string];
  correctResult: string;
  createdAt: string;
  author: string;
}

export interface ConfirmedCombination {
  ingredients: [string, string];
  result: string;
  emoji?: string;
  source?: string;
  verifiedAt: string;
  verifier: string;
}

export interface Heuristic {
  id: string;
  rule: string;
  description: string;
  createdAt: string;
  author: string;
}

export interface Hypothesis {
  id: string;
  ingredients: [string, string];
  predictedResult: string;
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: string;
  author: string;
}

export type ViewType = 'oracle' | 'database' | 'users' | 'corrections' | 'knowledge' | 'lab' | 'heuristics';

export type Category = "All" | "Nature" | "Technology" | "Mythology" | "Science" | "Food" | "Pop Culture" | "Other";

export const CATEGORIES: Category[] = ["All", "Nature", "Technology", "Mythology", "Science", "Food", "Pop Culture", "Other"];

export const BASIC_ELEMENTS = [
  { target: "Water", emoji: "💧", category: "Nature" as Category },
  { target: "Fire", emoji: "🔥", category: "Nature" as Category },
  { target: "Earth", emoji: "🌍", category: "Nature" as Category },
  { target: "Wind", emoji: "🌬️", category: "Nature" as Category }
];

export const RPM_LIMIT = 15;
