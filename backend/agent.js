require('dotenv').config({ path: '../.env' }); // Path to root .env file
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const computeCosineSimilarity = require('compute-cosine-similarity');

const pastQueriesFilePath = path.join(__dirname, 'data', 'past_queries.json');

// Initialize both AI clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// --- 1. Utility Functions for Persistence ---
async function loadPastQueries() {
    try {
        const data = await fs.readFile(pastQueriesFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn("past_queries.json not found, initializing empty data.");
            return [];
        }
        console.error("Error loading past queries:", error);
        return [];
    }
}

async function savePastQueries(queries) {
    try {
        await fs.writeFile(pastQueriesFilePath, JSON.stringify(queries, null, 2), 'utf8');
    } catch (error) {
        console.error("Error saving past queries:", error);
    }
}

// --- 2. Embedding Generator (using Gemini) ---
async function getEmbedding(text) {
    try {
        const model = genAI.getGenerativeModel({ model: "embedding-001" });
        // FIX: Use correct payload structure for Gemini embedding API
        const result = await model.embedContent({
            content: { parts: [{ text }] },
            taskType: "RETRIEVAL_DOCUMENT"
        });
        return result.embedding.values;
    } catch (error) {
        console.error("Error getting embedding from Gemini:", error.message);
        return null;
    }
}

// --- 3. Query Classifier (using Groq) ---
async function classifyQuery(query) {
    const lowerCaseQuery = query.trim().toLowerCase();
    
    // Check for specific unsupported phrases
    if (lowerCaseQuery.includes('add') && lowerCaseQuery.includes('to grocery')) {
        return { isValid: false, reason: "This is not a valid query." };
    }
    if (lowerCaseQuery.includes('walk my pet')) {
        return { isValid: false, reason: "This is not a valid query." };
    }

    // New: Check for a broader pattern of unsupported commands
    const invalidVerbs = ['make', 'cook', 'feed', 'give', 'tell', 'show', 'remind'];
    const hasInvalidVerb = invalidVerbs.some(verb => lowerCaseQuery.startsWith(verb + ' '));

    if (hasInvalidVerb && lowerCaseQuery.includes('my cat')) {
        return { isValid: false, reason: "This is not a valid query." };
    }
    
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Classify the following user query as 'valid' or 'invalid'.
                    An 'invalid' query is a command, multiple unrelated commands, or clearly non-searchable personal requests (e.g., "walk my pet, add apples to grocery", "remind me to call mom").
                    A 'valid' query is a request for information that can be searched on the web (e.g., "Best places to visit in Delhi", "What is the capital of France?").
                    Respond ONLY with the word "valid" or "invalid" followed by a period.`
                },
                {
                    role: "user",
                    content: `Query: "${query}"`
                }
            ],
            model: "deepseek-r1-distill-llama-70b",
            temperature: 0.1,
            max_tokens: 10
        });
        
        const classification = chatCompletion.choices[0]?.message?.content.trim().toLowerCase();

        if (classification.includes('invalid')) {
            return { isValid: false, reason: "This is not a valid query." };
        }
        return { isValid: true };
    } catch (error) {
        console.error("Error classifying query with Groq AI:", error.message);
        return { isValid: true, reason: "AI classification failed, defaulting to valid." };
    }
}

// --- 4. Query Similarity Checker ---
async function findSimilarQuery(currentQuery) {
    const pastQueries = await loadPastQueries();
    if (pastQueries.length === 0) {
        return null;
    }

    const currentEmbedding = await getEmbedding(currentQuery);
    if (!currentEmbedding) {
        console.warn("Could not generate embedding for current query. Cannot perform similarity check.");
        return null;
    }

    let bestMatch = null;
    const SIMILARITY_THRESHOLD = 0.85;

    for (const past of pastQueries) {
        if (!past.embedding) {
            console.warn(`Past query "${past.query}" missing embedding, skipping similarity check.`);
            continue;
        }
        const sim = computeCosineSimilarity(currentEmbedding, past.embedding);
        if (sim >= SIMILARITY_THRESHOLD) {
            return past;
        }
    }
    return null;
}

// --- 5. Enhanced Web Search and Scraping ---
async function searchAndScrape(query) {
    let browser;
    try {
        browser = await chromium.launch({ 
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });
        
        const page = await context.newPage();

        // Try multiple search engines as fallbacks
        const searchEngines = [
            {
                name: 'DuckDuckGo',
                url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
                resultSelector: 'a[data-testid="result-title-a"]',
                containerSelector: 'ol[data-testid="results"]'
            },
            {
                name: 'Bing',
                url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
                resultSelector: 'h2 a',
                containerSelector: '#b_results'
            },
            {
                name: 'Searx',
                url: (q) => `https://searx.be/search?q=${encodeURIComponent(q)}`,
                resultSelector: 'h3 a',
                containerSelector: '#results'
            }
        ];

        let links = [];
        
        for (const engine of searchEngines) {
            try {
                console.log(`Trying ${engine.name} for query: "${query}"`);
                
                await page.goto(engine.url(query), { 
                    waitUntil: 'networkidle', 
                    timeout: 30000 
                });

                // Wait a bit for JavaScript to load
                await page.waitForTimeout(3000);

                // Try to find results with multiple strategies
                let resultLinks = [];
                
                try {
                    // Strategy 1: Wait for container and then get links
                    await page.waitForSelector(engine.containerSelector, { timeout: 10000 });
                    resultLinks = await page.evaluate((selector) => {
                        const results = Array.from(document.querySelectorAll(selector));
                        return results.slice(0, 5).map(a => a.href).filter(href => 
                            href && 
                            !href.includes('duckduckgo.com') && 
                            !href.includes('bing.com') &&
                            !href.includes('searx.be') &&
                            href.startsWith('http')
                        );
                    }, engine.resultSelector);
                } catch (containerError) {
                    console.log(`Container not found for ${engine.name}, trying alternative approach...`);
                    
                    // Strategy 2: Direct link extraction without waiting for container
                    resultLinks = await page.evaluate((selector) => {
                        const results = Array.from(document.querySelectorAll(selector));
                        return results.slice(0, 5).map(a => a.href).filter(href => 
                            href && 
                            !href.includes('duckduckgo.com') && 
                            !href.includes('bing.com') &&
                            !href.includes('searx.be') &&
                            href.startsWith('http')
                        );
                    }, engine.resultSelector);
                }

                if (resultLinks.length > 0) {
                    links = resultLinks;
                    console.log(`Found ${links.length} links using ${engine.name}`);
                    break;
                }
                
            } catch (error) {
                console.warn(`${engine.name} failed: ${error.message}`);
                continue;
            }
        }

        if (links.length === 0) {
            console.warn("No search results found from any search engine");
            return [];
        }

        console.log("Found links:", links);

        // Scrape content from the found links
        const scrapedContent = [];
        for (const link of links.slice(0, 3)) { // Limit to 3 links to avoid timeout
            try {
                console.log(`Scraping: ${link}`);
                
                await page.goto(link, { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 15000 
                });
                
                // Wait a bit for dynamic content
                await page.waitForTimeout(2000);
                
                const content = await page.evaluate(() => {
                    // Remove unwanted elements
                    const elementsToRemove = document.querySelectorAll(
                        'script, style, noscript, svg, button, input, textarea, select, form, ' +
                        'header, footer, nav, aside, [role="navigation"], [role="banner"], ' +
                        '[role="contentinfo"], .advertisement, .ads, #comments, .comment'
                    );
                    elementsToRemove.forEach(el => el.remove());
                    
                    // Try to find main content areas
                    const contentSelectors = [
                        'main',
                        'article',
                        '[role="main"]',
                        '.content',
                        '.main-content',
                        '#content',
                        '.post',
                        '.entry-content'
                    ];
                    
                    let mainContent = '';
                    for (const selector of contentSelectors) {
                        const element = document.querySelector(selector);
                        if (element && element.innerText.trim().length > 100) {
                            mainContent = element.innerText.trim();
                            break;
                        }
                    }
                    
                    // Fallback to body if no main content found
                    if (!mainContent) {
                        mainContent = document.body ? document.body.innerText.trim() : '';
                    }
                    
                    // Clean up the text
                    return mainContent
                        .replace(/\s+/g, ' ')
                        .replace(/\n\s*\n/g, '\n')
                        .substring(0, 5000); // Limit content length
                });
                
                if (content && content.length > 100) {
                    scrapedContent.push(content);
                    console.log(`Successfully scraped ${content.length} characters from ${link}`);
                }
                
            } catch (error) {
                console.warn(`Could not scrape ${link}: ${error.message}`);
                continue;
            }
        }
        
        return scrapedContent.filter(Boolean);
        
    } catch (error) {
        console.error("Error during web search and scraping:", error.message);
        return [];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// --- 6. Content Summarizer (using Groq) ---
async function summarizeContent(contents) {
    if (contents.length === 0) {
        return "No content found to summarize.";
    }
    try {
        const fullText = contents.join('\n\n---\n\n').slice(0, 30000);

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that summarizes web content concisely and informatively."
                },
                {
                    role: "user",
                    content: `Summarize the following content from multiple web pages into a concise, informative overview. Focus on key information and answer potential questions related to the content.\n\nContent:\n${fullText}`
                }
            ],
            model: "deepseek-r1-distill-llama-70b",
            temperature: 0.7
        });

        return chatCompletion.choices[0]?.message?.content;
    } catch (error) {
        console.error("Error summarizing content with Groq AI:", error.message);
        return "Could not summarize content. Please try again later or refine your query.";
    }
}

// --- 7. Results Storage ---
async function storeQueryResult(query, summarizedResults) {
    const pastQueries = await loadPastQueries();
    const embedding = await getEmbedding(query);
    if (!embedding) {
        console.warn("Could not generate embedding for storage. Skipping storage.");
        return;
    }
    pastQueries.push({ query, embedding, results: summarizedResults, timestamp: new Date().toISOString() });
    await savePastQueries(pastQueries);
    console.log("Results saved for future similar queries.");
}

module.exports = {
    classifyQuery,
    findSimilarQuery,
    searchAndScrape,
    summarizeContent,
    storeQueryResult
};