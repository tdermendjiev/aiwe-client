import { OpenAI } from "openai";
import axios from "axios";
import { communityBridges } from "./community-bridges";
import { 
  AIWEBotOptions, 
  ExecutionContext, 
  AgentResponse, 
  WebsiteInfo, 
  ConversationResponse, 
  StoredData, 
  DataReference, 
  CommunityBridge, 
  ActionResult, 
  DataRequest,
  Session,
  Logger
} from "./types";
import Utils from "./utils";
import { Prompts } from './prompts';
import { SessionManager } from './session-manager';
import { ConsoleLogger } from './logger';

export class AIWEBot {
  private openai: OpenAI;
  private configSources = new Map<string, 'official' | 'bridge' | 'aiwe.cloud'>();
  private serviceCredentials: Record<string, Record<string, string>>;
  private dataStore: StoredData = {
    actions: {}
  };
  private sessionManager: SessionManager;
  private logger: Logger;

  constructor(options: AIWEBotOptions) {
    this.openai = new OpenAI({ apiKey: options.openAIApiKey });
    this.serviceCredentials = options.serviceCredentials || {};
    this.logger = options.logger || new ConsoleLogger();
    this.sessionManager = new SessionManager(this.logger);
  }

  async processMessage(message: string, sessionId?: string): Promise<ConversationResponse> {
    try {
      this.logger.info(`Processing message${sessionId ? ` in session ${sessionId}` : ''}`);
      let session: Session;
      
      if (sessionId) {
        session = this.sessionManager.getSession(sessionId)!;
        if (!session) {
          throw new Error(`Invalid session ID: ${sessionId}`);
        }
        session = this.sessionManager.addMessage(session, message);
      } else {
        session = this.sessionManager.createSession(message);
      }

      const context = this.sessionManager.getSessionContext(session);

      // First, analyze if this is an actionable message or just a question
      this.logger.debug('Analyzing message for action requirements');
      const analysisResponse = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: Prompts.actionAnalysis(message, this.getDataReference()),
        response_format: { type: "json_object" }
      });

      let analysis = JSON.parse(analysisResponse.choices[0].message?.content || "{}");
      this.logger.debug('LLM Analysis:', analysis);
      
      // If the agent needs data, collect it all first
      let collectedData = {};
      if (analysis.dataNeeded?.length && !analysis.requiresAction) {
        this.logger.debug('Collecting required data');
        collectedData = await this.collectRequestedData(analysis.dataNeeded);
        
        // Now make the final decision with all data
        const finalAnalysis = await this.openai.chat.completions.create({
          model: "gpt-4o",
          messages: Prompts.instructionAnalysis(message, collectedData),
          response_format: { type: "json_object" }
        });

        analysis = JSON.parse(finalAnalysis.choices[0].message?.content || "{}");
        this.logger.debug('LLM Final Analysis:', analysis);
      }

      // If it's just a conversation, respond directly
      if (!analysis.requiresAction) {
        this.logger.debug('Responding to conversational message');
        const response = analysis.response;
        this.sessionManager.updateSession(session, response);
        return {
          response,
          sessionId: session.id
        };
      }

      // Website determination step
      this.logger.debug('Determining relevant websites');
      const websiteResponse = await this.determineWebsitesWithContext(context);
      this.logger.debug('LLM Website Determination:', websiteResponse);
      if (websiteResponse.status === 'needsClarification') {
        const response = websiteResponse.question!;
        this.sessionManager.updateSession(session, response);
        return {
          response,
          sessionId: session.id
        };
      }

      const websites = websiteResponse.data!;
      this.logger.info(`Identified websites: ${websites.map(w => w.serviceName).join(', ')}`);

      // Config gathering step
      this.logger.debug('Gathering website configurations');
      const configs = new Map();
      for (const website of websites) {
        try {
          configs.set(website.serviceName, await this.getAIWEConfig(website.serviceName));
          this.logger.debug(`Retrieved config for ${website.serviceName}`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          this.logger.error(`Failed to get config for ${website.serviceName}: ${errorMessage}`);
          const aiResponse = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: Prompts.configError(website.serviceName, errorMessage),
            response_format: { type: "json_object" }
          });
          
          const errorResult = JSON.parse(aiResponse.choices[0].message?.content || "{}");
          const response = errorResult.response || `Failed to get configuration for ${website.serviceName}`;
          this.sessionManager.updateSession(session, response);
          return {
            response,
            sessionId: session.id
          };
        }
      }

      // Action planning step
      this.logger.debug('Planning actions');
      const planResponse = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: Prompts.actionPlanning(context, Object.fromEntries(configs), context.completedActions),
        response_format: { type: "json_object" }
      });

      const planResult = JSON.parse(planResponse.choices[0].message?.content || "{}");
      this.logger.debug('LLM Action Plan:', JSON.stringify(planResult, null, 2));
      
      if (planResult.status === 'needsInfo') {
        this.logger.debug('Requesting additional information');
        const response = planResult.question;
        this.sessionManager.updateSession(session, response);
        return {
          response,
          sessionId: session.id
        };
      }

      // Execute the plan
      this.logger.info(`Executing plan with ${planResult.plan.actions.length} actions`);
      const results = await this.executePlan(planResult.plan.actions, configs, message, context.completedActions);
      
      const response = results[results.length - 1];
      this.sessionManager.updateSession(session, response);
      
      return {
        response,
        executionResults: results,
        sessionId: session.id
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      this.logger.error(`Error processing message: ${errorMessage}`);
      if (sessionId) {
        const session = this.sessionManager.getSession(sessionId);
        if (session) {
          this.sessionManager.updateSession(session, `Error: ${errorMessage}`);
        }
      }
      return {
        response: `Error: ${errorMessage}`,
        sessionId: sessionId || ''
      };
    }
  }

  private async determineWebsitesWithContext(context: ExecutionContext): Promise<AgentResponse<WebsiteInfo[]>> {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: Prompts.websiteIdentification(context),
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message?.content || "{}");
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
    message: string,
    completedActions?: Map<string, { serviceName: string; result: any; timestamp: number; }>
  ): Promise<any[]> {
    const orderedPlan = Utils.reorderActionPlan(actionPlan);
    const outputs = new Map();
    const chatHistory: { role: "system" | "assistant" | "user", content: string }[] = [];
    const actionResults: ActionResult[] = [];

    // Execute all actions first
    for (const action of orderedPlan) {
      this.logger.info(`Executing action ${action.id} on ${action.serviceName}`);
      
      // Skip if action was already completed successfully (unless it's marked as required to repeat)
      const previousExecution = completedActions?.get(action.id);
      if (previousExecution && !action.alwaysExecute) {
        this.logger.debug(`Skipping already completed action ${action.id}`);
        chatHistory.push({
          role: "assistant",
          content: `Skipping action "${action.id}" on ${action.serviceName} as it was already completed at ${new Date(previousExecution.timestamp).toISOString()}`
        });
        
        outputs.set(action.id, previousExecution.result);
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
      const config = configs.get(action.serviceName);
      if (!config) {
        throw new Error(`No configuration found for website ${action.serviceName}`);
      }
      
      let actionResult: ActionResult = {
        status: 'error',
        action: action.id,
        serviceName: action.serviceName,
        retryCount: 0
      };

      const maxRetries = 3;
      while (actionResult.retryCount! < maxRetries) {
        try {
          const result = await this.executeAction(action.id, action.serviceName, resolvedParams, config);
          actionResult = {
            status: 'success',
            action: action.id,
            serviceName: action.serviceName,
            result,
            retryCount: actionResult.retryCount
          };
          this.logger.info(`Successfully executed action ${action.id}`);
          break;
        } catch (error) {
          actionResult.retryCount!++;
          actionResult.error = error instanceof Error ? error.message : 'Unknown error';
          
          if (actionResult.retryCount! >= maxRetries) {
            this.logger.error(`Action ${action.id} failed after ${maxRetries} attempts: ${actionResult.error}`);
            chatHistory.push({
              role: "user",
              content: `Action "${action.id}" on ${action.serviceName} failed after ${maxRetries} attempts: ${actionResult.error}`
            });

            const response = await this.openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: Prompts.errorHandling(actionResult.error || 'Unknown error', chatHistory),
              response_format: { type: "json_object" }
            });

            const decision = JSON.parse(response.choices[0].message?.content || "{}");
            this.logger.debug('LLM Error Handling Decision:', decision);
            
            if (decision.decision === 'stop') {
              throw new Error(`Fatal error in action ${action.id}: ${actionResult.error}\nReason: ${decision.reason}`);
            } else if (decision.decision === 'retry') {
              this.logger.debug(`Retrying action ${action.id}`);
              actionResult.retryCount = 0;
              continue;
            }
            break;
          }
          
          this.logger.debug(`Retrying action ${action.id} (attempt ${actionResult.retryCount})`);
          await new Promise(resolve => setTimeout(resolve, 1000 * actionResult.retryCount!));
        }
      }

      if (actionResult.status === 'success') {
        if (action.outputKey) {
          outputs.set(action.outputKey, actionResult.result);
        }

        completedActions?.set(action.id, {
          serviceName: action.serviceName,
          result: actionResult.result,
          timestamp: Date.now()
        });

        actionResults.push({
          status: 'success',
          action: action.id,
          serviceName: action.serviceName,
          result: actionResult.result
        });

        this.dataStore.actions[action.id] = {
          serviceName: action.serviceName,
          result: actionResult.result,
          timestamp: Date.now(),
          parameters: resolvedParams
        };
      } else {
        this.logger.error(`Action ${action.id} failed: ${actionResult.error}`);
        actionResults.push({
          status: 'error',
          action: action.id,
          serviceName: action.serviceName,
          error: actionResult.error
        });
      }
    }

    // Now process all results at once
    this.logger.debug('Generating final summary');
    const finalResponse = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: Prompts.finalAnalysis(actionResults, message),
      response_format: { type: "json_object" }
    });

    const finalResult = JSON.parse(finalResponse.choices[0].message?.content || "{}");
    this.logger.debug('LLM Final Summary:', finalResult);
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

  private async executeAction(actionId: string, serviceName: string, params: any, config: any): Promise<any> {
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
            const response = await axios.post(`https://${serviceName}/ai-action`, {
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
          description: `Action ${id} on ${action.serviceName} with parameters: ${Object.keys(action.parameters).join(', ')}`,
          timestamp: action.timestamp
        };
        return ref;
      }, {} as DataReference['actions']),
      sessions: {
        count: this.sessionManager.getSessionsCount(),
        lastTimestamp: this.sessionManager.getLastSessionTimestamp()
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