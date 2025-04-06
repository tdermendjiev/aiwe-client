import { AIWEBot } from '../../../lib/aiwe-bot';

export class AIWEService {
  private aiweBot: AIWEBot;

  constructor() {
    this.aiweBot = new AIWEBot({
      openAIApiKey: process.env.OPENAI_API_KEY as string,
      serviceCredentials: {
        invbg: {
          "x-api-key": process.env.INVBG_API_KEY as string
        }
      }
    });
  }

  async executeCommand(command: string): Promise<any> {
    try {
      return await this.aiweBot.processMessage(command);
    } catch (error) {
      console.error('Error executing AIWE command:', error);
      throw error;
    }
  }
} 