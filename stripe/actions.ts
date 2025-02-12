export const StripeAIWEActions = {
    actions: [
      {
        id: "get_balance",
        description: "Retrieve the current account balance",
        parameters: []
      },
      {
        id: "list_payments",
        description: "List recent payment transactions",
        parameters: ["limit"]
      },
      {
        id: "create_payment",
        description: "Create a new payment intent",
        parameters: ["amount", "currency", "description"]
      },
      {
        id: "refund_payment",
        description: "Refund a specific payment",
        parameters: ["paymentIntentId"]
      }
    ],
    version: "1.0"
  };
  