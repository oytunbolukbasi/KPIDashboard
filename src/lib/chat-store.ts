/**
 * Chat session store — Firestore backed.
 * Stores AI Agent conversation history as sessions.
 */
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { AgentMessage } from './gemini-agent';

export interface ChatSession {
  id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const COL = 'chat_sessions';

function toSession(id: string, data: any): ChatSession {
  return {
    id,
    title: data.title ?? 'Konuşma',
    messages: data.messages ?? [],
    createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
  };
}

/** Generate a short title from the first user message */
export function generateTitle(messages: AgentMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content ?? 'Yeni konuşma';
  return first.length > 50 ? first.slice(0, 50) + '…' : first;
}

export async function getAllSessions(): Promise<ChatSession[]> {
  const q = query(collection(db, COL), orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toSession(d.id, d.data()));
}

export async function createSession(messages: AgentMessage[]): Promise<ChatSession> {
  const title = generateTitle(messages);
  const docRef = await addDoc(collection(db, COL), {
    title,
    messages,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return {
    id: docRef.id,
    title,
    messages,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function updateSession(id: string, messages: AgentMessage[]): Promise<void> {
  const title = generateTitle(messages);
  await updateDoc(doc(db, COL, id), {
    title,
    messages,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSession(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
