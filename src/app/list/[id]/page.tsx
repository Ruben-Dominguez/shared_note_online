'use client';

import { useState, useEffect, use, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, collection, query, orderBy, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove, deleteField } from 'firebase/firestore';
import { ArrowLeft, Check, Copy, Plus, Trash2, Link as LinkIcon, GripVertical, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

interface ListItem {
  id: string;
  title: string;
  imageUrl?: string;
  year?: string;
  note?: string;
  completed: boolean;
}

function ListPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: listId } = use(params);
  const router = useRouter();

  const [listName, setListName] = useState('Loading...');
  const [listCategory, setListCategory] = useState<'movie' | 'series' | 'anime' | 'game'>('movie');
  const [listOrder, setListOrder] = useState<string[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [tempNote, setTempNote] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeUsers, setActiveUsers] = useState<Record<string, any>>({});

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/');
        return;
      }
      setCurrentUser(user);

      // Subscribe to list doc to get real-time order and name changes
      const unsubscribeList = onSnapshot(doc(db, 'lists', listId), (docSnap) => {
        if (!docSnap.exists()) {
          router.push('/dashboard');
          return;
        }
        const listData = docSnap.data();
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
        setListOrder(listData.itemOrder || []);
        setActiveUsers(listData.activeUsers || {});
      });

      // Subscribe to items subcollection
      const itemsRef = collection(db, 'lists', listId, 'items');
      const q = query(itemsRef, orderBy('createdAt', 'desc'));

      const unsubscribeItems = onSnapshot(q, (snapshot) => {
        const fetchedItems: ListItem[] = [];
        snapshot.forEach((doc) => {
          fetchedItems.push({ id: doc.id, ...doc.data() } as ListItem);
        });
        setItems(fetchedItems);
        setLoading(false);
      });

      return () => {
        unsubscribeList();
        unsubscribeItems();
      };
    });

    return () => unsubscribeAuth();
  }, [listId, router]);

  useEffect(() => {
    if (!currentUser || !listId) return;

    const joinPresence = () => {
      const ref = doc(db, 'lists', listId);
      updateDoc(ref, {
        [`activeUsers.${currentUser.uid}`]: {
          uid: currentUser.uid,
          displayName: currentUser.displayName || 'User',
          photoURL: currentUser.photoURL || '',
          lastActive: serverTimestamp()
        }
      }).catch(console.error);
    };

    const leavePresence = () => {
      const ref = doc(db, 'lists', listId);
      updateDoc(ref, {
        [`activeUsers.${currentUser.uid}`]: deleteField()
      }).catch(console.error);
    };

    joinPresence();
    const interval = setInterval(joinPresence, 60000); // Heartbeat every 60s
    
    const handleBeforeUnload = () => leavePresence();
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      leavePresence();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [listId, currentUser]);

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
          const res = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${query}&page[limit]=5`);
          const data = await res.json();
          results = data.data?.map((item: any) => ({
            id: item.id.toString(),
            title: item.attributes?.titles?.en || item.attributes?.titles?.en_jp || item.attributes?.canonicalTitle,
            imageUrl: item.attributes?.posterImage?.small || null,
            year: item.attributes?.startDate?.substring(0, 4) || ''
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
      const newDocRef = doc(collection(db, 'lists', listId, 'items'));
      await setDoc(newDocRef, {
        title: selectedItem.title,
        imageUrl: selectedItem.imageUrl,
        year: selectedItem.year || '',
        completed: false,
        addedBy: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'lists', listId), {
        itemOrder: arrayUnion(newDocRef.id)
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
      await updateDoc(doc(db, 'lists', listId), {
        itemOrder: arrayRemove(itemId)
      });
    } catch (error) {
      console.error("Error deleting item: ", error);
    }
  };

  const updateNote = async (itemId: string, note: string) => {
    try {
      await updateDoc(doc(db, 'lists', listId, 'items', itemId), {
        note: note.trim()
      });
      setEditingNoteId(null);
    } catch (error) {
      console.error("Error updating note: ", error);
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
        // Delete all items in the subcollection first to prevent orphaned data
        const itemDeletionPromises = items.map(item => 
          deleteDoc(doc(db, 'lists', listId, 'items', item.id))
        );
        await Promise.all(itemDeletionPromises);
        
        // Then delete the actual list document
        await deleteDoc(doc(db, 'lists', listId));
        router.push('/dashboard');
      } catch (error) {
        console.error("Error deleting list: ", error);
      }
    }
  };

  const sortedItems = [...items].sort((a, b) => {
    const aIndex = listOrder.indexOf(a.id);
    const bIndex = listOrder.indexOf(b.id);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1; // Unordered items go to the end
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const onDragEnd = async (result: any) => {
    if (!result.destination) return;
    
    const currentOrderIds = sortedItems.map(item => item.id);
    const [reorderedItem] = currentOrderIds.splice(result.source.index, 1);
    currentOrderIds.splice(result.destination.index, 0, reorderedItem);
    
    // Optimistic UI update
    setListOrder(currentOrderIds);

    // Save to Firebase
    try {
      await updateDoc(doc(db, 'lists', listId), {
        itemOrder: currentOrderIds
      });
    } catch (error) {
      console.error("Error reordering: ", error);
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
  const totalItems = items.length;
  const completedItems = items.filter(i => i.completed).length;
  const progressPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const otherActiveUsers = Object.values(activeUsers).filter(u => u.uid !== currentUser?.uid);

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <Link href="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
            Back
          </Link>

          <div className="flex gap-2">
            {otherActiveUsers.length > 0 && (
              <div className="flex items-center -space-x-2 mr-4">
                {otherActiveUsers.map(user => (
                  <div key={user.uid} className="relative group" title={`${user.displayName} is viewing this list`}>
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full border-2 border-background ring-2 ring-green-500/50 object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full border-2 border-background bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold ring-2 ring-green-500/50">
                        {user.displayName.charAt(0)}
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-background rounded-full"></div>
                  </div>
                ))}
              </div>
            )}
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

        <h1 className="text-4xl font-extrabold mb-6">{listName}</h1>
        
        {totalItems > 0 && (
          <div className="mb-10">
            <div className="flex justify-between items-end mb-2 text-sm font-medium">
              <span className="text-muted-foreground">{completedItems} of {totalItems} completed</span>
              <span className="text-primary font-bold">{progressPercentage}%</span>
            </div>
            <div className="h-3 w-full bg-muted rounded-full overflow-hidden border border-border">
              <div 
                className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-700 ease-out"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>
        )}

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
          {sortedItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Your list is empty. Start adding things you want to watch or play!
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="droppable-list">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                    {sortedItems.map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-start justify-between p-4 rounded-xl border transition-all group ${item.completed
                                ? 'bg-muted/50 border-transparent'
                                : 'bg-card border-border shadow-sm'
                              } ${snapshot.isDragging ? 'shadow-xl scale-[1.02] border-primary z-50 relative' : ''}`}
                          >
                            <div {...provided.dragHandleProps} className="p-2 mr-2 mt-4 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
                              <GripVertical size={20} />
                            </div>

                            <div className="flex-1 flex flex-col items-start min-w-0 py-1">
                              <button
                                onClick={() => toggleItem(item.id, item.completed)}
                                className="flex items-center gap-4 text-left group/btn w-full"
                              >
                                <div className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${item.completed
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'border-muted-foreground group-hover/btn:border-primary'
                                  }`}>
                                  {item.completed && <Check size={14} strokeWidth={3} />}
                                </div>

                                {item.imageUrl && (
                                  <img src={item.imageUrl} alt={item.title} className={`w-12 h-16 object-cover rounded-md transition-all ${item.completed ? 'opacity-50 grayscale' : ''}`} />
                                )}

                                <div className={`transition-all min-w-0 ${item.completed ? 'opacity-50' : ''}`}>
                                  <span className={`text-lg font-bold block break-words text-left leading-tight ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                                    {item.title}
                                  </span>
                                  {item.year && <span className="text-sm text-muted-foreground">{item.year}</span>}
                                </div>
                              </button>

                              {(item.note || editingNoteId === item.id) && (
                                <div className="pl-10 w-full pr-12 mt-2">
                                  {editingNoteId === item.id ? (
                                    <div className="flex items-center gap-2 w-full">
                                      <input 
                                        type="text" 
                                        value={tempNote}
                                        onChange={(e) => setTempNote(e.target.value)}
                                        placeholder="e.g. We are on Ep 9..."
                                        className="flex-1 bg-background border border-border text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-primary"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') updateNote(item.id, tempNote);
                                          if (e.key === 'Escape') setEditingNoteId(null);
                                        }}
                                      />
                                      <button 
                                        onClick={() => updateNote(item.id, tempNote)}
                                        className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md font-medium"
                                      >
                                        Save
                                      </button>
                                      <button 
                                        onClick={() => setEditingNoteId(null)}
                                        className="text-xs bg-muted text-muted-foreground hover:bg-muted/80 px-3 py-1.5 rounded-md font-medium transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div 
                                      onClick={() => { setEditingNoteId(item.id); setTempNote(item.note || ''); }}
                                      className="text-sm text-purple-500 bg-purple-500/10 px-3 py-1.5 rounded-md cursor-pointer hover:bg-purple-500/20 transition-colors w-fit"
                                      title="Click to edit"
                                    >
                                      {item.note}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1 ml-4 self-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => { setEditingNoteId(item.id); setTempNote(item.note || ''); }}
                                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                title="Add/Edit Note"
                              >
                                <MessageSquare size={18} />
                              </button>
                              <button
                                onClick={() => deleteItem(item.id)}
                                className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                title="Delete item"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
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
