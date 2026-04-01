/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Zap, Info, History, Layers, ChevronRight, Terminal, Box, Loader2, Database, Filter, User, LogIn, Trash2, Users, ArrowRight, AlertTriangle, CheckCircle, Infinity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getRecipeTree, RecipeTree, decomposeItem } from './services/geminiService';
import { CraftingSteps } from './components/CraftingSteps';
import { cn } from './lib/utils';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { collection, addDoc, query, onSnapshot, orderBy, limit, where, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';

const CATEGORIES = ["All", "Nature", "Technology", "Mythology", "Science", "Food", "Pop Culture", "Other"];

const NavButtons = ({ view, setView, hypothesesCount }: { view: string, setView: (v: any) => void, hypothesesCount: number }) => (
  <>
    <button 
      onClick={() => setView('oracle')}
      className={cn(
        "px-4 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
        view === 'oracle' ? "bg-orange-500 text-white" : "text-white/40 hover:text-white/60"
      )}
    >
      Oracle
    </button>
    <button 
      onClick={() => setView('database')}
      className={cn(
        "px-4 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
        view === 'database' ? "bg-orange-500 text-white" : "text-white/40 hover:text-white/60"
      )}
    >
      Database
    </button>
    <button 
      onClick={() => setView('knowledge')}
      className={cn(
        "px-4 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
        view === 'knowledge' ? "bg-orange-500 text-white" : "text-white/40 hover:text-white/60"
      )}
    >
      Knowledge
    </button>
    <button 
      onClick={() => setView('users')}
      className={cn(
        "px-4 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
        view === 'users' ? "bg-orange-500 text-white" : "text-white/40 hover:text-white/60"
      )}
    >
      Users
    </button>
    <button 
      onClick={() => setView('corrections')}
      className={cn(
        "px-4 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
        view === 'corrections' ? "bg-orange-500 text-white" : "text-white/40 hover:text-white/60"
      )}
    >
      Corrections
    </button>
    <button 
      onClick={() => setView('lab')}
      className={cn(
        "px-4 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all flex items-center gap-2",
        view === 'lab' ? "bg-orange-500 text-white" : "text-white/40 hover:text-white/60"
      )}
    >
      Lab
      {hypothesesCount > 0 && (
        <span className="px-1 py-0.5 rounded bg-white/20 text-[8px]">
          {hypothesesCount}
        </span>
      )}
    </button>
    <button 
      onClick={() => setView('heuristics')}
      className={cn(
        "px-4 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
        view === 'heuristics' ? "bg-orange-500 text-white" : "text-white/40 hover:text-white/60"
      )}
    >
      Heuristics
    </button>
  </>
);

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recipe, setRecipe] = useState<RecipeTree | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Firebase State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [globalRecipes, setGlobalRecipes] = useState<(RecipeTree & { id: string, discoverer: string })[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);
  const [failedRecipes, setFailedRecipes] = useState<any[]>([]);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [confirmedCombinations, setConfirmedCombinations] = useState<any[]>([]);
  const [heuristics, setHeuristics] = useState<any[]>([]);
  const [hypotheses, setHypotheses] = useState<any[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [reportingStep, setReportingStep] = useState<{ ingredients: [string, string], reportedResult: string, parentTarget: string } | null>(null);
  const [correctionInput, setCorrectionInput] = useState('');
  const [dbSearchQuery, setDbSearchQuery] = useState('');
  const [view, setView] = useState<'oracle' | 'database' | 'users' | 'corrections' | 'knowledge' | 'lab' | 'heuristics'>('oracle');
  const [showVerifySuccess, setShowVerifySuccess] = useState(false);

  // RPM Tracking
  const [requestsRemaining, setRequestsRemaining] = useState(15);
  const RPM_LIMIT = 15;

  useEffect(() => {
    const timer = setInterval(() => {
      setRequestsRemaining(RPM_LIMIT);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (showVerifySuccess) {
      const timer = setTimeout(() => setShowVerifySuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showVerifySuccess]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingCorrectionId, setEditingCorrectionId] = useState<string | null>(null);
  const [editingCorrectionInput, setEditingCorrectionInput] = useState('');

  const [isAuthReady, setIsAuthReady] = useState(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [isDbLoading, setIsDbLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        try {
          // Register/Update user in Firestore
          await setDoc(doc(db, 'users', u.uid), {
            uid: u.uid,
            displayName: u.displayName,
            email: u.email,
            photoURL: u.photoURL,
            lastLogin: new Date().toISOString(),
            role: u.email === 'allanaguileracuarto1@gmail.com' ? 'admin' : 'user'
          }, { merge: true });
        } catch (err) {
          console.error("User Registration Error:", err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setIsDbLoading(true);
    const q = query(collection(db, 'recipes'), orderBy('discoveredAt', 'desc'), limit(1000));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recipes = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
      setGlobalRecipes(recipes);
      setIsDbLoading(false);
      setFirestoreError(null);
    }, (err) => {
      console.error("Firestore Recipes Listen Error:", err);
      setFirestoreError(err.message);
      setIsDbLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (view === 'users' && user) {
      const q = query(collection(db, 'users'), orderBy('lastLogin', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data());
        setRegisteredUsers(users);
      }, (err) => console.error("Users Listen Error:", err));
      return () => unsubscribe();
    }
  }, [view, user]);

  useEffect(() => {
    const q = query(collection(db, 'failed_recipes'), orderBy('reportedAt', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const failed = snapshot.docs.map(doc => doc.data());
      setFailedRecipes(failed);
    }, (err) => console.error("Failed Recipes Listen Error:", err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'corrections'), orderBy('createdAt', 'desc'), limit(500));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setCorrections(data);
    }, (err) => console.error("Corrections Listen Error:", err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'confirmed_combinations'), orderBy('verifiedAt', 'desc'), limit(1000));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      setConfirmedCombinations(data);
    }, (err) => console.error("Confirmed Combinations Listen Error:", err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'heuristics'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setHeuristics(data);
    }, (err) => console.error("Heuristics Listen Error:", err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'hypotheses'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setHypotheses(data);
    }, (err) => console.error("Hypotheses Listen Error:", err));
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      console.log("Attempting login...");
      
      // Explicitly set persistence to local
      await setPersistence(auth, browserLocalPersistence);
      
      const provider = new GoogleAuthProvider();
      // Add custom parameters to force account selection if needed
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      console.log("Login successful:", result.user.email);
    } catch (err: any) {
      console.error("Login Error Details:", {
        code: err.code,
        message: err.message,
        customData: err.customData,
        email: err.email
      });
      
      if (err.code === 'auth/popup-closed-by-user') {
        console.warn("Popup was closed before completion.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        console.warn("Popup request was cancelled.");
      } else if (err.code === 'auth/internal-error') {
        console.error("Internal Firebase Auth error. Check configuration.");
      } else if (err.code === 'auth/network-request-failed') {
        console.error("Network request failed. This might be due to third-party cookie blocking.");
      }
    }
  };

  const handleDeleteRecipe = async (recipeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!recipeId) {
      console.error("Delete Error: No recipe ID provided");
      return;
    }
    
    console.log("Attempting to delete recipe:", recipeId);
    
    try {
      setIsLoading(true);
      await deleteDoc(doc(db, 'recipes', recipeId));
      console.log("Recipe deleted successfully:", recipeId);
      setDeletingId(null);
    } catch (err) {
      console.error("Delete Error:", err);
      setError("You don't have permission to delete this record.");
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const saveRecipeToGlobal = async (newRecipe: RecipeTree) => {
    if (!user) return;
    try {
      const targetLower = newRecipe.target.toLowerCase().trim();
      // Optimized check: only query for the specific target
      const q = query(collection(db, 'recipes'), where('target', '==', newRecipe.target.trim()));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // Double check with lowercase just in case
        const q2 = query(collection(db, 'recipes'), where('target', '==', targetLower));
        const snapshot2 = await getDocs(q2);
        
        if (snapshot2.empty) {
          await addDoc(collection(db, 'recipes'), {
            ...newRecipe,
            target: newRecipe.target.trim(),
            discoveredAt: new Date().toISOString(),
            discoverer: user.uid,
            discovererName: user.displayName || 'Anonymous'
          });
        }
      }
    } catch (err) {
      console.error("Save Error:", err);
    }
  };

  // Derived state for unique crafts (combinations)
  const allLearnedCrafts = useMemo(() => {
    const uniqueMap = new Map<string, { ingredients: [string, string], result: string, source: string, emoji?: string }>();
    const normalize = (s: string) => s?.trim() || '';
    const normalizeKey = (s: string) => s?.trim().toLowerCase() || '';

    // 1. Add from confirmed combinations (User verified)
    confirmedCombinations.forEach(c => {
      if (c.ingredients && Array.isArray(c.ingredients) && c.ingredients.length === 2 && c.result) {
        const key = c.ingredients.map(normalizeKey).sort().join('+');
        uniqueMap.set(key, { 
          ingredients: [normalize(c.ingredients[0]), normalize(c.ingredients[1])], 
          result: normalize(c.result), 
          source: c.source || 'Verified',
          emoji: c.emoji
        });
      }
    });

    // 2. Add from corrections (User corrected)
    corrections.forEach(c => {
      if (c.ingredients && Array.isArray(c.ingredients) && c.ingredients.length === 2 && c.correctResult) {
        const key = c.ingredients.map(normalizeKey).sort().join('+');
        uniqueMap.set(key, { 
          ingredients: [normalize(c.ingredients[0]), normalize(c.ingredients[1])], 
          result: normalize(c.correctResult), 
          source: 'Correction',
          emoji: '✨'
        });
      }
    });

    return Array.from(uniqueMap.values()).sort((a, b) => a.result.localeCompare(b.result));
  }, [confirmedCombinations, corrections]);

  const totalUniqueCrafts = useMemo(() => {
    if (allLearnedCrafts.length > 0) {
      console.log("Crafting Knowledge Count:", {
        total: allLearnedCrafts.length,
        fromRecipes: globalRecipes.length,
        fromConfirmed: confirmedCombinations.length,
        fromCorrections: corrections.length
      });
    }
    return allLearnedCrafts.length;
  }, [allLearnedCrafts, globalRecipes.length, confirmedCombinations.length, corrections.length]);

  // Seed initial elements if missing
  const seedInitialElements = async () => {
    const basicElements = [
      { target: "Water", emoji: "💧", category: "Nature", steps: [] },
      { target: "Fire", emoji: "🔥", category: "Nature", steps: [] },
      { target: "Earth", emoji: "🌍", category: "Nature", steps: [] },
      { target: "Wind", emoji: "🌬️", category: "Nature", steps: [] }
    ];

    try {
      for (const el of basicElements) {
        const q = query(collection(db, 'recipes'), where('target', '==', el.target));
        const snap = await getDocs(q);
        if (snap.empty) {
          await addDoc(collection(db, 'recipes'), {
            ...el,
            discoveredAt: new Date().toISOString(),
            discoverer: "system"
          });
        }
      }

      // Also check if we should seed the other initial ones if the DB is truly empty
      const qAll = query(collection(db, 'recipes'), limit(10));
      const snapAll = await getDocs(qAll);
      if (snapAll.size <= 4) {
        const extraElements = [
          { 
            target: "Steam", 
            emoji: "💨", 
            category: "Nature", 
            steps: [{ result: "Steam", ingredients: ["Water", "Fire"], emoji: "💨" }] 
          },
          { 
            target: "Mud", 
            emoji: "💩", 
            category: "Nature", 
            steps: [{ result: "Mud", ingredients: ["Water", "Earth"], emoji: "💩" }] 
          },
          { 
            target: "Dust", 
            emoji: "🌫️", 
            category: "Nature", 
            steps: [{ result: "Dust", ingredients: ["Earth", "Wind"], emoji: "🌫️" }] 
          },
          { 
            target: "Lava", 
            emoji: "🌋", 
            category: "Nature", 
            steps: [{ result: "Lava", ingredients: ["Fire", "Earth"], emoji: "🌋" }] 
          }
        ];

        for (const el of extraElements) {
          const q = query(collection(db, 'recipes'), where('target', '==', el.target));
          const snap = await getDocs(q);
          if (snap.empty) {
            await addDoc(collection(db, 'recipes'), {
              ...el,
              discoveredAt: new Date().toISOString(),
              discoverer: "system"
            });
          }
        }
      }
      console.log("Initial elements seeded successfully.");
    } catch (err) {
      console.error("Seeding Error:", err);
    }
  };

  useEffect(() => {
    seedInitialElements();
  }, []); // Only run once on mount

  const getRelevantContext = (query: string) => {
    const q = query.toLowerCase();
    const keywords = q.split(/\s+/).filter(k => k.length > 2);
    
    const filterByRelevance = (list: any[], field: string) => {
      if (keywords.length === 0) return list.slice(0, 10);
      return list
        .filter(item => {
          const text = (item[field] || '').toLowerCase();
          const ingredients = (item.ingredients || []).join(' ').toLowerCase();
          return keywords.some(k => text.includes(k) || ingredients.includes(k));
        })
        .slice(0, 20);
    };

    const relevantCorrections = filterByRelevance(corrections, 'correctResult');
    const relevantConfirmed = filterByRelevance(confirmedCombinations, 'result');
    const relevantRecipes = filterByRelevance(globalRecipes, 'target');
    const relevantHeuristics = heuristics.filter(h => {
      const pattern = h.pattern.toLowerCase();
      return keywords.some(k => pattern.includes(k));
    }).slice(0, 10);

    return {
      corrections: relevantCorrections,
      confirmed: relevantConfirmed,
      recipes: relevantRecipes,
      heuristics: relevantHeuristics
    };
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const queryTarget = searchQuery.toLowerCase().trim();
      
      // 1. Check Local Cache First (Instant)
      const archiveMatch = globalRecipes.find(r => r.target.toLowerCase().trim() === queryTarget);
      if (archiveMatch) {
        console.log("Oracle: Match found in local cache.");
        setRecipe(archiveMatch);
        setHistory(prev => [archiveMatch.target, ...prev.filter(h => h !== archiveMatch.target)].slice(0, 5));
        setIsLoading(false);
        return;
      }

      // 2. Check Remote Database (Thorough)
      console.log("Oracle: Checking remote database for:", queryTarget);
      const normalizedQuery = searchQuery.trim().charAt(0).toUpperCase() + searchQuery.trim().slice(1).toLowerCase();
      const q = query(
        collection(db, 'recipes'), 
        where('target', 'in', [
          searchQuery.trim(), 
          normalizedQuery, 
          searchQuery.trim().toLowerCase(), 
          searchQuery.trim().toUpperCase()
        ])
      );
      
      const snap = await getDocs(q);
      if (!snap.empty) {
        console.log("Oracle: Match found in remote database.");
        const found = { ...snap.docs[0].data(), id: snap.docs[0].id } as any;
        setRecipe(found);
        setHistory(prev => [found.target, ...prev.filter(h => h !== found.target)].slice(0, 5));
        setIsLoading(false);
        return;
      }

      // 3. AI Generation (If not found anywhere)
      console.log("Oracle: No match found. Synthesizing new recipe...");
      if (requestsRemaining <= 0) {
        setError("Rate limit reached. Please wait a minute.");
        setIsLoading(false);
        return;
      }
      setRequestsRemaining(prev => prev - 1);

      // 3. Build Semantic Context (Idea 1)
      const contextData = getRelevantContext(searchQuery);
      
      const correctionContext = contextData.corrections
        .map(c => `CORRECTION: ${c.ingredients.join(' + ')} = ${c.correctResult} (MANDATORY)`)
        .join('. ');

      const confirmedContext = contextData.confirmed
        .map(c => `CONFIRMED: ${c.ingredients.join(' + ')} = ${c.result}`)
        .join('. ');

      const positiveContext = contextData.recipes
        .map(r => `${r.target} = ${r.steps[r.steps.length - 1]?.ingredients.join(' + ') || 'Basic Element'}`)
        .join(', ');

      const heuristicContext = contextData.heuristics
        .map(h => `PATTERN: ${h.pattern}`)
        .join('. ');

      const negativeContext = failedRecipes
        .slice(0, 10)
        .map(f => `DO NOT USE: ${f.ingredients.join(' + ')} = ${f.target} (INCORRECT)`)
        .join('. ');

      const context = `SYSTEM KNOWLEDGE BASE (STRICTLY FOLLOW THESE):
      [HEURISTICS/PATTERNS]: ${heuristicContext}
      [VERIFIED CORRECTIONS - HIGHEST PRIORITY]: ${correctionContext}
      [CONFIRMED COMBINATIONS]: ${confirmedContext}
      [SUCCESSFUL EXAMPLES]: ${positiveContext}
      [FORBIDDEN COMBINATIONS]: ${negativeContext}`;

      console.log("Oracle Context Built (Semantic):", { 
        corrections: contextData.corrections.length, 
        confirmed: contextData.confirmed.length, 
        heuristics: contextData.heuristics.length
      });

      const result = await getRecipeTree(searchQuery, context);
      
      if (!result) {
        // 3. Recursive Decomposition (Idea 5)
        console.log("Oracle attempting recursive decomposition for:", searchQuery);
        const decomposition = await decomposeItem(searchQuery, context);
        
        if (decomposition && decomposition.ingredients.length === 2) {
          const [ing1, ing2] = decomposition.ingredients;
          
          // Helper to get recipe for sub-ingredient
          const getSubRecipe = async (target: string) => {
            const match = globalRecipes.find(r => r.target.toLowerCase() === target.toLowerCase());
            if (match) return match;
            return await getRecipeTree(target, context);
          };

          const recipe1 = await getSubRecipe(ing1);
          const recipe2 = await getSubRecipe(ing2);

          if (recipe1 && recipe2) {
            const combinedRecipe: RecipeTree = {
              target: decomposition.result,
              emoji: decomposition.emoji || '❓',
              category: 'Synthetic',
              steps: [
                ...recipe1.steps,
                ...recipe2.steps,
                {
                  result: decomposition.result,
                  ingredients: [recipe1.target, recipe2.target],
                  emoji: decomposition.emoji || '❓'
                }
              ]
            };
            setRecipe(combinedRecipe);
            setHistory(prev => [combinedRecipe.target, ...prev.filter(h => h !== combinedRecipe.target)].slice(0, 5));
            if (user) saveRecipeToGlobal(combinedRecipe);
            setIsLoading(false);
            return;
          }
        }
      }

      if (result) {
        setRecipe(result);
        setHistory(prev => [result.target, ...prev.filter(h => h !== result.target)].slice(0, 5));
        if (user) saveRecipeToGlobal(result);
      } else {
        setError("Could not compute recipe for this element.");
      }
    } catch (err) {
      setError("An error occurred while accessing the Oracle.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReportError = async (recipe: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    try {
      setIsLoading(true);
      // Log as failed recipe
      const lastStep = recipe.steps[recipe.steps.length - 1];
      if (lastStep) {
        await addDoc(collection(db, 'failed_recipes'), {
          target: recipe.target,
          ingredients: lastStep.ingredients,
          reportedBy: user.uid,
          reportedAt: new Date().toISOString()
        });
      }
      // Delete from global
      await deleteDoc(doc(db, 'recipes', recipe.id));
      setDeletingId(null);
      console.log("Recipe reported and removed.");
    } catch (err) {
      console.error("Report Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReportStep = (ingredients: [string, string], reportedResult: string, parentTarget: string) => {
    if (!user) {
      setError("Please sign in to report errors.");
      return;
    }
    setReportingStep({ ingredients, reportedResult, parentTarget });
    setCorrectionInput('');
  };

  const submitCorrection = async () => {
    if (!reportingStep || !correctionInput.trim() || !user) return;

    try {
      setIsLoading(true);
      // 1. Log correction
      await addDoc(collection(db, 'corrections'), {
        ingredients: reportingStep.ingredients,
        reportedResult: reportingStep.reportedResult,
        correctResult: correctionInput.trim(),
        reportedBy: user.uid,
        createdAt: new Date().toISOString()
      });

      // 2. Log as failed recipe
      await addDoc(collection(db, 'failed_recipes'), {
        target: reportingStep.reportedResult,
        ingredients: reportingStep.ingredients,
        reportedBy: user.uid,
        reportedAt: new Date().toISOString()
      });

      // 3. Delete the recipe that was being viewed (parentTarget)
      // and also the reportedResult if it's different
      const targetsToDelete = [reportingStep.parentTarget];
      if (reportingStep.reportedResult !== reportingStep.parentTarget) {
        targetsToDelete.push(reportingStep.reportedResult);
      }

      for (const targetName of targetsToDelete) {
        const q = query(collection(db, 'recipes'), where('target', '==', targetName));
        const snapshot = await getDocs(q);
        for (const docSnap of snapshot.docs) {
          await deleteDoc(docSnap.ref);
        }
      }

      setReportingStep(null);
      setCorrectionInput('');
      setRecipe(null); // Clear current recipe as it's now invalid
      console.log("Correction submitted and invalid recipes removed.");
    } catch (err) {
      console.error("Submit Correction Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyRecipe = async (recipe: RecipeTree, source: string = 'Verified') => {
    if (!user) return;
    try {
      setIsLoading(true);
      // 1. Save recipe to global if not there (Skip for Lab discoveries to keep them as "Knowledge" only)
      if (source !== 'Lab') {
        await saveRecipeToGlobal(recipe);
      }

      // 2. Save each step as a confirmed combination
      for (const step of recipe.steps) {
        const sortedIngredients = [...step.ingredients].sort();
        const q = query(
          collection(db, 'confirmed_combinations'), 
          where('ingredients', '==', sortedIngredients),
          where('result', '==', step.result)
        );
        const existing = await getDocs(q);
        if (existing.empty) {
          await addDoc(collection(db, 'confirmed_combinations'), {
            ingredients: sortedIngredients,
            result: step.result,
            emoji: step.emoji || '✨',
            verifiedBy: user.uid,
            verifiedAt: new Date().toISOString(),
            source: source
          });
        }
      }
      setShowVerifySuccess(true);
      console.log("Recipe and steps verified.");
    } catch (err) {
      console.error("Verify Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCorrection = async (id: string) => {
    if (!user || !id) return;
    try {
      await deleteDoc(doc(db, 'corrections', id));
    } catch (err) {
      console.error("Delete Correction Error:", err);
    }
  };

  const startEditingCorrection = (c: any) => {
    setEditingCorrectionId(c.id);
    setEditingCorrectionInput(c.correctResult);
  };

  const handleUpdateCorrection = async () => {
    if (!user || !editingCorrectionId || !editingCorrectionInput.trim()) return;
    try {
      setIsLoading(true);
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'corrections', editingCorrectionId), {
        correctResult: editingCorrectionInput.trim(),
        updatedAt: new Date().toISOString()
      });
      setEditingCorrectionId(null);
      setEditingCorrectionInput('');
    } catch (err) {
      console.error("Update Correction Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateDiscoverySuggestions = async () => {
    if (!user || requestsRemaining <= 0) return;
    setIsDiscovering(true);
    setRequestsRemaining(prev => prev - 1);
    try {
      const { GoogleGenAI, Type } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      // Pick 5 random items from global recipes to use as basis
      const basis = globalRecipes
        .sort(() => 0.5 - Math.random())
        .slice(0, 8)
        .map(r => r.target);

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Based on these items: ${basis.join(', ')}, suggest 5 new interesting combinations that might exist in Infinite Craft.
        Return them as an array of objects with result, ingredients (array of 2), and emoji.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                result: { type: Type.STRING },
                ingredients: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 2, maxItems: 2 },
                emoji: { type: Type.STRING }
              },
              required: ["result", "ingredients", "emoji"]
            }
          }
        }
      });

      const suggestions = JSON.parse(response.text);
      
      // Filter out suggestions that are already learned
      const normalizeKey = (s: string) => s?.trim().toLowerCase() || '';
      const learnedKeys = new Set(allLearnedCrafts.map(c => c.ingredients.map(normalizeKey).sort().join('+')));
      const learnedResults = new Set(allLearnedCrafts.map(c => c.result.toLowerCase()));
      
      const filteredSuggestions = suggestions.filter((s: any) => {
        const key = s.ingredients.map(normalizeKey).sort().join('+');
        return !learnedKeys.has(key) && !learnedResults.has(s.result.toLowerCase());
      });

      // Save suggestions to Firestore
      for (const s of filteredSuggestions) {
        await addDoc(collection(db, 'hypotheses'), {
          ...s,
          createdBy: user.uid,
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error("Discovery Error:", err);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAddHeuristic = async (pattern: string) => {
    if (!user || !pattern.trim()) return;
    try {
      await addDoc(collection(db, 'heuristics'), {
        pattern: pattern.trim(),
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Add Heuristic Error:", err);
    }
  };

  const handleDeleteHeuristic = async (id: string) => {
    if (!user || !id) return;
    try {
      await deleteDoc(doc(db, 'heuristics', id));
    } catch (err) {
      console.error("Delete Heuristic Error:", err);
    }
  };

  const filteredRecipes = globalRecipes.filter(r => {
    const matchesCategory = selectedCategory === 'All' || r.category === selectedCategory;
    const matchesSearch = r.target.toLowerCase().includes(dbSearchQuery.toLowerCase()) || 
                         r.emoji.includes(dbSearchQuery);
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#E4E4E7] font-sans selection:bg-orange-500/30">
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <header className="relative border-b border-white/5 bg-black/20 backdrop-blur-md z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tighter uppercase">Infinite Craft Oracle</h1>
              <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Recipe Neural Engine v2.4</p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
            <NavButtons view={view} setView={setView} hypothesesCount={hypotheses.length} />
          </nav>
          
          <div className="flex items-center gap-6">
            {user ? (
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center overflow-hidden border border-orange-500/40">
                  {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <User className="w-3 h-3 text-orange-500" />}
                </div>
                <span className="text-[10px] font-mono text-white/60 uppercase tracking-widest truncate max-w-[100px]">
                  {user.displayName?.split(' ')[0]}
                </span>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500 hover:bg-orange-600 text-[10px] font-mono uppercase tracking-widest transition-all"
              >
                <LogIn className="w-3 h-3" />
                Connect
              </button>
            )}
          </div>
        </div>
        
        {/* Mobile Navigation */}
        <div className="lg:hidden border-t border-white/5 overflow-x-auto no-scrollbar">
          <nav className="flex items-center gap-1 p-2 min-w-max">
            <NavButtons view={view} setView={setView} hypothesesCount={hypotheses.length} />
          </nav>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-6 py-12 z-10">
        <AnimatePresence mode="wait">
          {view === 'oracle' ? (
            <motion.div 
              key="oracle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              {/* Oracle UI (Existing logic) */}
              <div className="lg:col-span-4 space-y-6">
                <section className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-3 h-3" />
                      Element Inquiry
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-[8px] font-mono text-orange-500">
                      <Zap className="w-2 h-2" />
                      {requestsRemaining} RPM
                    </div>
                  </h2>
                  <form onSubmit={handleSearch} className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Enter element name..."
                      className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all placeholder:text-white/20"
                    />
                    <button 
                      type="submit"
                      disabled={isLoading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-white/10 rounded-md transition-colors"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </form>
                  {!user && (
                    <p className="mt-3 text-[10px] text-orange-500/60 font-mono flex items-center gap-2">
                      <Info className="w-3 h-3" />
                      Connect to save discoveries
                    </p>
                  )}
                </section>

                <section className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                    <Info className="w-3 h-3" />
                    System Intel
                  </h2>
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/10">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Recetas Totales</h3>
                        <span className="text-[10px] font-mono text-orange-500/60">{globalRecipes.length} Items</span>
                      </div>
                      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (globalRecipes.length / 500) * 100)}%` }}
                          className="h-full bg-orange-500"
                        />
                      </div>
                      <p className="text-[8px] text-white/30 font-mono mt-2 uppercase tracking-tighter">Objetos únicos descubiertos</p>
                    </div>

                    <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Verified Knowledge</h3>
                        <span className="text-[10px] font-mono text-blue-400/60">{corrections.length + confirmedCombinations.length} Verified</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-lg bg-black/20 border border-white/5">
                          <p className="text-[8px] text-white/40 uppercase tracking-widest mb-1">Corrections</p>
                          <p className="text-xs font-bold text-white/80">{corrections.length}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-black/20 border border-white/5">
                          <p className="text-[8px] text-white/40 uppercase tracking-widest mb-1">Confirmed</p>
                          <p className="text-xs font-bold text-white/80">{confirmedCombinations.length}</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Oracle (AI)</h3>
                      <p className="text-[10px] text-white/40 leading-relaxed">
                        Uses Gemini AI to synthesize new recipes. Analyzes patterns from confirmed data to improve logic.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Database (Archive)</h3>
                      <p className="text-[10px] text-white/40 leading-relaxed">
                        Stores discovered recipes permanently. Instant access, no limits.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                    <History className="w-3 h-3" />
                    Recent Queries
                  </h2>
                  <div className="space-y-2">
                    {history.length === 0 ? (
                      <p className="text-xs text-white/20 italic">No recent activity detected.</p>
                    ) : (
                      history.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => { setSearchQuery(item); handleSearch(); }}
                          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 text-xs text-white/60 transition-colors group"
                        >
                          <span>{item}</span>
                          <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div className="lg:col-span-8 space-y-8">
                <div className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/10 backdrop-blur-sm flex items-center justify-between gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                      <Layers className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Crafteos Conocidos</h3>
                      <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">{totalUniqueCrafts} Combinaciones Únicas</p>
                    </div>
                  </div>
                  <div className="flex-1 max-w-[200px]">
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (totalUniqueCrafts / 1000) * 100)}%` }}
                        className="h-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                      />
                    </div>
                  </div>
                </div>

                {isLoading ? (
                  <div className="h-[600px] flex flex-col items-center justify-center gap-4 p-12 rounded-3xl bg-white/5 border border-white/10">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full border-2 border-orange-500/20 border-t-orange-500 animate-spin" />
                      <Box className="w-6 h-6 text-orange-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Synthesizing Recipe</p>
                  </div>
                ) : recipe ? (
                  <div className="space-y-8">
                    <div className="p-8 rounded-3xl bg-white/5 border border-white/10 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <span className="text-9xl">{recipe.emoji}</span>
                      </div>
                      <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-4">
                          <span className="text-4xl">{recipe.emoji}</span>
                          <div>
                            <h2 className="text-3xl font-bold tracking-tighter uppercase">{recipe.target}</h2>
                            <p className="text-[10px] font-mono text-orange-500 uppercase tracking-widest">{recipe.category} Element Identified</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono uppercase tracking-widest text-white/60">
                            Complexity: {recipe.steps.length} Steps
                          </div>
                          {(recipe as any).discoveredAt ? (
                            <div className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-[10px] font-mono uppercase tracking-widest text-green-500 flex items-center gap-1.5">
                              <Database className="w-3 h-3" />
                              Archive Match {(recipe as any).discovererName ? `• By ${(recipe as any).discovererName}` : ''}
                            </div>
                          ) : (
                            <div className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-mono uppercase tracking-widest text-orange-500 flex items-center gap-1.5">
                              <Zap className="w-3 h-3" />
                              New Synthesis
                            </div>
                          )}
                        </div>
                      </div>

                      {user && !(recipe as any).discoveredAt && (
                        <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-end gap-4">
                          <AnimatePresence>
                            {showVerifySuccess && (
                              <motion.div 
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="text-[10px] font-mono text-green-500 uppercase tracking-widest flex items-center gap-2"
                              >
                                <CheckCircle className="w-3 h-3" />
                                Knowledge Base Updated
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <button
                            onClick={() => handleVerifyRecipe(recipe)}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all shadow-lg shadow-green-500/20 group"
                          >
                            {isLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3 h-3 group-hover:scale-110 transition-transform" />
                            )}
                            {isLoading ? 'Verifying...' : 'Verify Recipe & Save Steps'}
                          </button>
                        </div>
                      )}
                    </div>
                    <CraftingSteps data={recipe} onReportStep={handleReportStep} />
                  </div>
                ) : (
                  <div className="h-[600px] flex flex-col items-center justify-center text-center p-12 rounded-3xl bg-white/5 border border-white/10 border-dashed">
                    <Box className="w-8 h-8 text-white/20 mb-4" />
                    <h2 className="text-xl font-bold tracking-tight mb-2">Awaiting Element Inquiry</h2>
                  </div>
                )}
              </div>
            </motion.div>
          ) : view === 'database' ? (
            <motion.div 
              key="database"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tighter uppercase flex items-center gap-3">
                    <Database className="w-6 h-6 text-orange-500" />
                    Global Archive
                  </h2>
                  <p className="text-xs text-white/40 font-mono uppercase tracking-widest mt-1">
                    {globalRecipes.length} Elements Discovered by the Community
                  </p>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20" />
                    <input 
                      type="text"
                      placeholder="Search database..."
                      value={dbSearchQuery}
                      onChange={(e) => setDbSearchQuery(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-8 pr-3 text-[10px] font-mono uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-orange-500/50 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                    <Filter className="w-3 h-3 text-white/20 mr-2 shrink-0" />
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest border transition-all shrink-0",
                          selectedCategory === cat 
                            ? "bg-orange-500 border-orange-500 text-white" 
                            : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {isDbLoading ? (
                  <div className="col-span-full py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-4" />
                    <p className="text-sm text-white/20 uppercase tracking-widest font-mono">Synchronizing with Archive...</p>
                  </div>
                ) : firestoreError ? (
                  <div className="col-span-full py-20 text-center px-6">
                    <div className="max-w-md mx-auto p-6 rounded-3xl bg-red-500/5 border border-red-500/20">
                      <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-4" />
                      <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest mb-2">Connection Interrupted</h3>
                      <p className="text-xs text-white/40 mb-6">{firestoreError}</p>
                      <div className="text-left space-y-4">
                        <p className="text-[10px] font-mono text-white/60 uppercase tracking-widest border-b border-white/5 pb-2">Troubleshooting:</p>
                        <ul className="text-[10px] space-y-2 text-white/40 list-disc pl-4">
                          <li>If you recently <b>remixed</b> this app, you must re-setup Firebase in the settings.</li>
                          <li>Check if your <b>Firebase Rules</b> allow public read access.</li>
                          <li>Ensure your <b>API Key</b> and <b>Database ID</b> are correct in the config.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : filteredRecipes.length === 0 ? (
                  <div className="col-span-full py-20 text-center">
                    <p className="text-sm text-white/20 uppercase tracking-widest font-mono">No elements found in this sector.</p>
                    <button 
                      onClick={() => seedInitialElements()}
                      className="mt-4 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-mono uppercase tracking-widest text-white/40 transition-all"
                    >
                      Re-seed Basic Elements
                    </button>
                  </div>
                ) : (
                  filteredRecipes.map((r, i) => (
                    <motion.div
                      key={r.id || i}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { setRecipe(r); setView('oracle'); }}
                      className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-orange-500/30 transition-all text-left group relative overflow-hidden cursor-pointer"
                    >
                      <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <span className="text-6xl">{r.emoji}</span>
                      </div>
                      <div className="flex justify-between items-start mb-2 relative z-30">
                        <div className="text-2xl">{r.emoji}</div>
                        {(user?.uid === r.discoverer || user?.email === 'allanaguileracuarto1@gmail.com') && (
                          <div className="flex gap-1">
                            {deletingId === r.id ? (
                              <div className="flex gap-1 animate-in fade-in slide-in-from-right-2">
                                <button 
                                  onClick={(e) => handleDeleteRecipe(r.id, e)}
                                  className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-[8px] font-bold uppercase transition-colors"
                                >
                                  Delete
                                </button>
                                <button 
                                  onClick={(e) => handleReportError(r, e)}
                                  className="p-1.5 rounded-md bg-red-500 hover:bg-red-600 text-white text-[8px] font-bold uppercase transition-colors"
                                >
                                  Report Error
                                </button>
                                <button 
                                  onClick={(e) => { 
                                    e.preventDefault();
                                    e.stopPropagation(); 
                                    setDeletingId(null); 
                                  }}
                                  className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-[8px] font-bold uppercase transition-colors"
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={(e) => { 
                                  e.preventDefault();
                                  e.stopPropagation(); 
                                  setDeletingId(r.id); 
                                }}
                                className="p-1.5 rounded-md bg-white/5 hover:bg-red-500/20 text-white/20 hover:text-red-500 border border-white/10 transition-all"
                                title="Delete discovery"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <h3 className="text-xs font-bold uppercase tracking-tight truncate">{r.target}</h3>
                      <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest mt-1">{r.category}</p>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          ) : view === 'users' ? (
            <motion.div 
              key="users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tighter uppercase flex items-center gap-3">
                    <Users className="w-6 h-6 text-orange-500" />
                    Oracle Custodians
                  </h2>
                  <p className="text-xs text-white/40 font-mono uppercase tracking-widest mt-1">
                    {registeredUsers.length} Registered Researchers
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {registeredUsers.map((u, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center overflow-hidden">
                      {u.photoURL ? (
                        <img src={u.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="w-6 h-6 text-orange-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold truncate">{u.displayName}</h3>
                        {u.role === 'admin' && (
                          <span className="px-1.5 py-0.5 rounded bg-orange-500 text-[8px] font-bold text-white uppercase tracking-widest">Admin</span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/40 font-mono truncate">{u.email}</p>
                      <p className="text-[9px] text-white/20 font-mono uppercase tracking-widest mt-1">
                        Last Active: {new Date(u.lastLogin).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : view === 'knowledge' ? (
            <motion.div 
              key="knowledge"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tighter uppercase flex items-center gap-3">
                    <Zap className="w-6 h-6 text-orange-500" />
                    Neural Knowledge Base
                  </h2>
                  <p className="text-xs text-white/40 font-mono uppercase tracking-widest mt-1">
                    {allLearnedCrafts.length} Unique Combinations Synthesized
                  </p>
                </div>
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="text"
                    value={dbSearchQuery}
                    onChange={(e) => setDbSearchQuery(e.target.value)}
                    placeholder="Search knowledge..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                  <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-2">Discovery Lab</h3>
                  <p className="text-[10px] text-white/60 leading-relaxed">
                    The Lab is where the AI generates hypotheses for new combinations. When you confirm a discovery in the Lab, it becomes a permanent part of the Neural Knowledge Base, helping the Oracle learn faster through human validation.
                  </p>
                </div>
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                  <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Verified Knowledge</h3>
                  <p className="text-[10px] text-white/60 leading-relaxed">
                    Every combination labeled as "Verified" has been confirmed by a user. These are the most reliable paths in the database, used by the AI to build more complex reasoning patterns.
                  </p>
                </div>
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                  <h3 className="text-xs font-bold text-orange-500/60 uppercase tracking-widest mb-2">Community Corrections</h3>
                  <p className="text-[10px] text-white/60 leading-relaxed">
                    If the AI makes a mistake, the community can submit corrections. These adjustments are immediately integrated into the Oracle's logic, ensuring the knowledge base evolves accurately.
                  </p>
                </div>
              </div>

              <div className="p-8 rounded-3xl bg-orange-500/5 border border-orange-500/20">
                <div className="flex items-start gap-6">
                  <div className="p-4 rounded-2xl bg-orange-500/10">
                    <Infinity className="w-8 h-8 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white uppercase tracking-tighter mb-2">How Infinite Craft Logic Works</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Semantic Synthesis</h4>
                          <p className="text-xs text-white/60 leading-relaxed">
                            Combinations aren't just random; they follow semantic and conceptual logic. Combining "Water" and "Fire" creates "Steam", while "Earth" and "Water" creates "Plant". The AI uses Large Language Models to understand these relationships.
                          </p>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Infinite Possibilities</h4>
                          <p className="text-xs text-white/60 leading-relaxed">
                            There are no hardcoded recipes. Every time you combine two items, the AI reasons through what the result should be. This allows for "First Discoveries"—combinations that no one in the world has ever seen before.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">The Core Four</h4>
                          <p className="text-xs text-white/60 leading-relaxed">
                            Everything starts with the four basic elements: Water, Fire, Earth, and Wind. From these simple building blocks, you can eventually synthesize complex concepts like "Internet", "Philosophy", or "Supernova".
                          </p>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Contextual Learning</h4>
                          <p className="text-xs text-white/60 leading-relaxed">
                            The Oracle learns from your interactions. If many users correct a specific combination, the AI adjusts its internal heuristics to better match human intuition and logical consistency.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allLearnedCrafts
                  .filter(c => 
                    c.result.toLowerCase().includes(dbSearchQuery.toLowerCase()) ||
                    c.ingredients.some(i => i.toLowerCase().includes(dbSearchQuery.toLowerCase()))
                  )
                  .map((c, i) => (
                    <div key={i} className="group p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-orange-500/30 transition-all">
                      <div className="flex items-center justify-between mb-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest",
                          c.source === 'Correction' ? "bg-orange-500/20 text-orange-500" :
                          c.source === 'Verified' ? "bg-blue-500/20 text-blue-400" :
                          c.source === 'Lab' ? "bg-purple-500/20 text-purple-400" :
                          "bg-white/10 text-white/40"
                        )}>
                          {c.source}
                        </span>
                        <span className="text-lg">{c.emoji}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-1 flex-1">
                          <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono uppercase tracking-tighter">
                            <span className="truncate">{c.ingredients[0]}</span>
                            <span className="text-orange-500/40">+</span>
                            <span className="truncate">{c.ingredients[1]}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <ArrowRight className="w-3 h-3 text-orange-500" />
                            <span className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors">{c.result}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </motion.div>
          ) : view === 'corrections' ? (
            <motion.div 
              key="corrections"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tighter uppercase flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-orange-500" />
                    Community Corrections
                  </h2>
                  <p className="text-xs text-white/40 font-mono uppercase tracking-widest mt-1">
                    {corrections.length} Active Corrections in Neural Context
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {firestoreError ? (
                  <div className="col-span-full p-12 rounded-3xl bg-red-500/5 border border-red-500/20 text-center">
                    <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-4" />
                    <p className="text-xs text-red-500/60 uppercase tracking-widest font-mono">Database connection error. Please check your Firebase configuration.</p>
                  </div>
                ) : corrections.length === 0 ? (
                  <div className="col-span-full p-12 rounded-3xl bg-white/5 border border-white/10 border-dashed text-center">
                    <p className="text-sm text-white/20 uppercase tracking-widest font-mono">No corrections submitted yet.</p>
                  </div>
                ) : (
                  corrections.map((c, i) => (
                    <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                          <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Correction #{corrections.length - i}</span>
                        </div>
                        {(user?.uid === c.reportedBy || user?.email === 'allanaguileracuarto1@gmail.com') && (
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => startEditingCorrection(c)}
                              className="p-1.5 rounded-md bg-white/5 hover:bg-orange-500/20 text-white/20 hover:text-orange-500 transition-all"
                              title="Edit correction"
                            >
                              <History className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => handleDeleteCorrection(c.id)}
                              className="p-1.5 rounded-md bg-white/5 hover:bg-red-500/20 text-white/20 hover:text-red-500 transition-all"
                              title="Delete correction"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {editingCorrectionId === c.id ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 text-sm font-medium opacity-50">
                            <span className="px-2 py-1 rounded-md bg-black/40 border border-white/5">{c.ingredients[0]}</span>
                            <span className="text-white/20">+</span>
                            <span className="px-2 py-1 rounded-md bg-black/40 border border-white/5">{c.ingredients[1]}</span>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Correct Result</label>
                            <input 
                              type="text"
                              value={editingCorrectionInput}
                              onChange={(e) => setEditingCorrectionInput(e.target.value)}
                              className="w-full px-4 py-2 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-orange-500/50 transition-all"
                              placeholder="Enter correct result..."
                              autoFocus
                            />
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={handleUpdateCorrection}
                              className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-mono uppercase tracking-widest transition-all"
                            >
                              Save Changes
                            </button>
                            <button 
                              onClick={() => setEditingCorrectionId(null)}
                              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 text-[10px] font-mono uppercase tracking-widest transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-sm font-medium">
                          <span className="px-2 py-1 rounded-md bg-black/40 border border-white/5">{c.ingredients[0]}</span>
                          <span className="text-white/20">+</span>
                          <span className="px-2 py-1 rounded-md bg-black/40 border border-white/5">{c.ingredients[1]}</span>
                          <ArrowRight className="w-3 h-3 text-white/20" />
                          <div className="flex flex-col">
                            <span className="text-[10px] text-red-500/60 line-through">{c.reportedResult}</span>
                            <span className="text-green-500 font-bold">{c.correctResult}</span>
                          </div>
                        </div>
                      )}

                      <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center">
                            <User className="w-2 h-2 text-white/40" />
                          </div>
                          <span className="text-[9px] text-white/40 font-mono uppercase tracking-widest">Reported by Researcher</span>
                        </div>
                        <span className="text-[9px] text-white/20 font-mono uppercase tracking-widest">{new Date(c.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-12">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  Verified Knowledge Base
                </h3>
                <div className="flex flex-wrap gap-2">
                  {confirmedCombinations.length === 0 ? (
                    <p className="text-[10px] text-white/20 font-mono uppercase tracking-widest">No verified combinations yet.</p>
                  ) : (
                    confirmedCombinations.map((cc, i) => (
                      <div key={i} className="px-3 py-1.5 rounded-lg bg-green-500/5 border border-green-500/10 text-[10px] font-mono text-green-500/60 flex items-center gap-2">
                        <span>{cc.ingredients[0]} + {cc.ingredients[1]} = {cc.result}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          ) : view === 'lab' ? (
            <motion.div 
              key="lab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tighter uppercase flex items-center gap-3">
                    <Terminal className="w-6 h-6 text-orange-500" />
                    Discovery Lab
                  </h2>
                  <p className="text-xs text-white/40 font-mono uppercase tracking-widest mt-1">
                    Proactive Neural Synthesis - {hypotheses.length} Pending Hypotheses
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[10px] font-mono text-orange-500 uppercase tracking-widest">
                    <Zap className="w-3 h-3" />
                    {requestsRemaining} Requests Left
                  </div>
                  <button 
                    onClick={generateDiscoverySuggestions}
                    disabled={isDiscovering || requestsRemaining <= 0}
                    className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-white/10 text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2"
                  >
                    {isDiscovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Generate Hypotheses
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {hypotheses.length === 0 ? (
                  <div className="col-span-full p-24 rounded-3xl bg-white/5 border border-white/10 border-dashed text-center">
                    <Box className="w-12 h-12 text-white/10 mx-auto mb-4" />
                    <p className="text-sm text-white/20 uppercase tracking-widest font-mono">No active hypotheses. Click generate to start.</p>
                  </div>
                ) : (
                  hypotheses.map((s, i) => (
                    <motion.div 
                      key={s.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-orange-500/30 transition-all flex flex-col gap-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{s.emoji}</span>
                        <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Hypothesis #{i+1}</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-white/40 font-mono uppercase">
                          <span>{s.ingredients[0]}</span>
                          <span className="text-orange-500">+</span>
                          <span>{s.ingredients[1]}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowRight className="w-4 h-4 text-orange-500" />
                          <span className="text-lg font-bold text-white">{s.result}</span>
                        </div>
                      </div>
                      
                      {user && (registeredUsers.find(u => u.uid === user.uid)?.role === 'admin') && (
                        <div className="flex items-center gap-2 mt-2">
                          <button 
                            onClick={async () => {
                              const recipe: RecipeTree = {
                                target: s.result,
                                emoji: s.emoji,
                                category: 'Other',
                                steps: [{ result: s.result, ingredients: s.ingredients, emoji: s.emoji }]
                              };
                              await handleVerifyRecipe(recipe, 'Lab');
                              await deleteDoc(doc(db, 'hypotheses', s.id));
                            }}
                            className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-[10px] font-bold uppercase tracking-widest transition-all"
                          >
                            Confirm
                          </button>
                          <button 
                            onClick={async () => {
                              await deleteDoc(doc(db, 'hypotheses', s.id));
                            }}
                            className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest transition-all"
                          >
                            Discard
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="heuristics"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tighter uppercase flex items-center gap-3">
                    <Terminal className="w-6 h-6 text-orange-500" />
                    Neural Heuristics
                  </h2>
                  <p className="text-xs text-white/40 font-mono uppercase tracking-widest mt-1">
                    General Reasoning Patterns & Rules
                  </p>
                </div>
                {user?.email === 'allanaguileracuarto1@gmail.com' && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget.elements.namedItem('heuristic') as HTMLInputElement;
                      handleAddHeuristic(input.value);
                      input.value = '';
                    }}
                    className="flex items-center gap-2"
                  >
                    <input 
                      name="heuristic"
                      placeholder="Enter new pattern..."
                      className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    />
                    <button className="p-2 rounded-xl bg-orange-500 hover:bg-orange-600">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {heuristics.length === 0 ? (
                  <div className="col-span-full p-12 rounded-3xl bg-white/5 border border-white/10 border-dashed text-center">
                    <p className="text-sm text-white/20 uppercase tracking-widest font-mono">No heuristics defined yet.</p>
                  </div>
                ) : (
                  heuristics.map((h, i) => (
                    <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                          <Terminal className="w-4 h-4 text-orange-500" />
                        </div>
                        <p className="text-xs font-mono text-white/80">{h.pattern}</p>
                      </div>
                      {user?.email === 'allanaguileracuarto1@gmail.com' && (
                        <button 
                          onClick={() => handleDeleteHeuristic(h.id)}
                          className="p-2 rounded-lg hover:bg-red-500/20 text-white/20 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Correction Modal */}
      <AnimatePresence>
        {reportingStep && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReportingStep(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#121214] border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-xl font-bold tracking-tight">Report Correction</h3>
              </div>

              <div className="space-y-4 mb-8">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Combination</p>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="px-2 py-1 rounded-md bg-black/40 border border-white/5">{reportingStep.ingredients[0]}</span>
                    <span className="text-white/20">+</span>
                    <span className="px-2 py-1 rounded-md bg-black/40 border border-white/5">{reportingStep.ingredients[1]}</span>
                    <ArrowRight className="w-3 h-3 text-white/20" />
                    <span className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-500">{reportingStep.reportedResult}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2 block">What is the correct result?</label>
                  <input 
                    type="text"
                    value={correctionInput}
                    onChange={(e) => setCorrectionInput(e.target.value)}
                    placeholder="e.g. Mud, Steam, Obsidian..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setReportingStep(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={submitCorrection}
                  disabled={!correctionInput.trim() || isLoading}
                  className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-orange-500/20"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Submit Correction'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="fixed bottom-0 left-0 right-0 h-8 bg-black border-t border-white/5 z-50 flex items-center px-6 justify-between text-[9px] font-mono uppercase tracking-[0.2em] text-white/30">
        <div className="flex gap-6">
          <span>Status: {user ? 'Authenticated' : 'Guest'}</span>
          <span>Archive: {globalRecipes.length} Records</span>
        </div>
        <div className="flex gap-6">
          <span>© 2026 Infinite Oracle Corp</span>
        </div>
      </footer>
    </div>
  );
}
