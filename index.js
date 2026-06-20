import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import readline from "readline";
import fs from "fs";
import axios from "axios";

dotenv.config();

// -------------------- GEMINI --------------------

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// -------------------- MEMORY --------------------

let chatHistory = [];

// -------------------- TOOLS --------------------

async function getWeatherDetails(city) {
  try {
    const response = await axios.get(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`
    );

    const weather = response.data.current_condition[0];

    return {
      city,
      temperature: weather.temp_C + "°C",
      feelsLike: weather.FeelsLikeC + "°C",
      condition: weather.weatherDesc[0].value,
      humidity: weather.humidity + "%",
      windSpeed: weather.windspeedKmph + " km/h",
    };
  } catch (error) {
    return {
      error: "Unable to fetch weather data",
    };
  }
}

function getCurrentTime() {
  return new Date().toLocaleString();
}

function calculate(expression) {
  try {
    const result = Function(
      `"use strict"; return (${expression})`
    )();

    return String(result);
  } catch {
    return "Invalid expression";
  }
}

function readFile(path) {
  try {
    return fs.readFileSync(path, "utf8");
  } catch (error) {
    return `Cannot read file: ${error.message}`;
  }
}

// -------------------- TOOL DEFINITIONS --------------------

const tools = [
  {
    functionDeclarations: [
      {
        name: "getWeatherDetails",
        description:
          "Get current weather information for a city",
        parameters: {
          type: "OBJECT",
          properties: {
            city: {
              type: "STRING",
              description: "City name",
            },
          },
          required: ["city"],
        },
      },
      {
        name: "getCurrentTime",
        description: "Get current local date and time",
      },
      {
        name: "calculate",
        description: "Evaluate a mathematical expression",
        parameters: {
          type: "OBJECT",
          properties: {
            expression: {
              type: "STRING",
              description: "Math expression",
            },
          },
          required: ["expression"],
        },
      },
      {
        name: "readFile",
        description:
          "Read the content of a text file from disk",
        parameters: {
          type: "OBJECT",
          properties: {
            path: {
              type: "STRING",
              description: "Full file path",
            },
          },
          required: ["path"],
        },
      },
    ],
  },
];

// -------------------- AGENT --------------------

async function runAgent(userInput) {
  chatHistory.push({
    role: "user",
    parts: [{ text: userInput }],
  });

  let messages = [...chatHistory];

  while (true) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: messages,

      config: {
        tools,

        systemInstruction: `
You are a helpful AI Agent.

Rules:
1. Use tools whenever needed.
2. You may call multiple tools.
3. After receiving tool results, provide a final answer.
4. Be concise and helpful.
5. Never expose internal reasoning.
`,
      },
    });

    const parts =
      response.candidates?.[0]?.content?.parts || [];

    let toolUsed = false;

    for (const part of parts) {
      if (!part.functionCall) continue;

      toolUsed = true;

      const functionName = part.functionCall.name;
      const args = part.functionCall.args || {};

      let result;

      switch (functionName) {
        case "getWeatherDetails":
          result = await getWeatherDetails(args.city);
          break;

        case "getCurrentTime":
          result = getCurrentTime();
          break;

        case "calculate":
          result = calculate(args.expression);
          break;

        case "readFile":
          result = readFile(args.path);
          break;

        default:
          result = "Unknown tool";
      }

      console.log(`\n🔧 Tool: ${functionName}`);

      messages.push({
        role: "model",
        parts: [
          {
            functionCall: {
              name: functionName,
              args,
            },
          },
        ],
      });

      messages.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: functionName,
              response: {
                result,
              },
            },
          },
        ],
      });
    }

    if (!toolUsed) {
      const finalAnswer = response.text;

      console.log("\n🤖 " + finalAnswer);

      chatHistory.push({
        role: "model",
        parts: [{ text: finalAnswer }],
      });

      break;
    }
  }
}

// -------------------- CHATBOT --------------------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("\n🤖 Gemini AI Agent Started");
console.log("Type 'exit' to quit.\n");

function chatLoop() {
  rl.question("You: ", async (input) => {
    if (input.trim().toLowerCase() === "exit") {
      console.log("\n👋 Goodbye!");
      rl.close();
      return;
    }

    try {
      await runAgent(input);
    } catch (error) {
      console.error("\n❌ Error:", error.message);
    }

    chatLoop();
  });
}

chatLoop();