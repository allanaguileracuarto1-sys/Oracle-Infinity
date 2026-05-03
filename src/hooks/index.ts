/**
 * Custom Hooks para la aplicación
 * Lógica reutilizable y separada de los componentes
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { auth, db } from '../firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  setPersistence,
  browserLocalPersistence,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  limit, 
  where, 
  getDocs, 
  deleteDoc, 
  doc, 
  setDoc,
  addDoc
} from 'firebase/firestore';
import type { User, GlobalRecipe, Correction, FailedRecipe, ConfirmedCombination, Heuristic, Hypothesis } from '../types';

/**
 * Hook para manejar autenticación de Firebase
 */
export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      
      if (u) {
        setIsRoleLoading(true);
        const role = u.email === 'allanaguileracuarto1@gmail.com' ? 'admin' : 'user';
        setUserRole(role);
        
        try {
          await setDoc(doc(db, 'users', u.uid), {
            uid: u.uid,
            displayName: u.displayName,
            email: u.email,
            photoURL: u.photoURL,
            lastLogin: new Date().toISOString(),
            role
          }, { merge: true });
        } catch (err) {
          console.error("User Registration Error:", err);
        } finally {
          setIsRoleLoading(false);
        }
      } else {
        setUserRole(null);
        setIsRoleLoading(false);
      }
    });
    
    return () => unsubscribe();
  }, []);

  const handleLogin = useCallback(async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login Error:", err);
      throw err;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Logout Error:", err);
    }
  }, []);

  return {
    user,
    isAuthReady,
    userRole,
    isRoleLoading,
    handleLogin,
    handleLogout
  };
}

/**
 * Hook para recetas globales
 */
export function useGlobalRecipes() {
  const [recipes, setRecipes] = useState<GlobalRecipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const q = query(
      collection(db, 'recipes'), 
      orderBy('discoveredAt', 'desc'), 
      limit(1000)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as GlobalRecipe));
      setRecipes(data);
      setIsLoading(false);
      setError(null);
    }, (err) => {
      console.error("Firestore Recipes Listen Error:", err);
      setError(err.message);
      setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const deleteRecipe = useCallback(async (recipeId: string) => {
    if (!recipeId) return;
    
    try {
      await deleteDoc(doc(db, 'recipes', recipeId));
    } catch (err) {
      console.error("Delete Error:", err);
      throw err;
    }
  }, []);

  const saveRecipe = useCallback(async (recipe: Omit<GlobalRecipe, 'id' | 'discoveredAt' | 'discoverer' | 'discovererName'>, userId: string, userName: string) => {
    try {
      const targetTrimmed = recipe.target.trim();
      const q = query(collection(db, 'recipes'), where('target', '==', targetTrimmed));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        const q2 = query(collection(db, 'recipes'), where('target', '==', targetTrimmed.toLowerCase()));
        const snapshot2 = await getDocs(q2);
        
        if (snapshot2.empty) {
          await addDoc(collection(db, 'recipes'), {
            ...recipe,
            target: targetTrimmed,
            discoveredAt: new Date().toISOString(),
            discoverer: userId,
            discovererName: userName
          });
        }
      }
    } catch (err) {
      console.error("Save Error:", err);
    }
  }, []);

  return { recipes, isLoading, error, deleteRecipe, saveRecipe };
}

/**
 * Hook para correcciones
 */
export function useCorrections() {
  const [corrections, setCorrections] = useState<Correction[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'corrections'), 
      orderBy('createdAt', 'desc'), 
      limit(500)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Correction));
      setCorrections(data);
    }, (err) => console.error("Corrections Listen Error:", err));
    
    return () => unsubscribe();
  }, []);

  return corrections;
}

/**
 * Hook para combinaciones confirmadas
 */
export function useConfirmedCombinations() {
  const [combinations, setCombinations] = useState<ConfirmedCombination[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'confirmed_combinations'), 
      orderBy('verifiedAt', 'desc'), 
      limit(1000)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as ConfirmedCombination);
      setCombinations(data);
    }, (err) => console.error("Confirmed Combinations Listen Error:", err));
    
    return () => unsubscribe();
  }, []);

  return combinations;
}

/**
 * Hook para recetas fallidas
 */
export function useFailedRecipes() {
  const [failedRecipes, setFailedRecipes] = useState<FailedRecipe[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'failed_recipes'), 
      orderBy('reportedAt', 'desc'), 
      limit(20)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as FailedRecipe);
      setFailedRecipes(data);
    }, (err) => console.error("Failed Recipes Listen Error:", err));
    
    return () => unsubscribe();
  }, []);

  return failedRecipes;
}

/**
 * Hook para heurísticas
 */
export function useHeuristics() {
  const [heuristics, setHeuristics] = useState<Heuristic[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'heuristics'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Heuristic));
      setHeuristics(data);
    }, (err) => console.error("Heuristics Listen Error:", err));
    
    return () => unsubscribe();
  }, []);

  return heuristics;
}

/**
 * Hook para hipótesis
 */
export function useHypotheses() {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'hypotheses'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Hypothesis));
      setHypotheses(data);
    }, (err) => console.error("Hypotheses Listen Error:", err));
    
    return () => unsubscribe();
  }, []);

  return hypotheses;
}

/**
 * Hook para usuarios registrados
 */
export function useRegisteredUsers(activeView: string) {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    if (activeView !== 'users') return;
    
    const q = query(collection(db, 'users'), orderBy('lastLogin', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      setUsers(data);
    }, (err) => console.error("Users Listen Error:", err));
    
    return () => unsubscribe();
  }, [activeView]);

  return users;
}

/**
 * Hook para control de tasa de peticiones (RPM)
 */
export function useRateLimit(rpmLimit: number = 15) {
  const [requestsRemaining, setRequestsRemaining] = useState(rpmLimit);

  useEffect(() => {
    const timer = setInterval(() => {
      setRequestsRemaining(rpmLimit);
    }, 60000);
    
    return () => clearInterval(timer);
  }, [rpmLimit]);

  const canMakeRequest = useCallback(() => {
    return requestsRemaining > 0;
  }, [requestsRemaining]);

  const decrementRequest = useCallback(() => {
    setRequestsRemaining(prev => Math.max(0, prev - 1));
  }, []);

  return {
    requestsRemaining,
    canMakeRequest,
    decrementRequest
  };
}

/**
 * Hook para memoización de crafts aprendidos
 */
export function useLearnedCrafts(confirmedCombinations: ConfirmedCombination[], corrections: Correction[]) {
  return useMemo(() => {
    const uniqueMap = new Map<string, { 
      ingredients: [string, string], 
      result: string, 
      source: string, 
      emoji?: string 
    }>();
    
    const normalize = (s: string) => s?.trim() || '';
    const normalizeKey = (s: string) => s?.trim().toLowerCase() || '';

    // Combinaciones confirmadas
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

    // Correcciones
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
}
