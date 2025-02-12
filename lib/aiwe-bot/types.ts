export interface AIWEAction {
  id: string;
  description: string;
  parameters: string[];
}

export interface AIWEConfig {
  actions: AIWEAction[];
  version: string;
  auth: string;
}

export interface ActionPlanStep {
  id: string;
  parameters: Record<string, any>;
  outputKey?: string;
  dependsOn?: string[];
}

export interface AIWEBotOptions {
  openAIApiKey: string;
  defaultRepository?: AIWEConfig;
} 