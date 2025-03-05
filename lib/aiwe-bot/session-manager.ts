import { Session, ExecutionContext, Logger } from './types';
import Utils from './utils';
import { ConsoleLogger } from './logger';

export class SessionManager {
  private sessions = new Map<string, Session>();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }

  createSession(message: string): Session {
    const sessionId = Utils.generateUniqueId();
    const now = Date.now();
    const session: Session = {
      id: sessionId,
      startTime: now,
      lastUpdateTime: now,
      messages: [{
        role: 'user' as const,
        content: message,
        timestamp: now
      }]
    };
    this.sessions.set(sessionId, session);
    this.logger.info(`Created new session ${sessionId}`);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.error(`Session ${sessionId} not found`);
    }
    return session;
  }

  updateSession(session: Session, response: string): Session {
    const now = Date.now();
    const updatedSession = {
      ...session,
      lastUpdateTime: now,
      messages: [
        ...session.messages,
        {
          role: 'assistant' as const,
          content: response,
          timestamp: now
        }
      ]
    };
    this.sessions.set(session.id, updatedSession);
    this.logger.debug(`Updated session ${session.id} with assistant response`);
    return updatedSession;
  }

  addMessage(session: Session, message: string): Session {
    const now = Date.now();
    const updatedSession = {
      ...session,
      lastUpdateTime: now,
      messages: [
        ...session.messages,
        {
          role: 'user' as const,
          content: message,
          timestamp: now
        }
      ]
    };
    this.sessions.set(session.id, updatedSession);
    this.logger.debug(`Added user message to session ${session.id}`);
    return updatedSession;
  }

  getSessionContext(session: Session): ExecutionContext {
    return {
      message: session.messages[session.messages.length - 1].content,
      conversationHistory: session.messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n'),
      completedActions: new Map()
    };
  }

  getSessionsCount(): number {
    return this.sessions.size;
  }

  getLastSessionTimestamp(): number {
    const lastSession = Array.from(this.sessions.values())
      .sort((a, b) => b.lastUpdateTime - a.lastUpdateTime)[0];
    return lastSession?.lastUpdateTime || 0;
  }
} 