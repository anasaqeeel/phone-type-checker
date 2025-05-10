import { NextResponse } from "next/server";

// Define types for API response
interface ApiResponse {
  valid: boolean;
  line_type?: string;
  international_format?: string;
  carrier?: string;
  location?: string;
  country_name?: string;
}

// Helper function to fetch with retries
const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  retries: number = 3,
  delay: number = 1000
): Promise<Response> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error (Attempt ${attempt}):`, {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        if (attempt === retries) {
          throw new Error(
            `API error: ${response.status} ${response.statusText || "Unknown"}`
          );
        }
      } else {
        return response;
      }
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      console.log(`Retrying (${attempt}/${retries}) after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries reached");
};

export async function POST(request: Request) {
  const { numbers }: { numbers: string[] } = await request.json();

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return NextResponse.json(
      { error: "Array of phone numbers is required" },
      { status: 400 }
    );
  }

  const results: any[] = [];
  for (const phoneNumber of numbers) {
    if (!phoneNumber) {
      results.push({
        number: phoneNumber,
        valid: false,
        line_type: "invalid",
        error: "Invalid number",
      });
      continue;
    }

    const url = `https://api.apilayer.com/number_verification/validate?number=${phoneNumber}`;
    const headers = { apikey: process.env.API_KEY || "" };

    try {
      const response = await fetchWithRetry(url, { headers });
      const data: ApiResponse = await response.json();
      console.log("✅ API Response for", phoneNumber, ":", data);

      results.push({
        number: data.international_format || phoneNumber,
        valid: data.valid,
        line_type: data.line_type || "unknown",
        carrier: data.carrier || "Unknown",
        location: data.location || "Unknown",
        country: data.country_name || "Unknown",
      });
    } catch (error: any) {
      console.error("❌ Server Error for", phoneNumber, ":", error.message);
      results.push({
        number: phoneNumber,
        valid: false,
        line_type: "invalid",
        error: `API connection failed: ${error.message}`,
      });
    }
  }

  return NextResponse.json({ success: true, results });
}
