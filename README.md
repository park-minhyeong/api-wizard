# API Wizard 🧙‍♂️

A powerful TypeScript wrapper for native Fetch API that provides enhanced features including token management, interceptors, and type-safe HTTP requests. Perfect for both client-side and server-side applications.

## Features

- 🔒 **Built-in token management** - Automatic access & refresh token handling
- 🎯 **Type-safe HTTP requests** - Full TypeScript support with generics
- 🔄 **Automatic token refresh** - Seamless token renewal with request queuing
- 🎨 **Customizable interceptors** - Request/response/error interceptors
- 🛠 **Flexible configuration** - Per-API and global configuration options
- 📝 **Content-type management** - Support for JSON, form-data, and more
- 🌐 **Native Fetch API** - Smaller bundle size, no external dependencies
- ⚡ **Zero dependencies** - Lightweight and fast
- 🚀 **Axios-compatible** - Easy migration from Axios
- 🍪 **Cookie support** - Built-in cookie management utilities
- 🔧 **Server-side ready** - Works in Node.js environments
- 🧹 **Smart parameter filtering** - Automatic removal of undefined/null/empty values
- 🎭 **Intelligent error handling** - 400-level errors return as responses, 500-level errors throw
- 📦 **ES Modules support** - Full compatibility with Vite, Node.js, and modern bundlers

## Installation

```bash
npm install api-wizard
# or
yarn add api-wizard
```

## Quick Start

### Basic Usage

```typescript
import { handler } from 'api-wizard';

// Define API endpoints configuration
const apiConfig = {
  users: 'https://api.users.com',
  products: 'https://api.products.com'
};

// Create API handlers
const api = handler(apiConfig);

// Make type-safe requests
interface User {
  id: number;
  name: string;
  email: string;
}

// GET request with version
const userApi = api.users({ version: 'v1' }); // https://api.users.com/v1

const getUser = async (id: number) => {
  const response = await userApi.get<User>(`/users/${id}`);
  return response.data;
};

// POST request with type-safe request body
interface CreateUserRequest {
  name: string;
  email: string;
}

const createUser = async (userData: CreateUserRequest) => {
  const response = await userApi.post<CreateUserRequest, User>('/users', userData);
  return response.data;
};
```

### Direct Instance Usage

```typescript
import instance from 'api-wizard';

// Create a direct instance
const api = instance('https://api.example.com', {
  version: 'v1',
  contentType: 'application/json'
});

// Use directly
const response = await api.get<User[]>('/users');
const newUser = await api.post<CreateUserRequest, User>('/users', userData);
```

## Advanced Configuration

### Token Management

```typescript
const userApi = api.users({
  version: 'v1',
  interceptor: {
    tokenConfig: {
      // Token storage configuration
      getToken: () => localStorage.getItem('access_token'),
      setToken: (token) => localStorage.setItem('access_token', token),
      removeToken: () => localStorage.removeItem('access_token'),
      
      // Refresh token configuration
      getRefreshToken: () => localStorage.getItem('refresh_token'),
      setRefreshToken: (token) => localStorage.setItem('refresh_token', token),
      removeRefreshToken: () => localStorage.removeItem('refresh_token'),
      
      // Endpoints
      refreshEndpoint: '/auth/refresh',
      
      // Optional: Custom header format
      formatAuthHeader: (token) => ({
        'Authorization': `Custom ${token}`
      }),
      
      // Optional: Token expiry callback
      onTokenExpired: () => {
        // Handle token expiration (e.g., redirect to login)
      }
    }
  }
});
```

### Custom Interceptors

```typescript
const userApi = api.users({
  version: 'v1',
  interceptor: {
    onRequest: (config) => {
      // Modify request config
      config.headers['Custom-Header'] = 'value';
      return config;
    },
    onResponse: (response) => {
      // Transform response data
      response.data = response.data.result;
      return response;
    },
    onError: async (error) => {
      // Custom error handling
      if (error.response?.status === 404) {
        // Handle 404 error
      }
      return Promise.reject(error);
    }
  }
});
```

### API Versioning & Content Type

```typescript
const userApi = api.users({
  // API version will be added to base URL
  version: 'v1',
  // Content type configuration
  contentType: 'application/json',
  charset: 'UTF-8',
  accept: 'application/json',
  
  // Credentials
  withCredentials: true  // default: true
});

// Results in: https://api.example.com/v1
// Headers: 
// Content-Type: application/json; charset=UTF-8
// Accept: application/json
// Credentials: include
```

## Type Definitions

### Option Interface

```typescript
interface Option {
  version?: string;
  contentType?: DataType;
  accept?: DataType;
  charset?: string;
  interceptor?: Interceptor;
  withCredentials?: boolean;
  requestConfig?: FetchRequestConfig;
}
```

### TokenConfig Interface

```typescript
interface TokenConfig {
  accessTokenKey?: string;
  refreshTokenKey?: string;
  refreshEndpoint?: string;
  getToken?: () => string | undefined;
  setToken?: (token: string) => void;
  removeToken?: () => void;
  getRefreshToken?: () => string | undefined;
  setRefreshToken?: (token: string) => void;
  removeRefreshToken?: () => void;
  onTokenExpired?: () => void;
  formatAuthHeader?: (token: string, refreshToken?: string) => Record<string, string>;
}
```

### DataType Options

```typescript
type DataType =
  | "application/json"
  | "application/x-www-form-urlencoded"
  | "application/xml"
  | "application/octet-stream"
  | "multipart/form-data"
  | "text/plain"
  | "text/html";
```

## Smart Parameter Filtering

API Wizard automatically filters out undefined, null, and empty string values from query parameters:

```typescript
// Before: ?page=undefined&limit=10&search=
// After: ?limit=10
const response = await api.get('/users', {
  params: {
    page: undefined,    // Automatically removed
    limit: 10,         // Kept and converted to string
    search: '',        // Automatically removed
    status: null       // Automatically removed
  }
});
```

## Intelligent Error Handling

API Wizard provides intelligent error handling that distinguishes between client and server errors:

```typescript
// 400-level errors (client errors) are returned as normal responses
const response = await api.get('/users/999');
if (!response.ok) {
  console.log('Client error:', response.status); // 404
  console.log('Error data:', response.data);     // Error details
}

// 500-level errors (server errors) throw exceptions
try {
  const response = await api.get('/server-error');
} catch (error) {
  console.error('Server error:', error.message);
  // Handle server error
}
```

## Key Features

### Automatic Token Refresh

API Wizard automatically handles token refresh when tokens expire:

- Detects 401 responses
- Automatically calls refresh endpoint
- Retries original request with new token
- Handles concurrent requests during refresh

### Type Safety

Full TypeScript support with generic types:

```typescript
// Request and response types are fully typed
const response = await api.post<CreateUserRequest, User>('/users', userData);
// response.data is typed as User
```

### Flexible Configuration

Configure different options for different APIs:

```typescript
const api = handler({
  users: 'https://api.users.com',
  payments: 'https://api.payments.com'
}, {
  // Global configuration for all APIs
  withCredentials: true,
  contentType: 'application/json'
});

// API-specific configuration
const usersApi = api.users({ 
  version: 'v1',
  interceptor: { /* user-specific interceptors */ } 
});
const paymentsApi = api.payments({ 
  version: 'v2',
  contentType: 'application/xml' 
});
```

## API Methods

All standard HTTP methods are supported with full TypeScript support:

```typescript
const api = instance('https://api.example.com', { version: 'v1' });

// GET - Retrieve data
const users = await api.get<User[]>('/users');
const user = await api.get<User>(`/users/${id}`);

// POST - Create new resource
const newUser = await api.post<CreateUserRequest, User>('/users', userData);

// PUT - Update entire resource
const updatedUser = await api.put<UpdateUserRequest, User>(`/users/${id}`, userData);

// PATCH - Partial update
const patchedUser = await api.patch<Partial<User>, User>(`/users/${id}`, partialData);

// DELETE - Remove resource
await api.delete(`/users/${id}`);

// Request with custom config
const response = await api.get<User[]>('/users', {
  params: { page: '1', limit: '10' },
  timeout: 5000,
  headers: { 'Custom-Header': 'value' }
});
```

### Request Configuration

```typescript
interface FetchRequestConfig extends RequestInit {
  params?: Record<string, string>;  // Query parameters
  timeout?: number;                 // Request timeout in ms
  baseURL?: string;                 // Override base URL
}
```

## Cookie Management

API Wizard includes built-in cookie utilities for both client-side and server-side applications:

### Browser Environment

```typescript
import { getCookies } from 'api-wizard';

// Automatically reads from document.cookie
const cookies = getCookies();
console.log(cookies); // "sessionId=abc123; userId=456; theme=dark"
```

### Server-Side Environment (Node.js/Express)

```typescript
import { getCookies, CookieConfig } from 'api-wizard';

// Set cookies for server-side usage
new CookieConfig('sessionId=abc123; userId=456; theme=dark');

// Get cookies (returns the configured cookies)
const cookies = getCookies();
console.log(cookies); // "sessionId=abc123; userId=456; theme=dark"
```

### Advanced Cookie Usage

#### Express Server Integration

```typescript
import { getCookies, CookieConfig } from 'api-wizard';
import { handler } from 'api-wizard';
import express from 'express';

const app = express();

// API configuration
const apiConfig = {
  sso: 'https://api.sso.com',
  users: 'https://api.users.com'
};

const api = handler(apiConfig);

// Express route with cookie forwarding
app.get('/api/sso/sign', async (req, res) => {
  try {
    // 클라이언트의 쿠키를 전역으로 설정
    new CookieConfig(req.headers.cookie || '');
    
    if (req.headers.cookie) {
      console.log('Received cookies:', req.headers.cookie);
    }
    
    // API 호출 (쿠키가 자동으로 포함됨)
    const response = await ssoApi.sign.get();
    
    if (response.status > 299) {
      return res.status(401).json("Unauthorized");
    }
    
    res.json(response);
  } catch (error) {
    console.error('SSO Sign API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sign data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });   
  }
});
```

#### Service Layer with Cookie Interceptor

```typescript
// services/ssoService.ts
import { getCookies, CookieConfig } from 'api-wizard';
import { handler } from 'api-wizard';

const apiConfig = {
  sso: 'https://api.sso.com'
};

const api = handler(apiConfig);

interface SignApi {
  userId: string;
  userName: string;
  isAuthenticated: boolean;
  permissions: string[];
}

// SSO API 서비스
export const ssoApi = {
  sign: {
    async get(): Promise<FetchResponse<SignApi>> {
      const api = api.sso({ 
        version: "v3", 
        interceptor: {
          onRequest: (config) => {
            const cookies = getCookies();
            if (cookies) {
              config.headers = {
                ...config.headers,
                'Cookie': cookies
              };
            }
            return config;
          }
        }
      });
      
      return await api.get<SignApi>("/sign");
    }
  }
};
```

#### Middleware for Global Cookie Configuration

```typescript
// middleware/cookieMiddleware.ts
import { CookieConfig } from 'api-wizard';

export const cookieMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // 모든 요청에서 쿠키를 전역으로 설정
  if (req.headers.cookie) {
    new CookieConfig(req.headers.cookie);
    console.log('Cookies configured:', req.headers.cookie);
  }
  next();
};

// app.ts
app.use(cookieMiddleware);
```

### Cookie Parsing Utilities

```typescript
// Parse cookies into an object
function parseCookies(cookieString: string): Record<string, string> {
  return cookieString
    .split(';')
    .reduce((cookies, cookie) => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = value;
      return cookies;
    }, {} as Record<string, string>);
}

// Usage example
const cookieString = "sessionId=abc123; userId=456; theme=dark";
const cookieObj = parseCookies(cookieString);
console.log(cookieObj.sessionId); // "abc123"
console.log(cookieObj.userId);    // "456"
```

## Content-Type Based Body Handling

API Wizard automatically handles request bodies based on Content-Type headers:

   ```typescript
// JSON body (default)
const response = await api.post('/users', userData);
// Body: JSON.stringify(userData)

// Form URL-encoded body
const response = await api.post('/login', formData, {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});
// Body: URLSearchParams(formData).toString()

// Custom body handling
const response = await api.post('/upload', fileData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
// Body: FormData object
```

## Performance Benefits

- **Zero Dependencies**: No external libraries required
- **Small Bundle Size**: Lightweight implementation (~15KB minified)
- **Native Fetch**: Uses browser's native HTTP client
- **Tree Shaking**: Only import what you need
- **Modern JavaScript**: Built for modern browsers and Node.js
- **TypeScript First**: Built with TypeScript from the ground up
- **ES Modules**: Full ESM support for modern bundlers
- **Universal Compatibility**: Works seamlessly in Vite, Webpack, Node.js, and Express

## Migration from Axios

API Wizard is designed to be a drop-in replacement for Axios with minimal changes:

```typescript
// Before (Axios)
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token' }
});

const response = await api.get('/users');

// After (API Wizard)
import instance from 'api-wizard';

const api = instance('https://api.example.com', {
  interceptor: {
    tokenConfig: {
      getToken: () => 'token',
      formatAuthHeader: (token) => ({ 'Authorization': `Bearer ${token}` })
    }
  }
});

const response = await api.get('/users');
```

## Real-world Example

Here's a complete example showing how to use API Wizard in a React application:

```typescript
// api.ts
import { handler } from 'api-wizard';

const apiConfig = {
  users: 'https://api.users.com',
  products: 'https://api.products.com'
};

export const api = handler(apiConfig);

// services/userService.ts
import { api } from '../api';

export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
}

export const userService = {
  getUsers: () => api.users({ version: 'v1' }).get<User[]>('/users'),
  getUser: (id: number) => api.users({ version: 'v1' }).get<User>(`/users/${id}`),
  createUser: (user: CreateUserRequest) => 
    api.users({ version: 'v1' }).post<CreateUserRequest, User>('/users', user),
  updateUser: (id: number, user: User) => 
    api.users({ version: 'v1' }).put<User, User>(`/users/${id}`, user),
  deleteUser: (id: number) => 
    api.users({ version: 'v1' }).delete(`/users/${id}`)
};
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT © [Min-Hyeong Park](https://github.com/park-minhyeong)