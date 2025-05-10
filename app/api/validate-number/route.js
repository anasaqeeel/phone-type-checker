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

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const phoneNumber = searchParams.get("number");

    if (!phoneNumber) {
        return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const url = `https://api.apilayer.com/number_verification/validate?number=${phoneNumber}`;
    const headers = { apikey: process.env.API_KEY };

    try {
        const response = await fetchWithRetry(url, { headers });
        const data = await response.json();
        console.log("✅ API Response:", data);

        return NextResponse.json({
            success: true,
            valid: data.valid,
            line_type: data.line_type || "unknown",
            number: data.international_format || phoneNumber,
            carrier: data.carrier || "Unknown",
            location: data.location || "Unknown",
            country: data.country_name || "Unknown",
        });
    } catch (error) {
        console.error("❌ Server Error:", error.message);
        return NextResponse.json(
            { error: `Failed to validate number: ${error.message}` },
            { status: 500 }
        );
    }
}