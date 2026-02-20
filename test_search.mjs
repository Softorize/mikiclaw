import { webSearch } from "./dist/agent/web_search.js";

console.log("Testing web search...");
const result = await webSearch("test search");
console.log(result);
