'use client';

import { useState, useEffect } from 'react';
import { auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { Film, Tv, Gamepad2, LogIn, LogOut } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in with Google', error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-background text-foreground relative overflow-hidden">

      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-purple-500/20 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

      <main className="z-10 flex flex-col items-center max-w-2xl w-full p-8 rounded-3xl bg-card/50 backdrop-blur-xl border border-border shadow-2xl transition-all duration-300 hover:shadow-primary/5">

        <div className="flex gap-4 mb-6 text-primary">
          <Film size={40} className="animate-bounce" style={{ animationDelay: '0ms' }} />
          <Tv size={40} className="animate-bounce" style={{ animationDelay: '150ms' }} />
          <Gamepad2 size={40} className="animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
          Shared Notes
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-lg">
          The perfect place to keep track of movies, series, and games you want to enjoy together.
        </p>

        {!user ? (
          <button
            onClick={signInWithGoogle}
            className="group relative flex items-center gap-3 px-8 py-4 bg-foreground text-background rounded-full font-semibold text-lg overflow-hidden transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-primary/50"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-purple-600 opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <LogIn size={24} />
            Continue with Google
          </button>
        ) : (
          <div className="flex flex-col items-center w-full">
            <div className="flex items-center gap-4 mb-8 bg-muted/50 p-3 rounded-full pr-6 border border-border">
              {user.photoURL && (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  className="w-12 h-12 rounded-full border-2 border-background"
                />
              )}
              <span className="font-medium">Welcome, {user.displayName?.split(' ')[0]}!</span>
            </div>

            <Link 
              href="/dashboard" 
              className="group relative flex items-center justify-center gap-3 w-full max-w-sm px-8 py-4 mb-8 bg-primary text-primary-foreground rounded-full font-bold text-lg overflow-hidden transition-transform hover:scale-105 shadow-lg hover:shadow-primary/25"
            >
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
              <Gamepad2 size={24} />
              Go to Dashboard
            </Link>

            <button
              onClick={logout}
              className="flex items-center gap-2 px-6 py-3 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
            >
              <LogOut size={20} />
              Sign Out
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
