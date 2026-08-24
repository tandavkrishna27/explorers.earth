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
import { APIProvider } from "@vis.gl/react-google-maps";
import {HelmetProvider} from "react-helmet-async";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "./components/theme-provider";
import { initAnalytics } from "./utils/analytics";

// setting headers for authentication
const authLink = setContext((_, { headers }) => {
  // get the authentication token from local storage if it exists
  const token = localStorage.getItem("qrtoken");
  
  // return the headers to the context so httpLink can read them
  return {
    headers: {
      ...headers,
      // Public GraphQL permissions handle anonymous requests. Sending a stale
      // fallback token turns otherwise valid public queries into HTTP 401s.
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

// create a httpLink with the help of Graphql
const httpLink = createHttpLink({
  uri: import.meta.env.VITE_API_URL,
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
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
      <ApolloProvider client={client}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Toaster />
            <App />
          </ThemeProvider>
        </QueryClientProvider>
      </ApolloProvider>
    </APIProvider>
    </HelmetProvider>
  </StrictMode>
);
