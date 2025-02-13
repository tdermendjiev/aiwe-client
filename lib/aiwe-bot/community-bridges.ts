import { stripeBridge } from '../../stripe';
import { CommunityBridge } from '../aiwe-bot';

export const communityBridges: Record<string, CommunityBridge> = {
  'stripe.com': stripeBridge
}; 