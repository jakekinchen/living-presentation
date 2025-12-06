export interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface Feedback {
  id: string;
  sessionId: string;
  text: string;
  timestamp: string;
}
