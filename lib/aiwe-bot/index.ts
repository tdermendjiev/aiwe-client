import { OpenAI } from "openai";
import axios from "axios";
import { communityBridges } from "./community-bridges";
import { AIWEBotOptions, ExecutionContext, AgentResponse, WebsiteInfo, ConversationResponse, StoredData, DataReference, CommunityBridge, ActionResult, DataRequest } from "./types";
import Utils from "./utils";
import { Prompts } from './prompts';

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
      messages: Prompts.websiteIdentification(context),
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
        messages: Prompts.actionAnalysis(instruction, this.getDataReference()),
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
          messages: Prompts.instructionAnalysis(instruction, collectedData),
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
            messages: Prompts.configError(website.serviceName, errorMessage),
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
        messages: Prompts.actionPlanning(context, Object.fromEntries(configs), context.completedActions),
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
      
      if (!Utils.isValidAIWEConfig(config)) {
        throw new Error(`Invalid AIWE configuration format from ${serviceName}`);
      }
      
      this.configSources.set(serviceName, 'official');
      return config;
    } catch (error) {
      try {
        // Try aiwe.cloud manifest using service name
        const cloudResponse = await axios.get(`http://localhost:3000/${serviceName}/.aiwe`);
        const cloudConfig = cloudResponse.data;

        if (!Utils.isValidAIWEConfig(cloudConfig)) {
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

  private async executePlan(
    actionPlan: any[], 
    configs: Map<string, any>,
    instruction: string,
    completedActions?: Map<string, { website: string; result: any; timestamp: number; }>
  ): Promise<any[]> {
    const orderedPlan = Utils.reorderActionPlan(actionPlan);
    const outputs = new Map();
    const chatHistory: { role: "system" | "assistant" | "user", content: string }[] = [];
    const actionResults: ActionResult[] = [];

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
              messages: Prompts.errorHandling(actionResult.error || 'Unknown error', chatHistory),
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
          status: 'success',
          action: action.id,
          website: action.website,
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
          status: 'error',
          action: action.id,
          website: action.website,
          error: actionResult.error
        });
      }
    }

    // Now process all results at once
    const finalResponse = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: Prompts.finalAnalysis(actionResults, this.getDataReference()),
      response_format: { type: "json_object" }
    });

    const finalResult = JSON.parse(finalResponse.choices[0].message?.content || "{}");

    // If historical data is needed, get it all at once
    if (finalResult.dataNeeded?.length) {
      const historicalData = await this.collectRequestedData(finalResult.dataNeeded);

      // Final analysis with all data
      const completeResponse = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: Prompts.finalAnalysisWithHistory(actionResults, historicalData),
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

export { CommunityBridge } from './types';