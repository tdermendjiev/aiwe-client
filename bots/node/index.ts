import { AIWEBot } from "../../lib/aiwe-bot";
import dotenv from "dotenv";

dotenv.config();

class StripeBot {
  private aiweBot: AIWEBot;

  constructor() {
    this.aiweBot = new AIWEBot({
      openAIApiKey: process.env.OPENAI_API_KEY as string,
      serviceCredentials: {
        invbg: {
          "x-api-key": process.env.INVBG_API_KEY as string,
        },
        googledrive: {
          "x-api-credentials": process.env.GOOGLE_DRIVE_CREDENTIALS as string,
        },
      },
    });
  }

  async executeCommand(command: string): Promise<any> {
    return await this.aiweBot.processMessage(command);
  }
}

(async () => {
  try {
    const stripeBot = new StripeBot();
    console.log("Starting...");
    const result = await stripeBot.executeCommand(
      "The service is named googledrive. Get a list of all folders in the root folder of Google Drive and display all the names of folders in an alphabetical order, sorted ascending."
      // "List all services you have access to."
    );
    // const result = await stripeBot.executeCommand(
    //   "What is my last invoice in invbg (inv.bg), the service name is invbg. Who is the client and what is the amount due? Get the list of invoices, then find the last one and tell me the information."
    // );
    console.log("Result:", result);
  } catch (error) {
    console.error("Error:", error);
  }
})();
