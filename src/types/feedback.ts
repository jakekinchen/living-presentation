export interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
  presenterToken: string;
}

export interface Feedback {
  id: string;
  sessionId: string;
  text: string;
  timestamp: string;
}
