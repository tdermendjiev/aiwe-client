import Stripe from 'stripe';
import dotenv from 'dotenv';
import { CommunityBridge } from '../lib/aiwe-bot';

dotenv.config();

export class StripeAIWE {
  constructor(private stripeKey: string = process.env.STRIPE_SECRET_KEY as string) {
    this.stripe = new Stripe(this.stripeKey);
  }

  private stripe: Stripe;

  async getBalance() {
    try {
      const balance = await this.stripe.balance.retrieve();
      return balance;
    } catch (error) {
      throw new Error(`Error fetching balance: ${error}`);
    }
  }

  async listPayments(limit: number = 10) {
    try {
      const payments = await this.stripe.paymentIntents.list({ limit });
      return payments;
    } catch (error) {
      throw new Error(`Error listing payments: ${error}`);
    }
  }

  async createPayment(amount: number, currency: string, description: string) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency,
        description,
      });
      return paymentIntent;
    } catch (error) {
      throw new Error(`Error creating payment: ${error}`);
    }
  }

  async refundPayment(paymentIntentId: string) {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
      });
      return refund;
    } catch (error) {
      throw new Error(`Error processing refund: ${error}`);
    }
  }
}

export const stripeBridge: CommunityBridge = {
  config: {
    actions: [
      {
        id: 'getBalance',
        name: 'Get Balance',
        description: 'Retrieve the current balance from Stripe'
      },
      {
        id: 'listPayments',
        name: 'List Payments',
        description: 'List recent payment intents',
        parameters: {
          limit: { type: 'number', optional: true }
        }
      },
      {
        id: 'createPayment',
        name: 'Create Payment',
        description: 'Create a new payment intent',
        parameters: {
          amount: { type: 'number', required: true },
          currency: { type: 'string', required: true },
          description: { type: 'string', required: true }
        }
      },
      {
        id: 'refundPayment',
        name: 'Refund Payment',
        description: 'Refund a payment intent',
        parameters: {
          paymentIntentId: { type: 'string', required: true }
        }
      }
    ]
  },
  implementation: {
    getBalance: async () => {
      const stripe = new StripeAIWE();
      return await stripe.getBalance();
    },
    listPayments: async (params: { limit?: number }) => {
      const stripe = new StripeAIWE();
      return await stripe.listPayments(params.limit);
    },
    createPayment: async (params: { amount: number; currency: string; description: string }) => {
      const stripe = new StripeAIWE();
      return await stripe.createPayment(params.amount, params.currency, params.description);
    },
    refundPayment: async (params: { paymentIntentId: string }) => {
      const stripe = new StripeAIWE();
      return await stripe.refundPayment(params.paymentIntentId);
    }
  }
};
