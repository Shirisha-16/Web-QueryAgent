import React, { useState } from 'react';
import './QueryAgent.css';

function QueryAgent() {
    const [query, setQuery] = useState('');
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resultSource, setResultSource] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setResult('');
        setError('');
        setResultSource('');

        try {
            const response = await fetch('http://localhost:5000/api/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Something went wrong on the server.');
            }

            const data = await response.json();
            setResult(data.result);
            setResultSource(data.source);
            setQuery('');

        } catch (err) {
            console.error("Error fetching query result:", err);
            setError(err.message || "Failed to fetch results. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="query-agent-container">
            <form onSubmit={handleSubmit} className="query-form">
                <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter your query here..."
                    rows="4"
                    disabled={loading}
                    required
                />
                <button type="submit" disabled={loading}>
                    {loading ? 'Searching...' : 'Ask Agent'}
                </button>
            </form>

            {loading && <p className="loading-message">Thinking...</p>}
            {error && <p className="error-message">Error: {error}</p>}

            {result && (
                <div className="result-display">
                    <h2>Result</h2>
                    {resultSource && <p className="source-info">Source: {resultSource === 'cache' ? 'Past Query' : 'New Web Search'}</p>}
                    <pre>{result}</pre>
                </div>
            )}
        </div>
    );
}

export default QueryAgent;