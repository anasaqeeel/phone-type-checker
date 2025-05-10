import { NextResponse } from "next/server";

// Helper function to fetch with retries
const fetchWithRetry = async (url, options, retries = 3, delay = 1000) => {
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
                    throw new Error(`API error: ${response.status} ${response.statusText || "Unknown"}`);
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
};

export async function POST(request) {
    const { numbers } = await request.json();

    if (!Array.isArray(numbers) || numbers.length === 0) {
        return NextResponse.json({ error: "Array of phone numbers is required" }, { status: 400 });
    }

    const results = [];
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
        const headers = { apikey: process.env.API_KEY };

        try {
            const response = await fetchWithRetry(url, { headers });
            const data = await response.json();
            console.log("✅ API Response for", phoneNumber, ":", data);

            results.push({
                number: data.international_format || phoneNumber,
                valid: data.valid,
                line_type: data.line_type || "unknown",
                carrier: data.carrier || "Unknown",
                location: data.location || "Unknown",
                country: data.country_name || "Unknown",
            });
        } catch (error) {
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