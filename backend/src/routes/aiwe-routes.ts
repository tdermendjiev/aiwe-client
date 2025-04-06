import { Router } from 'express';
import { AIWEController } from '../controllers/aiwe-controller';

export const aiweRouter = Router();
const aiweController = new AIWEController();

aiweRouter.post('/execute-command', (req, res) => aiweController.executeCommand(req, res));
aiweRouter.get('/health', (req, res) => aiweController.healthCheck(req, res)); 