import { OpenAI } from "openai";
import axios from "axios";
import { communityBridges } from "./community-bridges";

interface AIWEBotOptions {
  openAIApiKey: string;
  serviceCredentials?: Record<string, Record<string, string>>;  // e.g. { "invbg": { "x-api-key": "key123" } }
}

interface BridgeImplementation {
  [key: string]: (params: any) => Promise<any>;
}

export interface CommunityBridge {
  config: any;
  implementation: BridgeImplementation;
}

interface WebsiteInfo {
  url: string;
  serviceName: string;
}

interface AgentResponse<T> {
  status: 'complete' | 'needsClarification';
  data?: T;
  question?: string;
}

interface ExecutionContext {
  instruction: string;
  conversationHistory: string;
  completedActions?: Map<string, {
    website: string;
    result: any;
    timestamp: number;
  }>;
}

interface ActionResult {
  status: 'success' | 'error';
  action: string;
  website: string;
  result?: any;
  error?: string;
  retryCount?: number;
}

interface ConversationResponse {
  response: string;
  executionResults?: any;
}

interface AuthConfig {
  type: string;
  options: Array<{
    name: string;
    headers?: Record<string, string>;
  }>;
}

interface StoredData {
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

interface DataReference {
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

interface DataRequest {
  id: string;
  reason: string;
}

export class AIWEBot {
  private openai: OpenAI;
  private configSources = new Map<string, 'official' | 'bridge' | 'aiwe.cloud'>();
  private serviceCredentials: Record<string, Record<string, string>>;
  private dataStore: StoredData = {
    actions: {},
    conversations: []
  };

  constructor(options: AIWEBotOptions) {
    this.openai = new OpenAI({ apiKey: options.openAIApiKey });
    this.serviceCredentials = options.serviceCredentials || {};
  }

  private async determineWebsitesWithContext(context: ExecutionContext): Promise<AgentResponse<WebsiteInfo[]>> {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: `You are a helpful assistant that identifies website URLs and their service names from user instructions. 
            If you need clarification, respond with the following json format: {"status": "needsClarification", "question": "your question"}.
            If you can determine the websites, respond with {"status": "complete", "data": [{"url": "website.com", "serviceName": "website"}]}.
            For example, for mixpanel.com the serviceName would be "mixpanel".
            Previous context: ${context.conversationHistory}`
        },
        { 
          role: "user", 
          content: context.instruction 
        }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message?.content || "{}");
  }

  async processInstruction(instruction: string): Promise<ConversationResponse> {
    // Store the instruction
    const timestamp = Date.now();
    this.dataStore.conversations.push({
      timestamp,
      instruction,
      response: '' // Will be updated later
    });

    let context: ExecutionContext = {
      instruction,
      conversationHistory: '',
      completedActions: new Map()
    };

    try {
      // First, analyze if this is an actionable instruction or just a question
      const analysisResponse = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Analyze if this instruction requires executing actions on websites or is just a question/conversation.
              Available data reference:
              ${JSON.stringify(this.getDataReference(), null, 2)}

              If you need specific data, include "dataNeeded": ["action-id"] in your response.
              
              Respond in json with format: {
                "requiresAction": true|false,
                "response": "your message",
                "dataNeeded": ["list of action IDs if you need their data"],
                "reason": "why you need this data (if any)"
              }`
          },
          {
            role: "user",
            content: instruction
          }
        ],
        response_format: { type: "json_object" }
      });

      let analysis = JSON.parse(analysisResponse.choices[0].message?.content || "{}");
      
      // If the agent needs data, collect it all first
      let collectedData = {};
      if (analysis.dataNeeded?.length) {
        collectedData = await this.collectRequestedData(analysis.dataNeeded);
        
        // Now make the final decision with all data
        const finalAnalysis = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Analyze the instruction with all requested historical data:
                Original instruction: ${instruction}
                Requested data: ${JSON.stringify(collectedData, null, 2)}
                
                Provide your final analysis in JSON format: {
                  "requiresAction": true|false,
                  "response": "your message",
                  "relevantContext": "how the historical data influences your decision"
                }`
            }
          ],
          response_format: { type: "json_object" }
        });

        analysis = JSON.parse(finalAnalysis.choices[0].message?.content || "{}");
      }

      // If it's just a conversation, respond directly
      if (!analysis.requiresAction) {
        return {
          response: analysis.response
        };
      }

      // Website determination step
      const websiteResponse = await this.determineWebsitesWithContext(context);
      if (websiteResponse.status === 'needsClarification') {
        return {
          response: websiteResponse.question!
        };
      }

      const websites = websiteResponse.data!;

      // Config gathering step
      const configs = new Map();
      for (const website of websites) {
        try {
          configs.set(website.url, await this.getAIWEConfig(website.serviceName));
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Error occurred while getting config for ${website.serviceName}: ${errorMessage}. 
                  Analyze the error and provide a helpful response to the user about the issue and possible next steps.
                  Return your response in JSON format: {"response": "your message"}`
              }
            ],
            response_format: { type: "json_object" }
          });
          
          const errorResult = JSON.parse(response.choices[0].message?.content || "{}");
          return {
            response: errorResult.response || `Failed to get configuration for ${website.serviceName}`
          };
        }
      }

      // Action planning step
      const planResponse = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Plan actions based on available configurations. 
              If you need any clarification about parameters or specifics, respond with:
              {"status": "needsInfo", "question": "your question"}

              If you have everything needed, respond with:
              {
                "status": "complete",
                "plan": {
                  "actions": [
                    {
                      "id": "actionName",                 // The name of the action from the config
                      "website": "service.com",           // The website URL
                      "parameters": {},                   // Parameters required by the action
                      "dependsOn": ["previousActionId"],  // Optional: IDs of actions this depends on
                      "outputKey": "uniqueKey",          // Optional: key to store the output for other actions
                      "alwaysExecute": false             // Optional: whether to execute even if previously completed
                    }
                  ]
                }
              }

              Consider these already completed actions (don't repeat unless necessary):
              ${Array.from(context.completedActions?.entries() || [])
                .map(([id, action]) => `${id} on ${action.website} (${new Date(action.timestamp).toISOString()})`)
                .join('\n')}
              Previous context: ${context.conversationHistory}`
          },
          {
            role: "user",
            content: `Instruction: ${context.instruction}
              Available actions: ${JSON.stringify(Object.fromEntries(configs))}
              Previous results: ${JSON.stringify(Object.fromEntries(context.completedActions || new Map()))}
              Respond in json format as specified above.`
          }
        ],
        response_format: { type: "json_object" }
      });

      const planResult = JSON.parse(planResponse.choices[0].message?.content || "{}");
      
      // If we need more information, ask the user
      if (planResult.status === 'needsInfo') {
        return {
          response: planResult.question
        };
      }

      // If we have everything we need, execute the plan
      const results = await this.executePlan(planResult.plan.actions, configs, context.instruction, context.completedActions);

      // Return both the execution results and a human-readable summary
      return {
        response: results[results.length - 1], // The final summary
        executionResults: results
      };

    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          response: `Error: ${error.message}`
        };
      }
      return {
        response: 'An unknown error occurred'
      };
    }
  }

  private async getAIWEConfig(serviceName: string) {
    try {
      // Try official AIWE endpoint first
      const response = await axios.get(`https://${serviceName}.com/.aiwe`);
      const config = response.data;
      
      if (!this.isValidAIWEConfig(config)) {
        throw new Error(`Invalid AIWE configuration format from ${serviceName}`);
      }
      
      this.configSources.set(serviceName, 'official');
      return config;
    } catch (error) {
      try {
        // Try aiwe.cloud manifest using service name
        const cloudResponse = await axios.get(`http://localhost:3000/${serviceName}/.aiwe`);
        const cloudConfig = cloudResponse.data;

        if (!this.isValidAIWEConfig(cloudConfig)) {
          throw new Error(`Invalid AIWE configuration format from aiwe.cloud/${serviceName}`);
        }

        this.configSources.set(serviceName, 'aiwe.cloud');
        return cloudConfig;
      } catch (cloudError) {
        // Fallback to community bridge
        const bridge = communityBridges[serviceName] as CommunityBridge;
        if (bridge) {
          this.configSources.set(serviceName, 'bridge');
          return bridge.config;
        }
        
        throw new Error(`No AIWE integration available for ${serviceName}`);
      }
    }
  }

  private isValidAIWEConfig(config: any): boolean {
    if (!config || typeof config !== 'object') return false;
    
    // Check required top-level fields
    if (typeof config.service !== 'string' ||
        typeof config.description !== 'string' ||
        !Array.isArray(config.actions)) {
      return false;
    }
    
    // Validate each action
    return config.actions.every((action: any) => {
      if (typeof action.name !== 'string' ||
          typeof action.description !== 'string') {
        return false;
      }

      // Validate parameters if they exist
      if (action.parameters) {
        if (typeof action.parameters !== 'object') return false;

        // Check each parameter
        return Object.entries(action.parameters).every(([_, param]: [string, any]) => {
          if (!param || typeof param !== 'object') return false;
          
          // Required fields for a parameter
          if (typeof param.type !== 'string') return false;
          if ('required' in param && typeof param.required !== 'boolean') return false;

          // If it's an array type, validate items structure
          if (param.type === 'array' && param.items) {
            if (typeof param.items !== 'object') return false;
            
            // Validate each item parameter
            return Object.entries(param.items).every(([_, itemParam]: [string, any]) => {
              if (!itemParam || typeof itemParam !== 'object') return false;
              if (typeof itemParam.type !== 'string') return false;
              if ('required' in itemParam && typeof itemParam.required !== 'boolean') return false;
              return true;
            });
          }

          // If enum is specified, it must be an array
          if ('enum' in param && !Array.isArray(param.enum)) return false;

          return true;
        });
      }

      return true;
    });
  }

  private reorderActionPlan(actionPlan: any[]): any[] {
    const orderedPlan: any[] = [];
    const availableOutputs = new Set<string>();
    const unprocessedActions = [...actionPlan];

    while (unprocessedActions.length > 0) {
      const actionIndex = unprocessedActions.findIndex(action => {
        return !action.dependsOn || 
               action.dependsOn.every((dep: string) => availableOutputs.has(dep));
      });

      if (actionIndex === -1) {
        throw new Error("Circular dependency detected in action plan");
      }

      const nextAction = unprocessedActions.splice(actionIndex, 1)[0];
      orderedPlan.push(nextAction);

      if (nextAction.outputKey) {
        availableOutputs.add(nextAction.outputKey);
      }
    }

    return orderedPlan;
  }

  private async executePlan(
    actionPlan: any[], 
    configs: Map<string, any>,
    instruction: string,
    completedActions?: Map<string, { website: string; result: any; timestamp: number; }>
  ): Promise<any[]> {
    const orderedPlan = this.reorderActionPlan(actionPlan);
    const outputs = new Map();
    const chatHistory: { role: "system" | "assistant" | "user", content: string }[] = [];
    const actionResults: Array<{
      id: string;
      status: 'success' | 'failure';
      result?: any;
      error?: string;
    }> = [];

    // Execute all actions first
    for (const action of orderedPlan) {
      // Skip if action was already completed successfully (unless it's marked as required to repeat)
      const previousExecution = completedActions?.get(action.id);
      if (previousExecution && !action.alwaysExecute) {
        chatHistory.push({
          role: "assistant",
          content: `Skipping action "${action.id}" on ${action.website} as it was already completed at ${new Date(previousExecution.timestamp).toISOString()}`
        });
        
        if (action.outputKey) {
          outputs.set(action.outputKey, previousExecution.result);
        }
        continue;
      }

      if (action.dependsOn) {
        for (const dependency of action.dependsOn) {
          if (!outputs.has(dependency)) {
            throw new Error(`Cannot execute action ${action.id}: missing required dependency ${dependency}`);
          }
        }
      }
      
      const resolvedParams = this.resolveParameters(action.parameters || {}, outputs);
      const config = configs.get(action.website);
      if (!config) {
        throw new Error(`No configuration found for website ${action.website}`);
      }
      
      let actionResult: ActionResult = {
        status: 'error',
        action: action.id,
        website: action.website,
        retryCount: 0
      };

      const maxRetries = 3;
      while (actionResult.retryCount! < maxRetries) {
        try {
          const result = await this.executeAction(action.id, action.website, resolvedParams, config);
          actionResult = {
            status: 'success',
            action: action.id,
            website: action.website,
            result,
            retryCount: actionResult.retryCount
          };
          break;
        } catch (error) {
          actionResult.retryCount!++;
          actionResult.error = error instanceof Error ? error.message : 'Unknown error';
          
          if (actionResult.retryCount! >= maxRetries) {
            chatHistory.push({
              role: "user",
              content: `Action "${action.id}" on ${action.website} failed after ${maxRetries} attempts: ${actionResult.error}`
            });

            const response = await this.openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                ...chatHistory,
                {
                  role: "system",
                  content: `The action has failed. Analyze if:
                    1. The error is fatal and we should stop execution
                    2. We can skip this action and continue with the rest
                    3. We need to modify the action and retry
                    Respond with json with format: {"decision": "stop|continue|retry", "reason": "explanation"}`
                }
              ],
              response_format: { type: "json_object" }
            });

            const decision = JSON.parse(response.choices[0].message?.content || "{}");
            
            if (decision.decision === 'stop') {
              throw new Error(`Fatal error in action ${action.id}: ${actionResult.error}\nReason: ${decision.reason}`);
            } else if (decision.decision === 'retry') {
              actionResult.retryCount = 0; // Reset retry count to try again
              continue;
            }
            // If decision is 'continue', we'll break the retry loop and move to next action
            break;
          }
          
          // If we haven't hit max retries, wait before trying again
          await new Promise(resolve => setTimeout(resolve, 1000 * actionResult.retryCount!));
        }
      }

      if (actionResult.status === 'success') {
        if (action.outputKey) {
          outputs.set(action.outputKey, actionResult.result);
        }

        // Store successful execution
        completedActions?.set(action.id, {
          website: action.website,
          result: actionResult.result,
          timestamp: Date.now()
        });

        // Store in our results array
        actionResults.push({
          id: action.id,
          status: 'success',
          result: actionResult.result
        });

        // Store the action result
        this.dataStore.actions[action.id] = {
          website: action.website,
          result: actionResult.result,
          timestamp: Date.now(),
          parameters: resolvedParams
        };
      } else {
        actionResults.push({
          id: action.id,
          status: 'failure',
          error: actionResult.error
        });
      }
    }

    // Now process all results at once
    const finalResponse = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Analyze all executed actions and their results:
            Action Results: ${JSON.stringify(actionResults, null, 2)}
            
            Available data reference:
            ${JSON.stringify(this.getDataReference(), null, 2)}

            If you need additional historical data to provide better context, include "dataNeeded" in your response.
            
            Provide a complete analysis in JSON format: {
              "summary": "Complete summary of what was accomplished",
              "results": {
                "successful": ["List of successful actions with their outcomes"],
                "failed": ["List of failed actions with error details"]
              },
              "dataNeeded": ["IDs of relevant historical actions to consider"],
              "reason": "Why you need this historical data"
            }`
        }
      ],
      response_format: { type: "json_object" }
    });

    const finalResult = JSON.parse(finalResponse.choices[0].message?.content || "{}");

    // If historical data is needed, get it all at once
    if (finalResult.dataNeeded?.length) {
      const historicalData = await this.collectRequestedData(finalResult.dataNeeded);

      // Final analysis with all data
      const completeResponse = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Provide final analysis with all context:
              Current Results: ${JSON.stringify(actionResults, null, 2)}
              Historical Data: ${JSON.stringify(historicalData, null, 2)}
              
              Provide complete analysis in JSON format: {
                "summary": "Complete summary including historical context",
                "results": {
                  "successful": ["List of successful actions with outcomes"],
                  "failed": ["List of failed actions with reasons"]
                },
                "suggestions": ["List of possible next steps"],
                "context": "How historical data relates to current results"
              }`
          }
        ],
        response_format: { type: "json_object" }
      });

      const completeResult = JSON.parse(completeResponse.choices[0].message?.content || "{}");
      
      // Store the final response
      this.dataStore.conversations[this.dataStore.conversations.length - 1].response = completeResult.summary;

      return [completeResult.summary];
    }

    // If no historical data needed, use the initial final result
    this.dataStore.conversations[this.dataStore.conversations.length - 1].response = finalResult.summary;
    return [finalResult.summary];
  }

  private resolveAuthHeaders(service: string, authConfig: any): Record<string, string> {
    if (!authConfig?.type || authConfig.type !== 'header' || !authConfig.options?.length) {
      return {};
    }

    const authOption = authConfig.options[0];
    const requiredHeaders = authOption.headers || {};
    const savedCredentials = this.serviceCredentials[service] || {};
    
    // Check if we have all required credentials
    const missingCredentials = Object.keys(requiredHeaders).filter(key => !savedCredentials[key]);
    if (missingCredentials.length > 0) {
      throw new Error(
        `Missing credentials for ${service}:\n` +
        `Required: ${missingCredentials.join(', ')}\n` +
        `Please provide these credentials when initializing the bot.`
      );
    }

    // Only include the headers that are specified in the config
    return Object.entries(requiredHeaders).reduce((headers, [key, _]) => {
      headers[key] = savedCredentials[key];
      return headers;
    }, {} as Record<string, string>);
  }

  private async executeAction(actionId: string, website: string, params: any, config: any): Promise<any> {
    try {
      const source = this.configSources.get(config.service);
      
      if (source === 'official' || source === 'aiwe.cloud') {
        const action = config.actions.find((a: any) => a.name === actionId);
        if (!action) {
          throw new Error(`Action ${actionId} not found in ${config.service} config`);
        }

        try {
          // Resolve authentication headers from stored credentials
          const headers = this.resolveAuthHeaders(config.service, config.authentication);

          if (source === 'official') {
            const response = await axios.post(`https://${website}/ai-action`, {
              action: actionId,
              parameters: params
            }, { headers });
            return response.data;
          } else {
            const response = await axios.post(
              `http://localhost:3000/${config.service}/${actionId}`, 
              params,
              { headers }
            );
            return response.data;
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('Missing credentials')) {
            // Rethrow credential errors as they are already formatted
            throw error;
          }
          throw new Error(`Failed to execute action ${actionId} on ${config.service}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Must be a bridge at this point
      const bridge = communityBridges[config.service] as CommunityBridge;
      if (!bridge) {
        throw new Error(`No implementation available for ${config.service}`);
      }

      const bridgeAction = bridge.config.actions.find((a: any) => a.name === actionId);
      if (!bridgeAction) {
        throw new Error(`Action ${actionId} not found in ${config.service} bridge`);
      }

      const implementation = bridge.implementation;
      if (typeof implementation[actionId] !== 'function') {
        throw new Error(`Action ${actionId} not implemented in ${config.service} bridge`);
      }
      return await implementation[actionId](params);
    } catch (error: unknown) {
      throw error; // Let the error bubble up as is since we've already formatted it
    }
  }

  private resolveParameters(parameters: Record<string, any>, outputs: Map<string, any>): Record<string, any> {
    const resolvedParams: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.startsWith('$outputs.')) {
        const path = value.replace('$outputs.', '').split(/[\.\[\]]+/).filter(Boolean);
        let outputValue = outputs.get(path[0]);
        
        if (!outputValue) {
          throw new Error(`Cannot resolve parameter ${key}: missing required output ${path[0]}`);
        }
        
        for (let i = 1; i < path.length; i++) {
          outputValue = outputValue[path[i]];
          if (outputValue === undefined) {
            throw new Error(`Cannot resolve parameter ${key}: invalid path ${value}`);
          }
        }
        
        resolvedParams[key] = outputValue;
      } else {
        resolvedParams[key] = value;
      }
    }

    return resolvedParams;
  }

  private getDataReference(): DataReference {
    return {
      actions: Object.entries(this.dataStore.actions).reduce((ref, [id, action]) => {
        ref[id] = {
          description: `Action ${id} on ${action.website} with parameters: ${Object.keys(action.parameters).join(', ')}`,
          timestamp: action.timestamp
        };
        return ref;
      }, {} as DataReference['actions']),
      conversations: {
        count: this.dataStore.conversations.length,
        lastTimestamp: this.dataStore.conversations[this.dataStore.conversations.length - 1]?.timestamp || 0
      }
    };
  }

  private async getRelevantData(id: string): Promise<any> {
    return this.dataStore.actions[id] || null;
  }

  private async collectRequestedData(dataNeeded: DataRequest[]): Promise<Record<string, any>> {
    const collectedData: Record<string, any> = {};
    
    for (const request of dataNeeded) {
      collectedData[request.id] = await this.getRelevantData(request.id);
    }

    return collectedData;
  }
}