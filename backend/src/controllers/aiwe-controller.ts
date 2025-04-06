import { Request, Response } from 'express';
import { AIWEService } from '../services/aiwe-service';

export class AIWEController {
  private aiweService: AIWEService;

  constructor() {
    this.aiweService = new AIWEService();
  }

  async executeCommand(req: Request, res: Response): Promise<Response> {
    try {
      const { command } = req.body;
      
      if (!command) {
        return res.status(400).json({ error: 'Command is required' });
      }
      
      console.log(`Executing command: ${command}`);
      const result = await this.aiweService.executeCommand(command);
      
      return res.status(200).json({ result });
    } catch (error) {
      console.error('Error executing command:', error);
      return res.status(500).json({ error: 'Failed to execute command' });
    }
  }

  healthCheck(req: Request, res: Response): Response {
    return res.status(200).send('OK');
  }
} 