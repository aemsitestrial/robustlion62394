# AI Search Block

The AI Search block provides a centered search experience with a configurable title, placeholder, endpoint, and optional voice input.

## Configuration

- **Title**: Heading displayed above the search field.
- **Placeholder**: Search input placeholder and accessible label.
- **Search Endpoint**: Relative or absolute URL that receives the query as the `q` parameter.
- **Enable Voice Search**: Enables the microphone control when browser speech recognition is available.

## Behavior

The decorator converts authored rows into a semantic search form. Submitting a non-empty query navigates to the configured endpoint with a URL-encoded `q` parameter. Voice search uses the browser Web Speech API when available and hides the microphone control when it is unsupported.

## Files

- `_ai-search.json`: Crosswalk definition, model, and filter metadata.
- `ai-search.js`: DOM transformation and form behavior.
- `ai-search.css`: Scoped responsive styling.
