export interface Env {}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json; charset=utf-8",
  };

  try {
    const body = await context.request.json<any>();

    const wordpressUrl = String(body.wordpressUrl || "").replace(/\/+$/, "");
    const username = String(body.username || "");
    const appPassword = String(body.appPassword || "");
    if (!wordpressUrl || !username || !appPassword) {
      return new Response(JSON.stringify({ success: false, error: "Missing WordPress URL/username/app password." }), {
        status: 400,
        headers,
      });
    }

    const endpoint = `${wordpressUrl}/wp-json/wp/v2/posts`;
    const auth = btoa(`${username}:${appPassword}`);

    const wpRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        title: body.title,
        content: body.content,
        excerpt: body.excerpt ?? "",
        slug: body.slug ?? undefined,
        status: body.status ?? "publish",
        categories: Array.isArray(body.categories) ? body.categories : undefined,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
      }),
    });

    const txt = await wpRes.text();
    let json: any = null;
    try { json = JSON.parse(txt); } catch { json = { raw: txt }; }

    if (!wpRes.ok) {
      return new Response(JSON.stringify({ success: false, error: json?.message || `WordPress error (${wpRes.status})`, details: json }), {
        status: 502,
        headers,
      });
    }

    return new Response(JSON.stringify({ success: true, post: json }), { status: 200, headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), { status: 500, headers });
  }
};
