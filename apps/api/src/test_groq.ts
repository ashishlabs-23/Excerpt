import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function test() {
  console.log("Testing text completion...");
  try {
    const comp = await groq.chat.completions.create({
      messages: [{ role: "user", content: "Reply EXACTLY with the word: hello" }],
      // Use the model we specified in aiService
      model: "llama3-70b-8192",
    });
    console.log("Text success:", comp.choices[0]?.message?.content);
  } catch (e: any) {
    console.error("Text error:", e.message);
  }
}
test();
