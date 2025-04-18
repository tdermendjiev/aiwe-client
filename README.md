# AI Web Execution (AIWE)
### Version 0.1 

---

## **1. Introduction**
### **1.1 Purpose**
The AI Web Execution (AIWE) framework is a standardized communication layer designed to facilitate AI-native interactions with web services. Instead of AI agents adapting to human-centric UIs via scraping or automation tools, AIWE enables services to expose structured, AI-optimized execution points. This eliminates inefficiencies in traditional browser automation, improves reliability, and enhances security.

### **1.2 Benefits of AIWE**
- **Eliminates Web Scraping & UI Automation** – AI agents interact directly with structured data.
- **Standardized AI Integration** – Provides a universal interface for AI agents across different web services.
- **Security & Control** – Services define structured access, reducing risks of bot abuse.
- **Improved Scalability** – AI interactions become faster and more robust.
- **Reduces Maintenance** – Websites don't need to keep adjusting for bots scraping dynamic UIs.

---

## **2. Framework Overview**
AIWE defines a lightweight, execution-driven model where websites expose a set of **AI-friendly actions, structured data, and authentication mechanisms**. This ensures seamless and permissioned AI-agent interactions.

### **2.1 Core Components**
1. **AI Action Discovery** – Defines how AI agents discover available execution points.
2. **Execution API** – A structured API exposing AI-accessible interactions.
3. **Data Access API** – Provides structured, machine-readable access to relevant data.
4. **Execution Hints** – Helps agents navigate web services efficiently.
5. **Authentication & Authorization** – Implements secure AI-agent access.
6. **Agent Interoperability** – Enables AI workflow execution across services.

---

## **3. Framework Structure**
### **3.1 AI Action Discovery**
Web services expose a `/.aiwe` endpoint that lists available AI interactions and execution points.

#### **3.1.1 Endpoint**
```
GET /.aiwe
```
#### **3.1.2 Example Response**
```json
{
  "actions": [
    {"id": "search_flights", "description": "Search available flights", "parameters": ["origin", "destination", "date"]},
    {"id": "book_flight", "description": "Book a specific flight", "parameters": ["flight_id", "payment_method"]}
  ],
  "data": [
    {"id": "pricing", "description": "Get real-time fare prices"},
    {"id": "booking_history", "description": "Retrieve booking history"}
  ],
  "auth": "OAuth2",
  "version": "1.0"
}
```

---

### **3.2 Execution API**
Web services expose an API for AI agents to execute predefined actions.

#### **3.2.1 Endpoint Structure**
```
POST /aiwe-execute
```

#### **3.2.2 Example Request**
```json
{
  "action": "book_flight",
  "parameters": {
    "flight_id": "FL123",
    "payment_method": "stored_card_1"
  },
  "auth_token": "xyz-123"
}
```

#### **3.2.3 Example Response**
```json
{
  "status": "success",
  "booking_reference": "BK789",
  "confirmation_url": "https://airline.com/bookings/BK789"
}
```

---

### **3.3 Data Access API**
Allows AI agents to fetch structured data without parsing human-readable web pages.

#### **3.3.1 Endpoint Structure**
```
GET /aiwe-data/{data_id}
```

#### **3.3.2 Example Request**
```
GET /aiwe-data/pricing?auth_token=xyz-123
```

#### **3.3.3 Example Response**
```json
{
  "pricing": {
    "flight_id": "FL123",
    "base_fare": 299.99,
    "taxes": 50.00,
    "currency": "USD"
  }
}
```

---

### **3.4 Execution Hints**
Web services can provide AI agents with structured execution metadata to optimize interactions.

#### **3.4.1 Semantic HTML Tags**
```html
<button data-aiwe-action="book_flight" data-flight-id="FL123">Book Now</button>
```

#### **3.4.2 JSON-LD Metadata**
```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "aiweActions": {
    "book_flight": {
      "method": "POST",
      "endpoint": "/aiwe-execute",
      "parameters": ["flight_id", "payment_method"]
    }
  }
}
```

---

### **3.5 Authentication & Authorization**
Services use OAuth2-like authentication for AI agent access control.

#### **3.5.1 AI Agent Authentication Flow**
1. **AI Agent requests access** → (`GET /aiwe-auth-request`)
2. **User grants AI permission** → (Approval via browser or app)
3. **AI Agent receives token** → (Short-lived access token issued)

#### **3.5.2 Example OAuth2 Token Exchange**
```json
{
  "agent_id": "travel_assistant_ai",
  "permissions": ["search_flights", "book_flight"],
  "expires_at": "2025-02-10T12:00:00Z"
}
```

---

### **3.6 Agent Interoperability**
Defines standards for AI agents to execute workflows across web services.

#### **3.6.1 Agent Communication Protocol**
- **Agents register** with an **AI directory service**
- **Message-passing framework** enables cross-service execution
- **Federated AI Agents** enable complex workflows (e.g., travel booking + insurance + car rental)

#### **3.6.2 Example Agent-to-Agent Message**
```json
{
  "from": "travel_assistant_ai",
  "to": "insurance_ai",
  "action": "quote_travel_insurance",
  "parameters": {"booking_reference": "BK789"}
}
```

## **4. Usage Examples**
### **4.1 Basic Usage**
Using AIWE is as simple as:

```typescript
import { AIWEAgent } from 'aiwe';

const agent = new AIWEAgent({
  openAIApiKey: process.env.OPENAI_API_KEY
});

// Financial and payments
await agent.execute("Get my Stripe balance");
await agent.execute("Process refund for last Stripe payment");

// Travel
await agent.execute("Book the cheapest United flight to San Francisco next Friday");
await agent.execute("Find available Delta flights to NYC under $300");

// Shopping
await agent.execute("Find AirPods Pro on Amazon");
```

### **4.2 Complex Workflows**
AIWE handles multi-service workflows naturally:

```typescript
// Travel planning
await agent.execute(`
  Plan my trip:
  - Find a direct United flight
  - Book a Hilton hotel near Times Square
  - Add everything to Google Calendar
`);

// Financial tracking
await agent.execute(`
  Process monthly tasks:
  - Get all Stripe payments from last month
  - Check Amazon orders status
  - Add summary to Google Calendar
`);
```

If the agent needs clarification, it will ask:
- "Which airline would you prefer to book with?"
- "Would you like to include nearby airports in the search?"
- "What's your preferred flight time?"

The AIWE framework handles:
- 🔍 Discovering relevant websites and services
- 🤖 Planning and executing complex workflows
- 🔑 Managing authentication and permissions
- 🔄 Coordinating across multiple services
- ⚠️ Error handling and retries

---

## **5. Community Bridges**
### **5.1 Overview**
Community Bridges enable the AIWE framework to integrate with existing web services that haven't yet implemented native AIWE endpoints. These bridges act as translation layers, allowing AI agents to interact with traditional websites through standardized AIWE interfaces.

### **5.2 Benefits**
- **Immediate Integration** – Use AIWE with existing services before native implementation
- **Community-Driven** – Open-source bridges maintained by the developer community
- **Gradual Adoption** – Services can transition to native AIWE support at their own pace
- **Backwards Compatibility** – Ensures AIWE works with legacy systems

### **5.3 Example Bridge Implementation**
```typescript
import { AIWEBridge } from 'aiwe-bridge';

// Example bridge for a traditional e-commerce site
const amazonBridge = new AIWEBridge({
  name: 'amazon',
  actions: {
    'search_products': {
      execute: async (params) => {
        // Bridge implementation for product search
      }
    },
    'add_to_cart': {
      execute: async (params) => {
        // Bridge implementation for cart functionality
      }
    }
  }
});
```




