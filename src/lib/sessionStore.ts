import { nanoid } from "nanoid";
import { Session, Feedback } from "@/types/feedback";

interface SessionData extends Session {
  feedback: Feedback[];
}

// In-memory store for sessions
const sessions = new Map<string, SessionData>();

// Cleanup interval - removes expired sessions every 30 minutes
setInterval(() => {
  const now = new Date().toISOString();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(sessionId);
      console.log(`🗑️ Cleaned up expired session: ${sessionId}`);
    }
  }
}, 30 * 60 * 1000); // 30 minutes

export const sessionStore = {
  /**
   * Creates a new session with a unique ID
   * Returns the session object
   */
  createSession(): Session {
    const id = nanoid(8);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours

    const session: SessionData = {
      id,
      createdAt,
      expiresAt,
      feedback: [],
    };

    sessions.set(id, session);
    console.log(`✅ Created session: ${id}, expires at ${expiresAt}`);

    return { id, createdAt, expiresAt };
  },

  /**
   * Retrieves a session by ID
   * Returns null if not found or expired
   */
  getSession(sessionId: string): Session | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    // Check if expired
    if (session.expiresAt < new Date().toISOString()) {
      sessions.delete(sessionId);
      return null;
    }

    return { id: session.id, createdAt: session.createdAt, expiresAt: session.expiresAt };
  },

  /**
   * Adds feedback to a session
   * Returns the feedback object or null if session not found
   */
  addFeedback(sessionId: string, text: string): Feedback | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    // Check if expired
    if (session.expiresAt < new Date().toISOString()) {
      sessions.delete(sessionId);
      return null;
    }

    const feedback: Feedback = {
      id: nanoid(8),
      sessionId,
      text,
      timestamp: new Date().toISOString(),
    };

    session.feedback.push(feedback);
    console.log(`📝 Added feedback to session ${sessionId}: "${text.substring(0, 50)}..."`);

    return feedback;
  },

  /**
   * Gets all feedback for a session
   * Optionally filter by timestamp (get feedback since a specific time)
   */
  getFeedback(sessionId: string, since?: string): Feedback[] {
    const session = sessions.get(sessionId);
    if (!session) return [];

    // Check if expired
    if (session.expiresAt < new Date().toISOString()) {
      sessions.delete(sessionId);
      return [];
    }

    if (since) {
      return session.feedback.filter((f) => f.timestamp > since);
    }

    return session.feedback;
  },

  /**
   * Deletes a session and all its feedback
   */
  deleteSession(sessionId: string): void {
    sessions.delete(sessionId);
    console.log(`🗑️ Deleted session: ${sessionId}`);
  },
};
