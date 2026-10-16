import { isCanonicalRuntime } from "./lib/publicRuntimeConfig";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  createHttpLink,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { typePolicies } from "./lib/apolloCache";
import { Toaster } from "sonner";
import {HelmetProvider} from "react-helmet-async";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "./components/theme-provider";
import { initAnalytics } from "./utils/analytics";

// Retained Strapi GraphQL calls are public or gated by their own legacy adapter.
// A canonical Better Auth cookie or persisted JWT is never forwarded here.
const authLink = setContext((_, { headers }) => {
  const { authorization: _authorization, Authorization: _Authorization,
    "x-account-id": _accountId, "x-user-id": _userId, ...safeHeaders } = headers ?? {};
  return {
    headers: safeHeaders,
  };
});

// create a httpLink with the help of Graphql
const httpLink = createHttpLink({
  uri: isCanonicalRuntime() ? "/graphql" : import.meta.env.VITE_API_URL,
  credentials: "omit",
});

// initalising the apollo client
const client = new ApolloClient({
  // link should be with the headers it it exist
  link: authLink.concat(httpLink),
  // current cache — typePolicies key Strapi entities by documentId so publish
  // mutations patch the rendered list entity (fixes the stale "Draft" label)
  cache: new InMemoryCache({ typePolicies }),
});

initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <ApolloProvider client={client}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Toaster />
            <App />
          </ThemeProvider>
        </QueryClientProvider>
      </ApolloProvider>
    </HelmetProvider>
  </StrictMode>
);
