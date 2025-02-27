import { AIWEBot } from '../../lib/aiwe-bot';
import dotenv from 'dotenv';

dotenv.config();

class StripeBot {
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
    return await this.aiweBot.processInstruction(command);
  }
}

(async () => {
  try {
    const stripeBot = new StripeBot();
    const result = await stripeBot.executeCommand("Get my invoices from invbg");
    console.log("Result:", result);
  } catch (error) {
    console.error("Error:", error);
  }
})();
