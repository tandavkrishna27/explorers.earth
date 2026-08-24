import type { Express } from "express";
import type { Server } from "http";
import type { IStorage } from "../storage";
import { setupSwagger } from "../swagger";
import { setupUserRoutes } from "../user-routes";
import { setupPaymentRoutes } from "./paymentRoutes";
import { setupSubscriptionRoutes } from "./subscriptionRoutes";
import { setupGeminiRoutes } from "./geminiRoutes";
import { setupInstagramRoutes } from "./instagramRoutes";
import { setupGoogleOAuthRoutes } from "../google-oauth-routes";
import { setupAuthBridgeRoutes } from "../auth-bridge-routes";
import { setupSeoRoutes } from "../seo-routes";
import { setupAuthRoutes } from "./authRoutes";
import { setupPlaylistRoutes } from "./playlistRoutes";
import { setupAdminRoutes } from "./adminRoutes";
import { setupStrapiRoutes } from "./strapiRoutes";
import { setupYoutubeRoutes } from "./youtubeRoutes";
import { setupEmailRoutes } from "./emailRoutes";
import { setupPageRoutes } from "./pageRoutes";
import { setupReactivationRoutes } from "./reactivationRoutes";
import scrapeRoutes from "./scrapeRoutes";
import { setupExplorersAnalyticsRoutes } from "./explorersAnalyticsRoutes";
import { createExplorersAnalyticsDependencies } from "../services/explorers-analytics-composition";

export function registerRoutes(app: Express, _storage: IStorage): Server {
  setupSwagger(app);

  setupAuthRoutes(app);
  const server = setupPlaylistRoutes(app);
  setupAdminRoutes(app);
  setupStrapiRoutes(app);
  setupYoutubeRoutes(app);
  setupEmailRoutes(app);
  setupPageRoutes(app);
  setupReactivationRoutes(app);
  setupExplorersAnalyticsRoutes(app, createExplorersAnalyticsDependencies());

  setupUserRoutes(app);
  setupPaymentRoutes(app);
  setupSubscriptionRoutes(app);
  setupGeminiRoutes(app);
  setupInstagramRoutes(app);
  setupGoogleOAuthRoutes(app);
  setupAuthBridgeRoutes(app);
  setupSeoRoutes(app);

  // Scraper Routes
  app.use("/api", scrapeRoutes);

  // iTunes Search Proxy
  app.get("/itunes-api/search", async (req, res) => {
    try {
      const { term, entity, limit, media } = req.query;
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(String(term || ""))}&entity=${entity || "software"}&limit=${limit || 12}&media=${media || "software"}`;
      
      const response = await fetch(url);
      const data = await response.json();

      const affiliateToken = process.env.APPLE_AFFILIATE_TOKEN;
      if (affiliateToken && data.results) {
        data.results = data.results.map((item: any) => {
          if (item.trackViewUrl) {
            try {
              const u = new URL(item.trackViewUrl);
              u.searchParams.set("at", affiliateToken);
              item.trackViewUrl = u.toString();
            } catch {
              // ignore url parsing failures
            }
          }
          return item;
        });
      }

      res.json(data);
    } catch (error) {
      console.error("iTunes proxy search failed:", error);
      res.status(500).json({ error: "iTunes search proxy failed" });
    }
  });
  
  // GraphQL Proxy for Strapi
  app.post("/graphql", async (req, res) => {
    try {
      const strapiUrl = process.env.STRAPI_URL;
      const strapiToken = process.env.STRAPI_ACCESS_TOKEN;
      
      if (!strapiUrl) {
        return res.status(500).json({ error: "STRAPI_URL not configured" });
      }

      const authHeader = req.headers.authorization;
      const isAuthOperation = req.body?.query?.includes("login") || req.body?.query?.includes("register");
      
      const finalToken = isAuthOperation 
        ? undefined 
        : (authHeader || (strapiToken ? `Bearer ${strapiToken}` : undefined));
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      if (finalToken) {
        headers["Authorization"] = finalToken;
      }

      const response = await fetch(`${strapiUrl}/graphql`, {
        method: "POST",
        headers,
        body: JSON.stringify(req.body),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("❌ GraphQL Proxy Error:", error);
      res.status(500).json({ 
        error: "GraphQL Proxy Error", 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  return server;
}
