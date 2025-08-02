# Web Query Agent

This project is a web browser query agent that intelligently fetches and summarizes information from the web. It is designed to be efficient by caching past results and using AI for classification and summarization.

The application is built with a full-stack architecture, featuring a Node.js backend and a React frontend, fulfilling the stretch goal of the Ripplica interview task.

## Features

- **Intelligent Query Classification:** Automatically classifies user queries as valid or invalid to prevent unnecessary searches.
- **Efficient Caching:** Utilizes vector embeddings and cosine similarity to check if a similar query has been made in the past.
- **Robust Web Scraping:** Uses Playwright to navigate, search, and scrape content from multiple search engines.
- **AI-Powered Summarization:** Summarizes content from the top webpages using a Large Language Model (LLM) to provide a concise answer.
- **Full-Stack Application:** A working backend API and a user-friendly frontend demonstrate a complete, end-to-end solution.

## Architecture

The agent's architecture is built around a series of interconnected modules designed for reliability and performance.

### Flowchart
A detailed flowchart of the agent's internal workings.

```mermaid
graph TD
    A[User Starts Application] --> B(Frontend Displays Query Input);
    B -- User Enters Query --> C(Frontend Sends Query to Backend /api/query);
    C --> D{Backend: Query Classifier Module};
    D -- Invalid Query Detected --> E[Backend: Returns Invalid Query Message];
    E --> F(Frontend: Displays "This is not a valid query.");
    F --> G[End Current Query Process];
    D -- Valid Query Detected --> H{Backend: Query Similarity Checker};
    H --> I[Backend: Generate Embedding for Current Query];
    I --> J{Backend: Search for Similar Query in past_queries.json};
    J -- Similar Query Found (Similarity > Threshold) --> K[Backend: Retrieve Stored Results];
    K --> L[Backend: Returns Cached Results to Frontend];
    L --> M(Frontend: Displays Cached Results);
    M --> G;
    J -- No Similar Query Found --> N{Backend: Web Search and Scraper Module};
    N --> O[Backend: Launch Headless Browser (Playwright)];
    O --> P[Backend: Navigate to Search Engine and Search];
    P --> Q[Backend: Scrape Top 5 Webpage URLs];
    Q --> R[Backend: Visit Each URL and Extract Text Content];
    R --> S{Backend: Content Summarizer Module};
    S --> T[Backend: Summarize Scraped Content using Groq LLM];
    T --> U{Backend: Results Storage Module};
    U --> V[Backend: Save New Query, Embedding, and Summarized Results to past_queries.json];
    V --> W[Backend: Returns New Summarized Results to Frontend];
    W --> X(Frontend: Displays New Summarized Results);
    X --> G;
```

##Technologies used

**Backend**

**Node.js with Express.js**: A fast and scalable backend framework.

**Playwright**: A robust library for browser automation and web scraping.

**Groq API**: Used for fast and efficient LLM-powered query classification and content summarization.

**Gemini API**: Used for generating high-quality vector embeddings for semantic similarity checks.

**compute-cosine-similarity**: A lightweight package for calculating vector similarity.

**dotenv**: For managing environment variables and API keys securely.

**Frontend**

**React**: A modern JavaScript library for building the user interface.

**Vite**: A fast build tool for the frontend development server.

#Getting Started

##Prerequisites

Node.js (v18 or higher)

npm or yarn

**Installation**
Clone the repository:

```bash
git clone https://github.com/Shirisha-16/Web-QueryAgent.git
cd Web-QueryAgent
```

##Set up environment variables:

Create a .env file in the root of the project and add your API keys.

## Get a Gemini API key from [https://ai.google.dev/](https://ai.google.dev/)
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

## Get a Groq API key from [https://console.groq.com/keys](https://console.groq.com/keys)
GROQ_API_KEY=YOUR_GROQ_API_KEY_HERE

**Install backend dependencies:**
cd backend
npm install

**Install frontend dependencies:**
cd ../frontend
npm install

##Running the Application

Start the backend server:

Open a terminal, navigate to the backend folder, and run:

```bash
npm start
```

Start the frontend application:

Open a second terminal, navigate to the frontend folder, and run:

```bash
npm start
```
