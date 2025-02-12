interface BridgeConfig {
  package: string;
  config?: any;
  implementation?: any;
}

export const communityBridges: Record<string, BridgeConfig> = {
  'stripe.com': {
    package: '@aiwe/stripe-bridge',
    config: require('../../stripe/aiwe.json'),
    implementation: new (require('../../stripe').StripeAIWE)()
  },
  'github.com': {
    package: '@aiwe/github-bridge'
  }
}; 