require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const agent = require('./agent');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Endpoint for Query Agent
app.post('/api/query', async (req, res) => {
    const { query } = req.body;

    if (!query) {
        return res.status(400).json({ error: "Query parameter is required." });
    }

    console.log(`Received query from frontend: "${query}"`);

    try {
        // 1. Classify Query
        const classification = await agent.classifyQuery(query);
        if (!classification.isValid) {
            return res.json({ result: classification.reason, source: "agent" });
        }

        // 2. Check for Similar Past Query
        const similarResult = await agent.findSimilarQuery(query);
        if (similarResult) {
            console.log(`Found similar past query: "${similarResult.query}"`);
            return res.json({
                result: similarResult.results,
                source: "cache",
                originalQuery: similarResult.query
            });
        }

        console.log("No similar past query found. Searching the web...");
        // 3. Perform Web Search and Scrape
        const scrapedContents = await agent.searchAndScrape(query);

        if (scrapedContents.length === 0) {
            return res.json({ result: "Could not find relevant content on the web for your query.", source: "web-search" });
        }

        // 4. Summarize Content
        console.log("Summarizing scraped content...");
        const summarizedText = await agent.summarizeContent(scrapedContents);

        // 5. Store Results for Future
        await agent.storeQueryResult(query, summarizedText);
        console.log("New results stored for future use.");

        // 6. Return Results
        res.json({ result: summarizedText, source: "web-search" });

    } catch (error) {
        console.error("Error processing query:", error);
        res.status(500).json({ error: "An internal server error occurred.", details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});