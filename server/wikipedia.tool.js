// wikipedia.tool.js
export async function wikipediaLookup(term) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Page not found for "${term}"`);
    const data = await res.json();
    const extract = data.extract || "No summary available.";
    const text = `${data.title}\n\n${extract}\n\nRead more: ${data.content_urls?.desktop?.page || ''}`;
    return { content: [{ type: "text", text }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Wikipedia error: ${err.message}` }], isError: true };
  }
}