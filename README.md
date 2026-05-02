

A modular, microservice-style backend system built with **Node.js** and **Express**, consisting of three integrated services: a centralized **Logging Middleware**, a **Vehicle Maintenance Scheduler** (using a 0/1 Knapsack algorithm), and a **Notification Priority Inbox** (using exponential-decay scoring). All services communicate with the **Afford Medical Evaluation API** for data and log persistence.

---

## 📑 Table of Contents

- [High-Level Architecture](#-high-level-architecture)
- [Project Structure](#-project-structure)
- [Module Deep Dives](#-module-deep-dives)
  - [1. Logging Middleware](#1-logging-middleware)
  - [2. Vehicle Maintenance Scheduler](#2-vehicle-maintenance-scheduler)
  - [3. Notification Priority Inbox](#3-notification-priority-inbox)
- [End-to-End Data Flow](#-end-to-end-data-flow)
- [Notification System Design (Stages 1–6)](#-notification-system-design-stages-16)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
---

## 🏗 High-Level Architecture

```mermaid
graph TB
    subgraph Client["🖥️ Client / Browser"]
        C1["GET /vehicle_scheduling/:depotId"]
        C2["GET /vehicle_scheduling"]
        C3["GET /notifications/priority?n=10"]
    end

    subgraph VMS["⚙️ Vehicle Maintenance Scheduler<br/>(Port 3000)"]
        V_INDEX["index.js<br/>Express Router"]
        V_KNAP["knapsack.js<br/>0/1 Knapsack DP"]
    end

    subgraph NAB["📬 Notification Priority Inbox<br/>(Port 3001)"]
        N_INDEX["index.js<br/>Express Router"]
        N_PRIO["priorityInbox.js<br/>Priority Scoring Engine"]
    end

    subgraph LM["📝 Logging Middleware<br/>(Shared Library)"]
        LOGGER["logger.js<br/>Centralized Log()"]
    end

    subgraph EXT["☁️  API<br/>(External)"]
        API_DEPOTS["/depots"]
        API_VEHICLES["/vehicles"]
        API_NOTIFS["/notifications"]
        API_LOGS["/logs"]
    end

    C1 --> V_INDEX
    C2 --> V_INDEX
    C3 --> N_INDEX

    V_INDEX --> V_KNAP
    N_INDEX --> N_PRIO

    V_INDEX -.->|"Log()"| LOGGER
    N_INDEX -.->|"Log()"| LOGGER
    N_PRIO -.->|"Log()"| LOGGER

    V_INDEX -->|"GET /depots"| API_DEPOTS
    V_INDEX -->|"GET /vehicles"| API_VEHICLES
    N_PRIO -->|"GET /notifications"| API_NOTIFS
    LOGGER -->|"POST /logs"| API_LOGS

    style Client fill:#1e1e2e,stroke:#89b4fa,color:#cdd6f4
    style VMS fill:#1e1e2e,stroke:#a6e3a1,color:#cdd6f4
    style NAB fill:#1e1e2e,stroke:#f9e2af,color:#cdd6f4
    style LM fill:#1e1e2e,stroke:#cba6f7,color:#cdd6f4
    style EXT fill:#1e1e2e,stroke:#f38ba8,color:#cdd6f4
```

---

## 📁 Project Structure

```
RA2311028010024/
├── .env                              # Shared environment variables (token, API URL)
├── .gitignore
├── README.md                         # ← You are here
├── notification_system_design.md     # Detailed 6-stage system design document
│
├── logging_middleware/               # 📝 Shared logging service
│   ├── logger.js                     #    Core Log() function → POST /logs
│   ├── test.js                       #    Smoke test for logger
│   ├── .env                          #    API credentials
│   └── package.json
│
├── notification_app_be/              # 📬 Notification Priority Inbox backend
│   ├── index.js                      #    Express server (port 3001)
│   ├── priorityInbox.js              #    Scoring engine (type weight + recency)
│   ├── .env                          #    API credentials
│   └── package.json
│
└── vehicle_maintenance_scheduler/    # ⚙️  Vehicle Scheduling backend
    ├── index.js                      #    Express server (port 3000)
    ├── knapsack.js                   #    0/1 Knapsack dynamic programming
    ├── .env                          #    API credentials
    └── package.json
```

---

## 🔬 Module Deep Dives

### 1. Logging Middleware

> **Purpose:** A shared utility module that provides a single `Log()` function used by all services to send structured logs to the external evaluation API.

```mermaid
sequenceDiagram
    participant App as Any Service
    participant Logger as logger.js
    participant API as Evaluation API /logs

    App->>Logger: Log("backend", "info", "route", "message")
    Logger->>API: POST /logs { stack, level, package, message }
    API-->>Logger: 200 OK
    Logger-->>App: response.data
    
    Note over Logger,API: If API fails → console.error fallback
```

**How It Works:**
| Parameter | Type | Allowed Values |
|-----------|------|----------------|
| `stack` | `string` | `"backend"`, `"frontend"` |
| `level` | `string` | `"debug"`, `"info"`, `"warn"`, `"error"`, `"fatal"` |
| `package` | `string` | `"cache"`, `"controller"`, `"db"`, `"domain"`, `"handler"`, `"repository"`, `"route"`, `"service"`, `"auth"`, `"config"`, `"middleware"`, `"utils"` |
| `message` | `string` | Any descriptive message |

- Uses **Bearer token authentication** to call the evaluation API
- Gracefully falls back to `console.error` if the API is unreachable
- Imported by both the Vehicle Scheduler and the Notification Backend

---

### 2. Vehicle Maintenance Scheduler

> **Purpose:** Given a depot's limited mechanic hours, determine the **optimal subset of vehicles** to service that maximizes total maintenance impact — a classic **0/1 Knapsack problem** solved via dynamic programming.

```mermaid
graph LR
    subgraph Input
        D["Depot<br/>MechanicHours = capacity"]
        V["Vehicles[]<br/>Duration = weight<br/>Impact = value"]
    end

    subgraph Algorithm["0/1 Knapsack (DP)"]
        DP["Build dp[n+1][capacity+1] table"]
        BT["Backtrack to find<br/>selected vehicles"]
    end

    subgraph Output
        R["✅ Selected Vehicles<br/>Total Impact Score<br/>Hours Used / Remaining"]
    end

    D --> DP
    V --> DP
    DP --> BT
    BT --> R

    style Algorithm fill:#1e1e2e,stroke:#a6e3a1,color:#cdd6f4
```

**Algorithm Walkthrough:**

```
For each vehicle i (1 to n):
  For each capacity w (0 to MechanicHours):
    Option A: Skip vehicle i  →  dp[i][w] = dp[i-1][w]
    Option B: Take vehicle i  →  dp[i][w] = dp[i-1][w - Duration] + Impact
    
    dp[i][w] = max(Option A, Option B)

Backtrack from dp[n][capacity] to identify which vehicles were selected.
```

**Complexity:**
| Metric | Value |
|--------|-------|
| Time | `O(n × capacity)` |
| Space | `O(n × capacity)` |
| Backtracking | `O(n)` |

**End-to-End Flow:**

```mermaid
sequenceDiagram
    participant Client
    participant Server as index.js (Port 3000)
    participant Logger as Log()
    participant API as Evaluation API
    participant KS as knapsack.js

    Client->>Server: GET /vehicle_scheduling/3
    Server->>Logger: Log(info, "Request received for depot 3")
    
    par Parallel API Calls
        Server->>API: GET /depots
        Server->>API: GET /vehicles
    end
    
    API-->>Server: depots[], vehicles[]
    Server->>Logger: Log(info, "Fetched N depots, M vehicles")
    
    Server->>Server: Find depot with ID = 3
    
    alt Depot not found
        Server->>Logger: Log(warn, "Depot not found")
        Server-->>Client: 404 { error }
    else Depot found
        Server->>KS: knapsack(vehicles, depot.MechanicHours)
        KS-->>Server: { totalImpact, totalDurationUsed, selectedVehicles }
        Server->>Logger: Log(info, "Knapsack complete")
        Server-->>Client: 200 { depotId, budget, impact, vehicles }
    end
```

---

### 3. Notification Priority Inbox

> **Purpose:** Fetch all notifications from the evaluation API and rank them by priority using a **weighted scoring formula** that considers both the notification **type** and its **recency**.

**Priority Scoring Formula:**

```
score = (type_weight × 10) + (recency_score × 5)
```

| Notification Type | Type Weight | Rationale |
|-------------------|-------------|-----------|
| 🏢 **Placement** | 3 | Time-sensitive, career-critical |
| 📊 **Result** | 2 | Important but not urgent |
| 📅 **Event** | 1 | Informational |

**Recency Score** uses exponential decay:

```
recency_score = e^(−age_in_hours / 24)
```

```mermaid
graph LR
    subgraph Scoring
        A["Type Weight<br/>Placement=3, Result=2, Event=1"] -->|"× 10"| S["Priority Score"]
        B["Recency = e^(-age/24)<br/>Now→1.0, 24h→0.37, 48h→0.14"] -->|"× 5"| S
    end

    subgraph Pipeline
        S --> SORT["Sort Descending"]
        SORT --> SLICE["Slice Top N"]
        SLICE --> RES["Return Ranked List"]
    end

    style Scoring fill:#1e1e2e,stroke:#f9e2af,color:#cdd6f4
    style Pipeline fill:#1e1e2e,stroke:#89b4fa,color:#cdd6f4
```

**Score Examples:**

| Notification | Type Weight | Age | Recency | **Final Score** |
|---|---|---|---|---|
| Placement (just now) | 3 | 0h | 1.00 | **35.00** |
| Result (2h ago) | 2 | 2h | 0.92 | **24.60** |
| Placement (48h ago) | 3 | 48h | 0.14 | **30.68** |
| Event (just now) | 1 | 0h | 1.00 | **15.00** |

**End-to-End Flow:**

```mermaid
sequenceDiagram
    participant Client
    participant Server as index.js (Port 3001)
    participant Logger as Log()
    participant Scorer as priorityInbox.js
    participant API as Evaluation API

    Client->>Server: GET /notifications/priority?n=5
    Server->>Logger: Log(info, "Priority inbox requested for top 5")
    
    Server->>Scorer: getTopNNotifications(5)
    Scorer->>Logger: Log(info, "Fetching top 5 priority notifications")
    Scorer->>API: GET /notifications
    API-->>Scorer: { notifications: [...] }
    
    Scorer->>Logger: Log(debug, "Fetched N notifications, computing scores")
    
    Note over Scorer: For each notification:<br/>score = (type_weight × 10) + (e^(-age/24) × 5)
    
    Scorer->>Scorer: Sort by score DESC → Slice top 5
    Scorer->>Logger: Log(info, "Top 5 selected. Highest: 34.95")
    Scorer-->>Server: top5[]
    
    Server-->>Client: 200 { count: 5, notifications: [...] }
```

---

## 🔄 End-to-End Data Flow

This diagram shows how **all three modules interact** end-to-end in a complete request lifecycle:

```mermaid
flowchart TD
    subgraph CLIENT["🖥️ Client Layer"]
        REQ1["GET /vehicle_scheduling/:depotId"]
        REQ2["GET /notifications/priority?n=N"]
    end

    subgraph SERVICES["⚙️ Service Layer"]
        subgraph VMS["Vehicle Maintenance Scheduler :3000"]
            V1["Parse depotId from params"]
            V2["Parallel fetch: /depots + /vehicles"]
            V3["Find target depot by ID"]
            V4["Run 0/1 Knapsack DP"]
            V5["Return optimal schedule"]
        end

        subgraph NAB["Notification Priority Inbox :3001"]
            N1["Parse ?n query param"]
            N2["Fetch all /notifications"]
            N3["Score each: type_weight × 10 + recency × 5"]
            N4["Sort DESC → Slice top N"]
            N5["Return ranked notifications"]
        end
    end

    subgraph SHARED["📝 Shared Layer"]
        LOG["Logging Middleware<br/>Log(stack, level, pkg, msg)"]
    end

    subgraph EXTERNAL["☁️ External API Layer"]
        API_D["/depots"]
        API_V["/vehicles"]
        API_N["/notifications"]
        API_L["/logs"]
    end

    REQ1 --> V1
    V1 --> V2
    V2 --> API_D
    V2 --> API_V
    API_D --> V3
    API_V --> V3
    V3 --> V4
    V4 --> V5

    REQ2 --> N1
    N1 --> N2
    N2 --> API_N
    API_N --> N3
    N3 --> N4
    N4 --> N5

    V1 -.-> LOG
    V4 -.-> LOG
    N1 -.-> LOG
    N3 -.-> LOG
    LOG -.-> API_L

    style CLIENT fill:#1e1e2e,stroke:#89b4fa,color:#cdd6f4
    style SERVICES fill:#11111b,stroke:#a6e3a1,color:#cdd6f4
    style SHARED fill:#1e1e2e,stroke:#cba6f7,color:#cdd6f4
    style EXTERNAL fill:#1e1e2e,stroke:#f38ba8,color:#cdd6f4
```

---

## 📐 Notification System Design (Stages 1–6)

The project includes a comprehensive **6-stage system design** for a university-scale notification system. Below is a summary — see [`notification_system_design.md`](notification_system_design.md) for full details.

```mermaid
graph TD
    S1["<b>Stage 1</b><br/>REST API Design<br/>+ SSE Real-Time"] --> S2["<b>Stage 2</b><br/>PostgreSQL Schema<br/>+ Indexing Strategy"]
    S2 --> S3["<b>Stage 3</b><br/>Query Optimization<br/>+ EXPLAIN Analysis"]
    S3 --> S4["<b>Stage 4</b><br/>Redis Caching<br/>Multi-Layer Strategy"]
    S4 --> S5["<b>Stage 5</b><br/>Message Queue<br/>Async Processing"]
    S5 --> S6["<b>Stage 6</b><br/>Priority Inbox<br/>Min-Heap + Scoring"]

    style S1 fill:#1e1e2e,stroke:#89b4fa,color:#cdd6f4
    style S2 fill:#1e1e2e,stroke:#a6e3a1,color:#cdd6f4
    style S3 fill:#1e1e2e,stroke:#f9e2af,color:#cdd6f4
    style S4 fill:#1e1e2e,stroke:#fab387,color:#cdd6f4
    style S5 fill:#1e1e2e,stroke:#f38ba8,color:#cdd6f4
    style S6 fill:#1e1e2e,stroke:#cba6f7,color:#cdd6f4
```

| Stage | Topic | Key Decisions |
|-------|-------|---------------|
| **1** | REST API + Real-Time | 5 endpoints + SSE for push notifications |
| **2** | Database Schema | PostgreSQL with UUID PKs, ENUMs, partial indexes |
| **3** | Query Optimization | Composite partial index, eliminate `SELECT *`, covering indexes |
| **4** | Caching Strategy | Redis multi-layer: unread count (30s TTL) + page cache (60s TTL) |
| **5** | Async Processing | Message queue with bulk DB insert → async email/push workers + DLQ |
| **6** | Priority Inbox | Weighted scoring formula + Min-Heap for O(log N) top-N maintenance |

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js | Server-side JavaScript execution |
| **Framework** | Express.js v5 | HTTP routing and middleware |
| **HTTP Client** | Axios | External API communication |
| **Config** | dotenv | Environment variable management |
| **Algorithm** | Custom DP | 0/1 Knapsack (no external libs) |
| **Scoring** | Custom Math | Exponential decay priority scoring |
| **External API** | Afford Medical Evaluation API | Data source + log persistence |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x
- Valid **ACCESS_TOKEN** from Afford Medical Technologies

### Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd RA2311028010024

# 2. Install dependencies for each service
cd logging_middleware && npm install && cd ..
cd vehicle_maintenance_scheduler && npm install && cd ..
cd notification_app_be && npm install && cd ..
```

### Running the Services

```bash
# Terminal 1 — Vehicle Maintenance Scheduler (port 3000)
cd vehicle_maintenance_scheduler
node index.js

# Terminal 2 — Notification Priority Inbox (port 3001)
cd notification_app_be
node index.js
```

### Testing

```bash
# Test the logging middleware
cd logging_middleware
node test.js

# Test Vehicle Scheduler — Single depot
curl http://localhost:3000/vehicle_scheduling/1

# Test Vehicle Scheduler — All depots
curl http://localhost:3000/vehicle_scheduling

# Test Notification Priority Inbox — Top 5
curl "http://localhost:3001/notifications/priority?n=5"
```

---

## 📚 API Reference

### Vehicle Maintenance Scheduler (Port 3000)

#### `GET /vehicle_scheduling/:depotId`

Get the optimal maintenance schedule for a specific depot.

**Response:**
```json
{
  "depotId": 1,
  "mechanicHoursBudget": 120,
  "totalImpactScore": 285,
  "hoursUsed": 118,
  "hoursRemaining": 2,
  "vehiclesSelected": 5,
  "selectedVehicles": [
    { "TaskID": 12, "Duration": 24, "Impact": 85 }
  ]
}
```

#### `GET /vehicle_scheduling`

Get optimal schedules for **all** depots.

**Response:**
```json
{
  "schedules": [
    {
      "depotId": 1,
      "mechanicHoursBudget": 120,
      "totalImpactScore": 285,
      "hoursUsed": 118,
      "selectedVehicles": [...]
    }
  ]
}
```

---

### Notification Priority Inbox (Port 3001)

#### `GET /notifications/priority?n={count}`

Get the top N highest-priority notifications, ranked by type importance and recency.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `n` | `integer` | `10` | Number of top notifications to return |

**Response:**
```json
{
  "count": 5,
  "notifications": [
    {
      "Type": "Placement",
      "Message": "Google hiring drive tomorrow",
      "Timestamp": "2026-05-02T10:00:00Z",
      "priorityScore": 34.95
    }
  ]
}
```


