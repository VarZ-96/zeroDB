# zeroDB 🌐⚡
> **Collaborative, AI-Powered SQL Workspace & Browser Database**

zeroDB is a full-stack, zero-friction database compiler and playground built directly in the browser. It combines WebAssembly execution engines (DuckDB and SQLite) with generative AI tooling and real-time WebSockets to create a collaborative SQL scripting space. 

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)](https://webassembly.org/)
[![Gemini](https://img.shields.io/badge/Gemini_AI-8E75FF?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)

---

## 🚀 Key Features

*   **In-Browser WASM Databases**: Compile and execute SQL queries instantly inside the browser using WebAssembly. Run analytical query scripts via **DuckDB-Wasm** (OLAP) or transactional queries via **SQL.js** (SQLite/OLTP) with zero installation.
*   **Real-Time Collaborative Editing**: Multiple developers can edit SQL queries, track live cursors, view active member presences, and share results in real-time, powered by persistent **Socket.io** connections.
*   **Google Gemini AI Assistant**: 
    *   **Mock Data Generator**: Analyzes your custom `CREATE TABLE` schema and generates realistic synthetic insert statements.
    *   **Text-to-SQL Compiler**: Converts natural language requests into optimized, executable SQL queries.
    *   **Query Visualizer & Optimizer**: Evaluates explain plans and suggests performance-focused SQL transformations.
*   **Secure Remote PostgreSQL Integration**: Add your external connection string (e.g. from Neon or Supabase) to query remote databases and automatically compile schema trees in the UI. Credentials are encrypted on the backend with AES-256 before storage.
*   **Advanced UI & Visualizations**: Equipped with a full **Monaco Editor** integration, real-time data table exports (CSV/JSON), and dynamic SQL data plotting using **Recharts**.

---

## 🛠️ System Architecture

```mermaid
graph TD
    subgraph Client (Browser)
        A[Vite React Frontend] --> B[Monaco SQL Editor]
        A --> C[DuckDB-Wasm Engine]
        A --> D[SQL.js SQLite Engine]
        A --> E[Socket.io Client]
    end

    subgraph Server (Node.js & Express)
        F[Render Backend API] --> G[Socket.io Server]
        F --> H[Google Gemini API]
        F --> I[Crypto Service AES-256]
    end

    subgraph Data Tier
        J[MongoDB Atlas]
        K[Neon/Supabase Remote Postgres]
    end

    E <-->|Real-time Cursors & execution| G
    A <-->|HTTP Requests| F
    F <-->|User & History Storage| J
    F <-->|Query Execution & Schema Indexing| K
```

---

## 📦 Tech Stack

*   **Frontend**: React (Vite), Tailwind CSS, Monaco Editor, Lucide React, Recharts, TanStack Virtual.
*   **Backend**: Node.js, Express.js, Socket.io, Mongoose (MongoDB), PG (Postgres client), Node-Cron.
*   **Databases**: DuckDB-Wasm, SQL.js, MongoDB Atlas (Cloud), PostgreSQL (Neon/Supabase).
*   **APIs & Security**: Google Gemini API, Google OAuth 2.0, JSON Web Tokens (JWT), Crypto (AES-256).

---

## ⚙️ Local Installation & Setup

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18+)
*   [MongoDB](https://www.mongodb.com/) (Local or Atlas account)

### 1. Clone the repository
```bash
git clone https://github.com/VarZ-96/zeroDB.git
cd zeroDB
```

### 2. Configure the Backend
1. Navigate to the `backend` folder:
   ```bash
   cd backend
   npm install
   ```
2. Create a `.env` file in the `backend` directory and add the following:
   ```env
   PORT=5000
   MODE=dev
   MONGO_URI=your_mongodb_connection_uri
   JWT_SECRET=your_jwt_signing_secret
   GOOGLE_CLIENT_ID=your_google_oauth_client_id
   GEMINI_API_KEY=your_gemini_api_key
   ENCRYPTION_KEY=your_64_character_hex_key
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

### 3. Configure the Frontend
1. Open a new terminal and navigate to the `frontend` folder:
   ```bash
   cd frontend
   npm install
   ```
2. Create a `.env` file in the `frontend` directory:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Access the application locally at `http://localhost:5173`.

---

## 🌐 Production Deployment

Refer to the complete, step-by-step deployment blueprint in **[DEPLOYMENT.md](./DEPLOYMENT.md)** for hosting the app on:
*   **Frontend**: Vercel (Free Static Hosting)
*   **Backend**: Render (Free Web Service)
*   **Database**: MongoDB Atlas & Neon DB (Free Serverless Databases)
