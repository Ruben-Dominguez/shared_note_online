'use client';

import { useState, useEffect, use, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Check, Copy, Plus, Trash2, Link as LinkIcon } from 'lucide-react';
import Link from 'next/link';

interface ListItem {
  id: string;
  title: string;
  imageUrl?: string;
  year?: string;
  completed: boolean;
}

function ListPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: listId } = use(params);
  const router = useRouter();

  const [listName, setListName] = useState('Loading...');
  const [listCategory, setListCategory] = useState<'movie' | 'series' | 'anime' | 'game'>('movie');
  const [items, setItems] = useState<ListItem[]>([]);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/');
        return;
      }

      // Check access and get list details
      const listRef = doc(db, 'lists', listId);
      const listSnap = await getDoc(listRef);

      if (!listSnap.exists()) {
        router.push('/dashboard');
        return;
      }

      const listData = listSnap.data();
      if (listData.ownerId === user.uid) {
        setIsOwner(true);
      }
      if (listData.ownerId !== user.uid && !listData.sharedWith.includes(user.uid)) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setListName(listData.name);
      setListCategory(listData.category || 'movie');

      // Subscribe to items subcollection
      const itemsRef = collection(db, 'lists', listId, 'items');
      const q = query(itemsRef, orderBy('createdAt', 'desc'));

      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const fetchedItems: ListItem[] = [];
        snapshot.forEach((doc) => {
          fetchedItems.push({ id: doc.id, ...doc.data() } as ListItem);
        });
        setItems(fetchedItems);
        setLoading(false);
      });

      return () => unsubscribeSnapshot();
    });

    return () => unsubscribeAuth();
  }, [listId, router]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (newItemTitle.trim().length < 3) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        let results = [];
        const query = encodeURIComponent(newItemTitle);
        
        if (listCategory === 'movie' || listCategory === 'series') {
          const type = listCategory === 'movie' ? 'movie' : 'tv';
          const tmdbKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
          if (tmdbKey) {
            const res = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${tmdbKey}&query=${query}`);
            const data = await res.json();
            results = data.results?.slice(0, 5).map((item: any) => ({
              id: item.id.toString(),
              title: item.title || item.name,
              imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : null,
              year: (item.release_date || item.first_air_date || '').substring(0, 4)
            })) || [];
          }
        } else if (listCategory === 'anime') {
          const res = await fetch(`https://api.jikan.moe/v4/anime?q=${query}&limit=5`);
          const data = await res.json();
          results = data.data?.map((item: any) => ({
            id: item.mal_id.toString(),
            title: item.title,
            imageUrl: item.images?.jpg?.image_url || null,
            year: item.year?.toString() || ''
          })) || [];
        } else if (listCategory === 'game') {
          const res = await fetch(`https://www.cheapshark.com/api/1.0/games?title=${query}&limit=5`);
          const data = await res.json();
          results = data?.map((item: any) => ({
            id: item.gameID,
            title: item.external,
            imageUrl: item.thumb || null,
            year: ''
          })) || [];
        }
        setSearchResults(results);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [newItemTitle, listCategory]);

  const handleAddItem = async (selectedItem: any) => {
    if (!auth.currentUser) return;

    try {
      await addDoc(collection(db, 'lists', listId, 'items'), {
        title: selectedItem.title,
        imageUrl: selectedItem.imageUrl,
        year: selectedItem.year || '',
        completed: false,
        addedBy: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });
      setNewItemTitle('');
      setSearchResults([]);
    } catch (error) {
      console.error("Error adding item: ", error);
    }
  };

  const toggleItem = async (itemId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'lists', listId, 'items', itemId), {
        completed: !currentStatus
      });
    } catch (error) {
      console.error("Error updating item: ", error);
    }
  };

  const deleteItem = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, 'lists', listId, 'items', itemId));
    } catch (error) {
      console.error("Error deleting item: ", error);
    }
  };

  const copyShareCode = () => {
    navigator.clipboard.writeText(listId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteList = async () => {
    if (window.confirm('Are you sure you want to completely delete this list? This cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'lists', listId));
        router.push('/dashboard');
      } catch (error) {
        console.error("Error deleting list: ", error);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center p-6">
        <h2 className="text-3xl font-bold mb-4">Access Denied</h2>
        <p className="text-muted-foreground mb-8">You don't have permission to view this list. It might not be shared with you yet.</p>
        <Link href="/dashboard" className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-medium">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <Link href="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
            Back
          </Link>

          <div className="flex gap-2">
            <button
              onClick={copyShareCode}
              className="flex items-center gap-2 bg-card border border-border px-4 py-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium"
            >
              {copied ? <Check size={16} className="text-green-500" /> : <LinkIcon size={16} />}
              {copied ? 'Code Copied!' : 'Copy Share Code'}
            </button>
            {isOwner && (
              <button
                onClick={deleteList}
                className="flex items-center gap-2 bg-red-500/10 text-red-500 border border-red-500/20 px-4 py-2 rounded-lg hover:bg-red-500 hover:text-white transition-colors text-sm font-medium"
              >
                <Trash2 size={16} />
                Delete List
              </button>
            )}
          </div>
        </header>

        <h1 className="text-4xl font-extrabold mb-10">{listName}</h1>

        <div className="relative mb-10">
          <input
            type="text"
            placeholder={`Search for a ${listCategory}...`}
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            className="w-full bg-card border border-border rounded-xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-primary transition-all text-lg shadow-sm"
          />
          {isSearching && (
            <div className="absolute right-4 top-4">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
            </div>
          )}
          
          {searchResults.length > 0 && (
            <div className="absolute z-10 w-full mt-2 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleAddItem(result)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-muted transition-colors text-left border-b border-border last:border-0"
                >
                  {result.imageUrl ? (
                    <img src={result.imageUrl} alt={result.title} className="w-12 h-16 object-cover rounded-md" />
                  ) : (
                    <div className="w-12 h-16 bg-muted flex items-center justify-center rounded-md">
                      <span className="text-xs text-muted-foreground text-center">No Image</span>
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-lg">{result.title}</h4>
                    {result.year && <span className="text-sm text-muted-foreground">{result.year}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Your list is empty. Start adding things you want to watch or play!
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${item.completed
                    ? 'bg-muted/50 border-transparent'
                    : 'bg-card border-border shadow-sm hover:border-primary/30'
                  }`}
              >
                <button
                  onClick={() => toggleItem(item.id, item.completed)}
                  className="flex items-center gap-4 flex-1 text-left group"
                >
                  <div className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${item.completed
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground group-hover:border-primary'
                    }`}>
                    {item.completed && <Check size={14} strokeWidth={3} />}
                  </div>

                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.title} className={`w-12 h-16 object-cover rounded-md transition-all ${item.completed ? 'opacity-50 grayscale' : ''}`} />
                  )}

                  <div className={`transition-all ${item.completed ? 'opacity-50' : ''}`}>
                    <span className={`text-lg font-bold block ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                      {item.title}
                    </span>
                    {item.year && <span className="text-sm text-muted-foreground">{item.year}</span>}
                  </div>
                </button>

                <button
                  onClick={() => deleteItem(item.id)}
                  className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ml-4"
                  title="Delete item"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function ListPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div></div>}>
      <ListPageContent params={params} />
    </Suspense>
  );
}
