export interface AIWEBotOptions {
  openAIApiKey: string;
  serviceCredentials?: Record<string, Record<string, string>>;  // e.g. { "invbg": { "x-api-key": "key123" } }
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
  instruction: string;
  conversationHistory: string;
  completedActions?: Map<string, {
    website: string;
    result: any;
    timestamp: number;
  }>;
}

export interface ActionResult {
  status: 'success' | 'error';
  action: string;
  website: string;
  result?: any;
  error?: string;
  retryCount?: number;
}

export interface ConversationResponse {
  response: string;
  executionResults?: any;
}

export interface AuthConfig {
  type: string;
  options: Array<{
    name: string;
    headers?: Record<string, string>;
  }>;
}

export interface StoredData {
  actions: {
    [actionId: string]: {
      website: string;
      result: any;
      timestamp: number;
      parameters: any;
    }
  };
  conversations: {
    timestamp: number;
    instruction: string;
    response: string;
  }[];
}

export interface DataReference {
  actions: {
    [actionId: string]: {
      description: string;
      timestamp: number;
    }
  };
  conversations: {
    count: number;
    lastTimestamp: number;
  };
}

export interface DataRequest {
  id: string;
  reason: string;
}