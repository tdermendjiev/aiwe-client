export interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

export interface AIWEBotOptions {
  openAIApiKey: string;
  serviceCredentials?: Record<string, Record<string, string>>;  // e.g. { "invbg": { "x-api-key": "key123" } }
  logger?: Logger;
}

export interface CommunityBridge {
  config: any;
  implementation: BridgeImplementation;
}

export interface BridgeImplementation {
  [key: string]: (params: any) => Promise<any>;
}

export interface WebsiteInfo {
  url: string;
  serviceName: string;
}

export interface AgentResponse<T> {
  status: 'complete' | 'needsClarification';
  data?: T;
  question?: string;
}

export interface ExecutionContext {
  message: string;
  conversationHistory: string;
  completedActions?: Map<string, {
    serviceName: string;
    result: any;
    timestamp: number;
  }>;
}

export interface ActionResult {
  status: 'success' | 'error';
  action: string;
  serviceName: string;
  result?: any;
  error?: string;
  retryCount?: number;
}

export interface ConversationResponse {
  response: string;
  executionResults?: any[];
  sessionId: string;
}

export interface AuthConfig {
  type: string;
  options: Array<{
    name: string;
    headers?: Record<string, string>;
  }>;
}

export interface StoredData {
  actions: Record<string, {
    serviceName: string;
    result: any;
    timestamp: number;
    parameters: Record<string, any>;
  }>;
}

export interface Session {
  id: string;
  startTime: number;
  lastUpdateTime: number;
  messages: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }[];
}

export interface DataReference {
  actions: {
    [actionId: string]: {
      description: string;
      timestamp: number;
    }
  };
  sessions: {
    count: number;
    lastTimestamp: number;
  };
}

export interface DataRequest {
  id: string;
  reason: string;
}