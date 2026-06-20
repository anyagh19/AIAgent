// news.tool.js
export async function getNews(topic = "technology", country = "us", apiKey) {
  if (!apiKey) {
    return { content: [{ type: "text", text: "NewsAPI key missing. Get one at newsapi.org" }], isError: true };
  }
  try {
    const url = `https://newsapi.org/v2/top-headlines?country=${country}&category=${topic}&apiKey=${apiKey}&pageSize=5`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.message);
    const articles = data.articles;
    if (!articles.length) return { content: [{ type: "text", text: "No news found." }] };
    const output = articles.map((a, i) => `${i+1}. ${a.title}\n   ${a.source.name} - ${a.description || ''}\n   ${a.url}`).join('\n\n');
    return { content: [{ type: "text", text: output }] };
  } catch (err) {
    return { content: [{ type: "text", text: `News error: ${err.message}` }], isError: true };
  }
}