import { OpenAI } from "openai";
import axios from "axios";
import { communityBridges } from "./community-bridges";

interface AIWEBotOptions {
  openAIApiKey: string;
}

export class AIWEBot {
  private openai: OpenAI;
  private configSources = new Map<string, 'official' | 'bridge'>();

  constructor(options: AIWEBotOptions) {
    this.openai = new OpenAI({ apiKey: options.openAIApiKey });
  }

  async processInstruction(instruction: string): Promise<any> {
    try {
      const websites = await this.determineWebsites(instruction);
      
      const configs = new Map();
      for (const website of websites) {
        configs.set(website, await this.getAIWEConfig(website));
      }
      
      const actionPlan = await this.planActions(instruction, configs);
      
      return await this.executePlan(actionPlan, configs);
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to process instruction: ${error.message}`);
      }
      throw new Error('Failed to process instruction: Unknown error');
    }
  }

  private async determineWebsites(instruction: string): Promise<string[]> {
    const websiteResponse = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are a helpful assistant that identifies website URLs from user instructions. Format your response as a JSON array of websites needed to complete the instruction. Format should be {\"websites\": [<array of urls>]" 
        },
        { 
          role: "user", 
          content: "Respond with a JSON array. " + instruction 
        }
      ],
      response_format: { type: "json_object" }
    });

    const response = JSON.parse(websiteResponse.choices[0].message?.content || "[]");
    const websites = response['websites'];
    if (websites.length === 0) {
      throw new Error("Could not determine which websites to interact with. Please be more specific.");
    }

    return websites.map((website: string) => website.replace(/^(https?:\/\/)/, ''));
  }

  private async getAIWEConfig(website: string) {
    try {
      // Try official AIWE endpoint first
      const response = await axios.get(`https://${website}/.aiwe`);
      const config = response.data;
      
      if (!this.isValidAIWEConfig(config)) {
        throw new Error(`Invalid AIWE configuration format from ${website}`);
      }
      
      this.configSources.set(website, 'official');
      return config;
    } catch (error) {
      // Fallback to community bridge
      const bridge = communityBridges[website];
      if (bridge) {
        this.configSources.set(website, 'bridge');
        return bridge.config;
      }
      
      throw new Error(`No AIWE integration available for ${website}`);
    }
  }

  private isValidAIWEConfig(config: any): boolean {
    if (!config || typeof config !== 'object') return false;
    
    if (!Array.isArray(config.actions)) return false;
    
    return config.actions.every((action: any) => {
      return (
        typeof action.id === 'string' &&
        typeof action.name === 'string' &&
        typeof action.description === 'string' &&
        (!action.parameters || typeof action.parameters === 'object') &&
        (!action.outputSchema || typeof action.outputSchema === 'object')
      );
    });
  }

  private async getInternalConfig(website: string) {
    try {
      const config = require(`../../${website}/aiwe.json`);
      
      // Verify the config format
      if (!this.isValidAIWEConfig(config)) {
        throw new Error(`Invalid internal AIWE configuration format for ${website}`);
      }
      
      return config;
    } catch (error) {
      return null;
    }
  }

  private async planActions(instruction: string, configs: Map<string, any>): Promise<any[]> {
    const actionPlanResponse = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: `You must respond with a JSON array of actions in the correct execution order.
          For actions that depend on previous actions' outputs, specify the dependency in the 'dependsOn' field.
          Example JSON format:
          [
            { "id": "get_invoices", "website": "stripe.com", "parameters": {}, "outputKey": "stripe_invoices" },
            { "id": "upload_document", "website": "dropbox.com", "parameters": { "file": "$outputs.stripe_invoices[0]" }, "dependsOn": ["stripe_invoices"] }
          ]
          If no suitable actions exist, respond with [].` 
        },
        { 
          role: "user", 
          content: `Respond with a JSON array. Instruction: ${instruction}\nAvailable actions per website: ${JSON.stringify(Object.fromEntries(configs))}` 
        }
      ],
      response_format: { type: "json_object" }
    });

    const actionPlan = JSON.parse(actionPlanResponse.choices[0].message.content || "[]");
    if (!actionPlan.length) {
      throw new Error("No suitable actions available to complete this instruction.");
    }

    return actionPlan;
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

  private async executePlan(actionPlan: any[], configs: Map<string, any>): Promise<any[]> {
    const orderedPlan = this.reorderActionPlan(actionPlan);
    const outputs = new Map();
    const results: any[] = [];
    
    for (const action of orderedPlan) {
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
      
      const result = await this.executeAction(action.id, action.website, resolvedParams, config);
      
      if (action.outputKey) {
        outputs.set(action.outputKey, result);
      }
      
      results.push(result);
    }

    return results;
  }

  private async executeAction(actionId: string, website: string, params: any, config: any): Promise<any> {
    try {
      const source = this.configSources.get(website);
      
      if (source === 'official') {
        const response = await axios.post(`https://${website}/ai-action`, {
          action: actionId,
          parameters: params
        });
        return response.data;
      }
      
      // Must be a bridge at this point
      const bridge = communityBridges[website];
      if (!bridge) {
        throw new Error(`No implementation available for ${website}`);
      }

      const implementation = bridge.implementation;
      if (typeof implementation[actionId] !== 'function') {
        throw new Error(`Action ${actionId} not implemented in ${website} bridge`);
      }
      return await implementation[actionId](params);
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to execute action ${actionId} on ${website}: ${error.message}`);
      }
      throw new Error(`Failed to execute action ${actionId} on ${website}: Unknown error`);
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
}