import Stripe from 'stripe';
import dotenv from 'dotenv';

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
