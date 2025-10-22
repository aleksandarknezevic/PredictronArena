import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';

// Default to local Envio HyperIndex GraphQL endpoint
// Vite uses import.meta.env instead of process.env
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080/v1/graphql';

const httpLink = createHttpLink({
  uri: BACKEND_URL,
});

export const apolloClient = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all',
      fetchPolicy: 'cache-and-network',
    },
    query: {
      errorPolicy: 'all',
      fetchPolicy: 'cache-first',
    },
  },
});

export default apolloClient;
