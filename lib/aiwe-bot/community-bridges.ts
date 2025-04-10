import { stripeBridge } from '../../stripe';
import { CommunityBridge } from './types';

export const communityBridges: Record<string, CommunityBridge> = {
  'stripe.com': stripeBridge,
}; 