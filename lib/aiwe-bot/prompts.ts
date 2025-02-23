import { ChatCompletionMessageParam } from "openai/resources/chat";
import { ExecutionContext, ActionResult } from './types';

export class Prompts {
  static websiteIdentification(context: ExecutionContext): ChatCompletionMessageParam[] {
    return [
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
    ];
  }

  static actionAnalysis(instruction: string, dataReference: any): ChatCompletionMessageParam[] {
    return [
      {
        role: "system",
        content: `Analyze if this instruction requires executing actions on websites or is just a question/conversation.
          Available data reference:
          ${JSON.stringify(dataReference, null, 2)}

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
    ];
  }

  static errorHandling(error: string, chatHistory: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
    return [
      ...chatHistory,
      {
        role: "system",
        content: `The action has failed. Analyze if:
          1. The error is fatal and we should stop execution
          2. We can skip this action and continue with the rest
          3. We need to modify the action and retry
          Error: ${error}
          Respond with json with format: {"decision": "stop|continue|retry", "reason": "explanation"}`
      }
    ];
  }

  static finalAnalysis(actionResults: ActionResult[], dataReference: any): ChatCompletionMessageParam[] {
    return [
      {
        role: "system",
        content: `Analyze all executed actions and their results:
          Action Results: ${JSON.stringify(actionResults, null, 2)}
          
          Available data reference:
          ${JSON.stringify(dataReference, null, 2)}

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
    ];
  }

  static configError(serviceName: string, error: string): ChatCompletionMessageParam[] {
    return [
      {
        role: "system",
        content: `Error occurred while getting config for ${serviceName}: ${error}. 
          Analyze the error and provide a helpful response to the user about the issue and possible next steps.
          Return your response in JSON format: {"response": "your message"}`
      }
    ];
  }

  static actionPlanning(
    context: ExecutionContext, 
    configs: any, 
    completedActions?: Map<string, { website: string; result: any; timestamp: number; }>
  ): ChatCompletionMessageParam[] {
    return [
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
          ${Array.from(completedActions?.entries() || [])
            .map(([id, action]) => `${id} on ${action.website} (${new Date(action.timestamp).toISOString()})`)
            .join('\n')}
          Previous context: ${context.conversationHistory}`
      },
      {
        role: "user",
        content: `Instruction: ${context.instruction}
          Available actions: ${JSON.stringify(configs)}
          Previous results: ${JSON.stringify(Object.fromEntries(completedActions || new Map()))}
          Respond in json format as specified above.`
      }
    ];
  }

  static finalAnalysisWithHistory(
    actionResults: ActionResult[], 
    historicalData: any
  ): ChatCompletionMessageParam[] {
    return [
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
    ];
  }

  static instructionAnalysis(instruction: string, collectedData: any): ChatCompletionMessageParam[] {
    return [
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
    ];
  }
} 