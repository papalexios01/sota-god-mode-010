import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NEURON_API_BASE = "https://app.neuronwriter.com/neuron-api/0.5/writer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProxyRequest {
  endpoint: string;
  method?: string;
  apiKey: string;
  body?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    let payload: ProxyRequest;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(
        { success: false, error: "Invalid JSON body" },
        400
      );
    }

    const { endpoint, method = "POST", apiKey, body: requestBody } = payload;

    if (!endpoint) {
      return jsonResponse(
        { success: false, error: "Missing endpoint parameter" },
        400
      );
    }

    if (!apiKey || apiKey.trim().length < 5) {
      return jsonResponse(
        { success: false, error: "Missing or invalid API key" },
        400
      );
    }

    const cleanApiKey = apiKey.trim();
    const url = `${NEURON_API_BASE}${endpoint}`;

    let timeoutMs = 30000;
    if (endpoint === "/new-query") timeoutMs = 60000;
    else if (endpoint === "/get-query") timeoutMs = 30000;
    else if (endpoint === "/list-projects" || endpoint === "/list-queries")
      timeoutMs = 20000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "X-API-KEY": cleanApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    };

    if (requestBody && (method === "POST" || method === "PUT")) {
      fetchOptions.body = JSON.stringify(requestBody);
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    const responseText = await response.text();
    let responseData: unknown;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText.substring(0, 500) };
    }

    return jsonResponse({
      success: response.ok,
      status: response.status,
      data: responseData,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isTimeout =
      message.includes("abort") || message.includes("timeout");

    return jsonResponse({
      success: false,
      status: isTimeout ? 408 : 500,
      error: isTimeout
        ? "Request timed out. The NeuronWriter API may be slow - try again."
        : message,
      type: isTimeout ? "timeout" : "network_error",
    });
  }
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
