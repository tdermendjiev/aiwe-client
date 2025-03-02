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
    console.log('Starting...')
    const result = await stripeBot.executeCommand("What is my last invoice in invbg (inv.bg), the service name is invbg? Who is the client and what is the amount due? Get the list of invoices, then find the last one and tell me the information.");
    console.log("Result:", result);
  } catch (error) {
    console.error("Error:", error);
  }
})();
