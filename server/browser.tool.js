import puppeteer from "puppeteer";

export async function browserSearch(query) {
  try {
    const browser = await puppeteer.launch({
      headless: true, // change to false if you want visible browser
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    // Use DuckDuckGo (less bot detection than Google)
    await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
      waitUntil: "networkidle2",
    });

    await page.waitForSelector("a[data-testid='result-title-a']");

    const results = await page.evaluate(() => {
      const data = [];
      const elements = document.querySelectorAll(
        "a[data-testid='result-title-a']"
      );

      elements.forEach((el, index) => {
        if (index < 5) {
          data.push({
            title: el.innerText,
            link: el.href,
          });
        }
      });

      return data;
    });

    await browser.close();

    return {
      success: true,
      results,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
