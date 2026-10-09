'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, or, doc, updateDoc, arrayUnion, getDoc, setDoc } from 'firebase/firestore';
import { Plus, List as ListIcon, Share2, LogOut, ArrowLeft, Users, Film, Tv, PlaySquare, Gamepad2, GripVertical } from 'lucide-react';
import Link from 'next/link';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

interface NoteList {
  id: string;
  name: string;
  category: 'movie' | 'series' | 'anime' | 'game';
  ownerId: string;
  sharedWith: string[];
}

export default function Dashboard() {
  const [lists, setLists] = useState<NoteList[]>([]);
  const [dashboardOrder, setDashboardOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newListName, setNewListName] = useState('');
  const [newListCategory, setNewListCategory] = useState<'movie' | 'series' | 'anime' | 'game'>('movie');
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/');
        return;
      }

      const listsRef = collection(db, 'lists');
      const q = query(
        listsRef,
        or(
          where('ownerId', '==', user.uid),
          where('sharedWith', 'array-contains', user.uid)
        )
      );

      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const fetchedLists: NoteList[] = [];
        snapshot.forEach((doc) => {
          fetchedLists.push({ id: doc.id, ...doc.data() } as NoteList);
        });
        setLists(fetchedLists);
        setLoading(false);
      }, (error) => {
        console.error("Firestore Error:", error);
        setLoading(false);
      });

      const unsubscribeUser = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
        if (docSnap.exists()) {
          setDashboardOrder(docSnap.data().dashboardOrder || []);
        }
      });

      return () => {
        unsubscribeSnapshot();
        unsubscribeUser();
      };
    });

    return () => unsubscribeAuth();
  }, [router]);

  const createList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || !auth.currentUser) return;
    
    setIsCreating(true);
    try {
      await addDoc(collection(db, 'lists'), {
        name: newListName,
        category: newListCategory,
        ownerId: auth.currentUser.uid,
        sharedWith: [],
        createdAt: serverTimestamp()
      });
      setNewListName('');
      setNewListCategory('movie');
    } catch (error) {
      console.error("Error creating list: ", error);
    }
    setIsCreating(false);
  };

  const joinList = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');
    if (!joinCode.trim() || !auth.currentUser) return;

    setIsJoining(true);
    try {
      const listRef = doc(db, 'lists', joinCode.trim());
      const listSnap = await getDoc(listRef);

      if (!listSnap.exists()) {
        setJoinError('List not found. Check the code.');
        setIsJoining(false);
        return;
      }

      const listData = listSnap.data();
      if (listData.ownerId === auth.currentUser.uid || listData.sharedWith.includes(auth.currentUser.uid)) {
        router.push(`/list/${joinCode.trim()}`);
        return;
      }

      await updateDoc(listRef, {
        sharedWith: arrayUnion(auth.currentUser.uid)
      });
      
      setJoinCode('');
      router.push(`/list/${joinCode.trim()}`);
    } catch (error) {
      console.error("Error joining list: ", error);
      setJoinError('An error occurred.');
    }
    setIsJoining(false);
  };

  const sortedLists = [...lists].sort((a, b) => {
    const aIndex = dashboardOrder.indexOf(a.id);
    const bIndex = dashboardOrder.indexOf(b.id);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const onDragEnd = async (result: any) => {
    if (!result.destination) return;
    
    const currentOrderIds = sortedLists.map(list => list.id);
    const [reorderedList] = currentOrderIds.splice(result.source.index, 1);
    currentOrderIds.splice(result.destination.index, 0, reorderedList);
    
    setDashboardOrder(currentOrderIds);

    try {
      await setDoc(doc(db, 'users', auth.currentUser!.uid), {
        dashboardOrder: currentOrderIds
      }, { merge: true });
    } catch (error) {
      console.error("Error reordering lists: ", error);
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
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
            Back Home
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2">
              <img src={auth.currentUser?.photoURL || ''} alt="Profile" className="w-8 h-8 rounded-full" />
              <span className="font-medium text-sm">{auth.currentUser?.displayName}</span>
            </div>
          </div>
        </header>

        <div className="mb-10">
          <h1 className="text-4xl font-extrabold mb-2">Your Shared Checklists</h1>
          <p className="text-muted-foreground">Manage your movie, series, and game checklists.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <form onSubmit={createList} className="flex flex-col gap-4 bg-card p-6 rounded-2xl border border-border">
            <h3 className="font-bold text-lg">Create New List</h3>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="E.g., Marvel Movies 🍿"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                maxLength={40}
                required
              />
              <div className="flex gap-2">
                <select 
                  value={newListCategory}
                  onChange={(e) => setNewListCategory(e.target.value as any)}
                  className="flex-1 bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary transition-all appearance-none cursor-pointer"
                >
                  <option value="movie">🎬 Movies</option>
                  <option value="series">📺 Series</option>
                  <option value="anime">🎌 Anime</option>
                  <option value="game">🎮 Games</option>
                </select>
                <button 
                  type="submit" 
                  disabled={isCreating || !newListName.trim()}
                  className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md"
                >
                  {isCreating ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-background border-t-transparent"></div> : <Plus size={20} />}
                  Create
                </button>
              </div>
            </div>
          </form>

          <form onSubmit={joinList} className="flex flex-col gap-2 bg-card p-6 rounded-2xl border border-border">
            <h3 className="font-bold text-lg mb-2">Join Shared List</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Paste Share Code here..."
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="flex-1 bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                required
              />
              <button 
                type="submit" 
                disabled={isJoining || !joinCode.trim()}
                className="bg-purple-500 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-purple-600 disabled:opacity-50 transition-all shadow-md"
              >
                {isJoining ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-background border-t-transparent"></div> : <Users size={20} />}
                Join
              </button>
            </div>
            {joinError && <p className="text-red-500 text-sm mt-1">{joinError}</p>}
          </form>
        </div>

        {sortedLists.length === 0 ? (
          <div className="text-center py-20 bg-card/50 rounded-3xl border border-border border-dashed">
            <ListIcon size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold mb-2">No lists yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Create your first shared note above, or join one if your partner gave you a code.
            </p>
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="dashboard-lists" direction="horizontal">
              {(provided) => (
                <div 
                  {...provided.droppableProps} 
                  ref={provided.innerRef}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {sortedLists.map((list, index) => (
                    <Draggable key={list.id} draggableId={list.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`bg-card border border-border p-6 rounded-2xl hover:border-primary/50 transition-all group flex flex-col justify-between h-full relative ${snapshot.isDragging ? 'shadow-2xl scale-105 border-primary z-50' : ''}`}
                        >
                          <div 
                            {...provided.dragHandleProps} 
                            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing bg-background/50 rounded-lg backdrop-blur-sm md:opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            <GripVertical size={20} />
                          </div>

                          <Link href={`/list/${list.id}`} className="flex-1 flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-primary/10 text-primary rounded-xl group-hover:scale-110 transition-transform">
                                  {list.category === 'movie' && <Film size={24} />}
                                  {list.category === 'series' && <Tv size={24} />}
                                  {list.category === 'anime' && <PlaySquare size={24} />}
                                  {list.category === 'game' && <Gamepad2 size={24} />}
                                  {!list.category && <ListIcon size={24} />}
                                </div>
                                {list.sharedWith.length > 0 && (
                                  <div className="flex items-center gap-1 text-xs font-medium text-purple-500 bg-purple-500/10 px-2 py-1 rounded-full mr-10">
                                    <Share2 size={12} /> Shared
                                  </div>
                                )}
                              </div>
                              <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{list.name}</h3>
                            </div>
                            <div className="mt-6 text-sm text-muted-foreground flex justify-between items-center">
                              <span>{list.ownerId === auth.currentUser?.uid ? 'Owner' : 'Participant'}</span>
                              <span className="text-primary opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                Open <ArrowLeft size={14} className="rotate-180" />
                              </span>
                            </div>
                          </Link>
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
  );
}
