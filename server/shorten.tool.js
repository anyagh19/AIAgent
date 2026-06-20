// shorten.tool.js
export async function shortenUrl(longUrl) {
  try {
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
    const shortUrl = await res.text();
    if (!res.ok || !shortUrl.startsWith('http')) throw new Error('Invalid response');
    return { content: [{ type: "text", text: `🔗 Shortened URL: ${shortUrl}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `URL shortening failed: ${err.message}` }], isError: true };
  }
}