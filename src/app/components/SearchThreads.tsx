import React, { useState, forwardRef } from 'react';
import { Input, Text, Card } from '@ragenai/common-ui';

export const SearchThreads = forwardRef<HTMLDivElement>((_, ref) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    const response = await fetch(`/api/threads/search?q=${query}`);
    const data = await response.json();
    setResults(data.threads || []);
  };

  return (
    <Card
      ref={ref}
      className="h-96 p-4"
      size="lg"
      onClick={(e) => e.stopPropagation()}
    >
      <form onSubmit={handleSearch}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search threads..."
          className="mb-4 py-2"
        />
      </form>
      <div className="mt-4">
        {results.length > 0 ? (
          results.map((thread: { id: string; title: string }) => (
            <Text key={thread.id} className="mt-2">
              {thread.title}
            </Text>
          ))
        ) : (
          <Text>No results found</Text>
        )}
      </div>
    </Card>
  );
});

SearchThreads.displayName = 'SearchThreads';
