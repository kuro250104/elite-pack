import { apiDocsEnabled } from "@/server/api-docs/openapi";

// Swagger UI, pinned version loaded from jsDelivr: no runtime dependency is added to the application.
const swaggerUi = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14";

const page = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Documentation de l’API | Elite Pack</title>
  <link rel="stylesheet" href="${swaggerUi}/swagger-ui.css">
  <style>body{margin:0;background:#fafafa}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${swaggerUi}/swagger-ui-bundle.js" crossorigin="anonymous"></script>
  <script>
    window.ui = SwaggerUIBundle({ url: "/api/openapi", dom_id: "#swagger-ui", deepLinking: true, withCredentials: true,
      docExpansion: "list", defaultModelsExpandDepth: 0, tryItOutEnabled: false });
  </script>
</body>
</html>`;

export function GET() {
  if (!apiDocsEnabled()) return new Response("Page introuvable.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
