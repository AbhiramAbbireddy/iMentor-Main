# iMentor System Architecture
> **Target Audience**: New Developers & Platform Engineers
> **Role Context**: Staff Engineer Technical Overview

This document provides a comprehensive architectural breakdown of the **iMentor** chatbot platform, a robust, AI-powered gamified learning environment capable of Tutor-led Socratic learning, deep Research, and Graph-based Retrieval-Augmented Generation (GraphRAG).

---

## 1. Technology Stack Breakdown

iMentor embraces a microservice architecture to decouple the fast-moving AI logic from standard web, user, and session management.

### Application Services
- **Frontend (port 3005)**: 
  - **React.js + Vite**: Fast, modern frontend framework handling the UI, chat components, and gamified skill tree visualizations.
- **Node.js Backend (port 5005)**: 
  - **Express.js API**: Handles JWT Authentication, database business logic, user intent classification, and streaming LLM responses down to the frontend.
- **Python RAG Service (port 2005)**:
  - **FastAPI**: Manages all complex data-processing: Graph extraction, PDF ingestion, PDF Chunking (SentenceTransformers), Subtopic Notes (STN) Generation, and Semantic routing.

### AI Infrastructure
- **SGLang (port 8000)**: 
  - Replaces default engines (like vLLM or Ollama proxy limits) for **all LLM Inference operations**.
  - **Model**: `Qwen2.5-7B-Instruct-AWQ` serving as the bedrock for Chat, Socratic Tutor, and Tree-of-Thoughts (ToT) modes.
  - SGLang enables high-throughput batching and blazing fast GPU utilization (~7-8GB VRAM consumed on default settings).
- **Ollama**: 
  - Strictly delegated to **Embeddings only** (using `mxbai-embed-large` 1024-dim representations) and isolated fallback routers (`qwen2.5:3b`); absolutely forbidden from servicing standard chat interactions.

### Data persistence & Databases
The system strategically distributes state based on usage characteristics:
- **MongoDB (port 27018)**: Primary transactional store for users, profiles, gamification models (XP, levels, badges), and historical chat logs.
- **Redis (port 6380)**: Hot cache layer ensuring sub-5ms latencies for fetching pre-compiled SubTopic Notes (STN), semantic routes, and real-time session state management.
- **Neo4j (ports 7688/7475)**: The persistent Curriculum Graph. Stores the `Module → Topic → Subtopic` structure alongside user-uploaded individual Knowledge Graphs (KG). Facilitates deep GraphRAG.
- **Qdrant (ports 6335/6336)**: Primary Vector store holding embedding chunks corresponding strictly to course material (PDF texts) to serve high-confidence RAG pipelines.
- **Elasticsearch (port 9201)**: Keyword and structured fallback search mechanism supplementing dense-vector queries where raw symbolic matching is preferred.

---

## 2. Global Directory Structure

A layout of the core workspace (`/chatbot`) to quickly orient you. 

```
/home/sri/Downloads/iMentor_march/chatbot
├── /frontend
│    └── The Vite/React application holding all visual and layout logic.
├── /server
│    ├── server.js              # Express backend entry point
│    ├── /rag_service           # 🧠 The Python FastAPI AI Service! (Contains all ML logic)
│    │    ├── app.py            # Primary endpoints for /embed, /stn, /curriculum, GraphRAG
│    │    └── (*.py files)      # Specialized generators & evaluators
│    ├── /config                # Configuration rules, notably routingConfig.js
│    ├── /course_bootstrap      # Directories handling offline parsing of PDFs into Neo4j/Qdrant
│    └── /scripts               # Dev scripts including initializeLLMCatalog.js
├── /grafana & /prometheus
│    └── Monitoring layers tracking cached hit-rates, latency, node-health.
├── /monitor
│    └── Dedicated shell scripts for hot-deploying and actively analyzing the suite.
├── /nginx
│    └── Reverse proxy configuration rules for unified routing on port 8080/8443.
├── /playwright-report & /test-results & /tests
│    └── Integration / E2E Testing scaffolding managed by Playwright.
├── docker-compose.yml          # Contains the definition for all infrastructure nodes + ports.
├── ROUTING_ARCHITECTURE.md     # IMMUTABLE LLM Routing Rules. (CRITICAL READ)
├── GUIDE.md                    # Manual bootstrapping and offline course population instructions.
└── startup.sh                  # Bootstrap executable firing 3 terminals to initialize dev environment.
```

---

## 3. The Core Data Flow: RAG Query Pipeline

When a user submits a query on the frontend, how does iMentor construct the answer? 
This is the life-blood of the application.

### Step-by-Step Data Journey

1. **Frontend Dispatch**: 
   - Student submits a message on the React UI. Payload sent to the Node Backend over a secure Web-socket/HTTP stream.
2. **Intent & Flag Classification (node backend)**:
   - Node evaluates session flags first:
     - `tutorMode=true`: Directly bypasses standard routing, hits STN lookup, fires Socratic AI.
     - `useReAct=true` or `quizMode=true`: Routes to specialized logic loops.
3. **Semantic Router Optimization**:
   - If a standard query is issued, Node calls the Python RAG service (`/embed`) via Ollama `mxbai-embed-large` (~5ms computation).
   - Embedding is compared via Cosine similarity to the server's prototype intents table memory (~1ms).
   - If confidence > `0.75` alongside `Thinking Icon Enabled`, query routes to complex tree-of-thoughts (ToT).
   - Else, standard RAG mode engages.
4. **Graph & Vector Retrieval (RAG Mode)**:
   - **Qdrant** is hit to run vector similarity search to pull 1024-dim top-K most relevant course document chunks (~300ms).
   - **Neo4j** operates GraphRAG to extract related knowledge nodes and semantic relationships regarding the query.
5. **Prompt Injection & Generation (SGLang)**:
   - RAG pipeline aggregates user message + Qdrant Document Context + Neo4j Graph relations.
   - Forwards compiled massive prompt to `SGLANG_CHAT_URL` (`Qwen2.5-7B-Instruct-AWQ`).
   - SGLang inferences at huge batching scale and dynamically streams tokens back to the Node Express server.
6. **State & Gamification Updating**:
   - Stream returns to the Frontend UI for live-typing view. 
   - Post-response `knowledgeStateService` evaluates answer efficacy, bumps progression trees in `MongoDB`.
   - Node applies `XP = floor(overallScore/10) + creativityBonus` algorithm into their `GamificationProfile`.

*Happy hacking. Proceed to `START-INSTRUCTIONS.md` and `docker-compose.yml` for exact infrastructure parameters.*
