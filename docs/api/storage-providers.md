---
title: Storage Providers
description: Token storage interfaces and implementations for persisting OAuth tokens, client credentials, and session state.
---

# Storage Providers

Storage providers in OAuth Callback manage the persistence of OAuth tokens, client credentials, and session state. The library provides flexible storage interfaces with built-in implementations for both ephemeral and persistent storage, plus the ability to create custom storage backends.

## Storage Interfaces

OAuth Callback defines two storage interfaces for different levels of OAuth state management:

### TokenStore Interface

The basic `TokenStore` interface handles OAuth token persistence:

```typescript
interface TokenStore {
  get(key: string): Promise<Tokens | null>;
  set(key: string, tokens: Tokens): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

#### Tokens Type

```typescript
interface Tokens {
  accessToken: string; // OAuth access token
  refreshToken?: string; // Optional refresh token
  expiresAt?: number; // Absolute expiry time (Unix ms)
  scope?: string; // Space-delimited granted scopes
}
```

### OAuthStore Interface

The extended `OAuthStore` interface adds support for Dynamic Client Registration and session state:

```typescript
interface OAuthStore extends TokenStore {
  getClient(key: string): Promise<ClientInfo | null>;
  setClient(key: string, client: ClientInfo): Promise<void>;
  getSession(key: string): Promise<OAuthSession | null>;
  setSession(key: string, session: OAuthSession): Promise<void>;
}
```

#### ClientInfo Type

```typescript
interface ClientInfo {
  clientId: string; // OAuth client ID
  clientSecret?: string; // OAuth client secret
  clientIdIssuedAt?: number; // When client was registered
  clientSecretExpiresAt?: number; // When secret expires
}
```

#### OAuthSession Type

```typescript
interface OAuthSession {
  codeVerifier?: string; // PKCE code verifier
  state?: string; // OAuth state parameter
}
```

## Built-in Storage Providers

### inMemoryStore()

Ephemeral storage that keeps tokens in memory. Tokens are lost when the process exits.

```typescript
function inMemoryStore(): TokenStore;
```

#### Usage

```typescript
import { browserAuth, inMemoryStore } from "oauth-callback/mcp";

const authProvider = browserAuth({
  store: inMemoryStore(),
});
```

#### Characteristics

| Feature         | Description                                |
| --------------- | ------------------------------------------ |
| **Persistence** | None - data lost on process exit           |
| **Concurrency** | Thread-safe within process                 |
| **Security**    | Maximum - no disk persistence              |
| **Performance** | Fastest - no I/O operations                |
| **Use Cases**   | Development, testing, short-lived sessions |

#### Implementation Details

```typescript
// Internal implementation uses a Map
const store = new Map<string, Tokens>();

// All operations are synchronous but return Promises
// for interface consistency
```

### fileStore()

Persistent storage that saves tokens to a JSON file on disk.

```typescript
function fileStore(filepath?: string): TokenStore;
```

#### Parameters

| Parameter  | Type     | Default              | Description                        |
| ---------- | -------- | -------------------- | ---------------------------------- |
| `filepath` | `string` | `~/.mcp/tokens.json` | Custom file path for token storage |

#### Usage

```typescript
import { browserAuth, fileStore } from "oauth-callback/mcp";

// Use default location (~/.mcp/tokens.json)
const authProvider = browserAuth({
  store: fileStore(),
});

// Use custom location
const customAuth = browserAuth({
  store: fileStore("/path/to/my-tokens.json"),
});

// Environment-specific storage
const envAuth = browserAuth({
  store: fileStore(`~/.myapp/${process.env.NODE_ENV}-tokens.json`),
});
```

#### Characteristics

| Feature         | Description                         |
| --------------- | ----------------------------------- |
| **Persistence** | Survives process restarts           |
| **Concurrency** | ⚠️ Not safe across processes        |
| **Security**    | File permissions (mode 0600)        |
| **Performance** | File I/O on each operation          |
| **Use Cases**   | Desktop apps, long-running services |

#### File Format

The file store saves tokens in JSON format:

```json
{
  "mcp-tokens": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "refresh_token_here",
    "expiresAt": 1735689600000,
    "scope": "read write"
  },
  "app-specific-key": {
    "accessToken": "another_token",
    "expiresAt": 1735693200000
  }
}
```

::: warning Concurrent Access
The file store is not safe for concurrent access across multiple processes. If you need multi-process support, implement a custom storage provider with proper locking mechanisms.
:::

## Storage Key Management

Storage keys namespace tokens for different applications or environments:

### Single Application

```typescript
const authProvider = browserAuth({
  store: fileStore(),
  storeKey: "my-app", // Default: "mcp-tokens"
});
```

### Multiple Applications

```typescript
// App 1
const app1Auth = browserAuth({
  store: fileStore(),
  storeKey: "app1-tokens",
});

// App 2 (same file, different key)
const app2Auth = browserAuth({
  store: fileStore(),
  storeKey: "app2-tokens",
});
```

### Environment Separation

```typescript
const authProvider = browserAuth({
  store: fileStore(),
  storeKey: `${process.env.APP_NAME}-${process.env.NODE_ENV}`,
});
// Results in keys like: "myapp-dev", "myapp-staging", "myapp-prod"
```

## Custom Storage Implementations

Create custom storage providers by implementing the `TokenStore` or `OAuthStore` interface:

### Basic Custom Storage

#### Redis Storage Example

```typescript
import { TokenStore, Tokens } from "oauth-callback/mcp";
import Redis from "ioredis";

class RedisTokenStore implements TokenStore {
  private redis: Redis;
  private prefix: string;

  constructor(redis: Redis, prefix = "oauth:") {
    this.redis = redis;
    this.prefix = prefix;
  }

  async get(key: string): Promise<Tokens | null> {
    const data = await this.redis.get(this.prefix + key);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, tokens: Tokens): Promise<void> {
    const ttl = tokens.expiresAt
      ? Math.floor((tokens.expiresAt - Date.now()) / 1000)
      : undefined;

    if (ttl && ttl > 0) {
      await this.redis.setex(this.prefix + key, ttl, JSON.stringify(tokens));
    } else {
      await this.redis.set(this.prefix + key, JSON.stringify(tokens));
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }

  async clear(): Promise<void> {
    const keys = await this.redis.keys(this.prefix + "*");
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Usage
const redis = new Redis();
const authProvider = browserAuth({
  store: new RedisTokenStore(redis),
});
```

#### SQLite Storage Example

```typescript
import { TokenStore, Tokens } from "oauth-callback/mcp";
import Database from "better-sqlite3";

class SQLiteTokenStore implements TokenStore {
  private db: Database.Database;

  constructor(dbPath = "./tokens.db") {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        key TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at INTEGER,
        scope TEXT,
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
  }

  async get(key: string): Promise<Tokens | null> {
    const row = this.db.prepare("SELECT * FROM tokens WHERE key = ?").get(key);

    if (!row) return null;

    return {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: row.expires_at,
      scope: row.scope,
    };
  }

  async set(key: string, tokens: Tokens): Promise<void> {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO tokens 
      (key, access_token, refresh_token, expires_at, scope)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(
        key,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresAt,
        tokens.scope,
      );
  }

  async delete(key: string): Promise<void> {
    this.db.prepare("DELETE FROM tokens WHERE key = ?").run(key);
  }

  async clear(): Promise<void> {
    this.db.prepare("DELETE FROM tokens").run();
  }
}

// Usage
const authProvider = browserAuth({
  store: new SQLiteTokenStore("./oauth-tokens.db"),
});
```

### Advanced Custom Storage

#### Full OAuthStore Implementation

```typescript
import {
  OAuthStore,
  Tokens,
  ClientInfo,
  OAuthSession,
} from "oauth-callback/mcp";
import { MongoClient, Db } from "mongodb";

class MongoOAuthStore implements OAuthStore {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  // TokenStore methods
  async get(key: string): Promise<Tokens | null> {
    const doc = await this.db.collection("tokens").findOne({ _id: key });

    return doc
      ? {
          accessToken: doc.accessToken,
          refreshToken: doc.refreshToken,
          expiresAt: doc.expiresAt,
          scope: doc.scope,
        }
      : null;
  }

  async set(key: string, tokens: Tokens): Promise<void> {
    await this.db
      .collection("tokens")
      .replaceOne(
        { _id: key },
        { _id: key, ...tokens, updatedAt: new Date() },
        { upsert: true },
      );
  }

  async delete(key: string): Promise<void> {
    await this.db.collection("tokens").deleteOne({ _id: key });
  }

  async clear(): Promise<void> {
    await this.db.collection("tokens").deleteMany({});
  }

  // OAuthStore additional methods
  async getClient(key: string): Promise<ClientInfo | null> {
    const doc = await this.db.collection("clients").findOne({ _id: key });

    return doc
      ? {
          clientId: doc.clientId,
          clientSecret: doc.clientSecret,
          clientIdIssuedAt: doc.clientIdIssuedAt,
          clientSecretExpiresAt: doc.clientSecretExpiresAt,
        }
      : null;
  }

  async setClient(key: string, client: ClientInfo): Promise<void> {
    await this.db
      .collection("clients")
      .replaceOne(
        { _id: key },
        { _id: key, ...client, updatedAt: new Date() },
        { upsert: true },
      );
  }

  async getSession(key: string): Promise<OAuthSession | null> {
    const doc = await this.db.collection("sessions").findOne({ _id: key });

    return doc
      ? {
          codeVerifier: doc.codeVerifier,
          state: doc.state,
        }
      : null;
  }

  async setSession(key: string, session: OAuthSession): Promise<void> {
    await this.db
      .collection("sessions")
      .replaceOne(
        { _id: key },
        { _id: key, ...session, updatedAt: new Date() },
        { upsert: true },
      );
  }
}

// Usage
const client = new MongoClient("mongodb://localhost:27017");
await client.connect();
const db = client.db("oauth");

const authProvider = browserAuth({
  store: new MongoOAuthStore(db),
});
```

## Storage Security

### Encryption at Rest

Implement encryption for sensitive token storage:

```typescript
import { TokenStore, Tokens } from "oauth-callback/mcp";
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

class EncryptedTokenStore implements TokenStore {
  private store: TokenStore;
  private key: Buffer;

  constructor(store: TokenStore, password: string) {
    this.store = store;
  }

  async init(password: string) {
    // Derive key from password
    const salt = randomBytes(16);
    this.key = (await promisify(scrypt)(password, salt, 32)) as Buffer;
  }

  private encrypt(data: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      encrypted,
    });
  }

  private decrypt(encryptedData: string): string {
    const { iv, authTag, encrypted } = JSON.parse(encryptedData);

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(iv, "hex"),
    );

    decipher.setAuthTag(Buffer.from(authTag, "hex"));

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  async get(key: string): Promise<Tokens | null> {
    const encrypted = await this.store.get(key);
    if (!encrypted) return null;

    try {
      const decrypted = this.decrypt(JSON.stringify(encrypted));
      return JSON.parse(decrypted);
    } catch {
      return null; // Decryption failed
    }
  }

  async set(key: string, tokens: Tokens): Promise<void> {
    const encrypted = this.encrypt(JSON.stringify(tokens));
    await this.store.set(key, JSON.parse(encrypted));
  }

  async delete(key: string): Promise<void> {
    await this.store.delete(key);
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }
}

// Usage
const encryptedStore = new EncryptedTokenStore(
  fileStore(),
  process.env.ENCRYPTION_PASSWORD!,
);
await encryptedStore.init(process.env.ENCRYPTION_PASSWORD!);

const authProvider = browserAuth({
  store: encryptedStore,
});
```

### Secure File Permissions

When using file storage, ensure proper permissions:

```typescript
import { chmod } from "fs/promises";

class SecureFileStore implements TokenStore {
  private store: TokenStore;
  private filepath: string;

  constructor(filepath: string) {
    this.filepath = filepath;
    this.store = fileStore(filepath);
  }

  async set(key: string, tokens: Tokens): Promise<void> {
    await this.store.set(key, tokens);
    // Ensure file is only readable by owner
    await chmod(this.filepath, 0o600);
  }

  // ... other methods delegate to store
}
```

## Storage Patterns

### Multi-Tenant Storage

Support multiple tenants with isolated storage:

```typescript
class TenantAwareStore implements TokenStore {
  private stores = new Map<string, TokenStore>();

  getStore(tenantId: string): TokenStore {
    if (!this.stores.has(tenantId)) {
      this.stores.set(tenantId, fileStore(`~/.oauth/${tenantId}/tokens.json`));
    }
    return this.stores.get(tenantId)!;
  }

  async get(key: string): Promise<Tokens | null> {
    const [tenantId, tokenKey] = key.split(":");
    return this.getStore(tenantId).get(tokenKey);
  }

  async set(key: string, tokens: Tokens): Promise<void> {
    const [tenantId, tokenKey] = key.split(":");
    return this.getStore(tenantId).set(tokenKey, tokens);
  }

  // ... other methods
}

// Usage
const authProvider = browserAuth({
  store: new TenantAwareStore(),
  storeKey: `${tenantId}:${appName}`,
});
```

### Cached Storage

Add caching layer for performance:

```typescript
class CachedTokenStore implements TokenStore {
  private cache = new Map<string, { tokens: Tokens; expires: number }>();
  private store: TokenStore;
  private ttl: number;

  constructor(store: TokenStore, ttlSeconds = 300) {
    this.store = store;
    this.ttl = ttlSeconds * 1000;
  }

  async get(key: string): Promise<Tokens | null> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expires) {
      return cached.tokens;
    }

    // Load from store
    const tokens = await this.store.get(key);
    if (tokens) {
      this.cache.set(key, {
        tokens,
        expires: Date.now() + this.ttl,
      });
    }

    return tokens;
  }

  async set(key: string, tokens: Tokens): Promise<void> {
    // Update both cache and store
    this.cache.set(key, {
      tokens,
      expires: Date.now() + this.ttl,
    });
    await this.store.set(key, tokens);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    await this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    await this.store.clear();
  }
}

// Usage
const authProvider = browserAuth({
  store: new CachedTokenStore(fileStore(), 600), // 10 min cache
});
```

## Testing Storage Providers

### Mock Storage for Tests

```typescript
import { TokenStore, Tokens } from "oauth-callback/mcp";

class MockTokenStore implements TokenStore {
  private data = new Map<string, Tokens>();
  public getCalls: string[] = [];
  public setCalls: Array<{ key: string; tokens: Tokens }> = [];

  async get(key: string): Promise<Tokens | null> {
    this.getCalls.push(key);
    return this.data.get(key) ?? null;
  }

  async set(key: string, tokens: Tokens): Promise<void> {
    this.setCalls.push({ key, tokens });
    this.data.set(key, tokens);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  // Test helper methods
  reset() {
    this.data.clear();
    this.getCalls = [];
    this.setCalls = [];
  }

  setTestData(key: string, tokens: Tokens) {
    this.data.set(key, tokens);
  }
}

// Usage in tests
describe("OAuth Flow", () => {
  let mockStore: MockTokenStore;

  beforeEach(() => {
    mockStore = new MockTokenStore();
    mockStore.setTestData("test-key", {
      accessToken: "test-token",
      expiresAt: Date.now() + 3600000,
    });
  });

  it("should use stored tokens", async () => {
    const authProvider = browserAuth({
      store: mockStore,
      storeKey: "test-key",
    });

    // Test your OAuth flow
    expect(mockStore.getCalls).toContain("test-key");
  });
});
```

## Migration Strategies

### Migrating Storage Backends

```typescript
async function migrateStorage(
  source: TokenStore,
  target: TokenStore,
  keys?: string[],
) {
  // If no keys specified, migrate all (if source supports listing)
  const keysToMigrate = keys || ["mcp-tokens"]; // Default key

  for (const key of keysToMigrate) {
    const tokens = await source.get(key);
    if (tokens) {
      await target.set(key, tokens);
      console.log(`Migrated tokens for key: ${key}`);
    }
  }

  console.log("Migration complete");
}

// Example: Migrate from file to Redis
const fileStorage = fileStore();
const redisStorage = new RedisTokenStore(redis);

await migrateStorage(fileStorage, redisStorage);
```

### Upgrading Token Format

```typescript
class LegacyAdapter implements TokenStore {
  private store: TokenStore;

  constructor(store: TokenStore) {
    this.store = store;
  }

  async get(key: string): Promise<Tokens | null> {
    const data = await this.store.get(key);
    if (!data) return null;

    // Handle legacy format
    if ("access_token" in (data as any)) {
      return {
        accessToken: (data as any).access_token,
        refreshToken: (data as any).refresh_token,
        expiresAt: (data as any).expires_at,
        scope: (data as any).scope,
      };
    }

    return data;
  }

  // ... other methods
}
```

## Best Practices

### Choosing a Storage Provider

| Scenario               | Recommended Storage   | Reason                |
| ---------------------- | --------------------- | --------------------- |
| Development/Testing    | `inMemoryStore()`     | No persistence needed |
| CLI Tools (single-use) | `inMemoryStore()`     | Security, simplicity  |
| Desktop Apps           | `fileStore()`         | User convenience      |
| Server Applications    | Custom (Redis/DB)     | Scalability, sharing  |
| High Security          | `inMemoryStore()`     | No disk persistence   |
| Multi-tenant           | Custom implementation | Isolation required    |

### Storage Key Conventions

```typescript
// Use hierarchical keys for organization
const key = `${organization}:${application}:${environment}`;

// Examples:
("acme:billing-app:production");
("acme:billing-app:staging");
("personal:cli-tool:default");
```

### Error Handling

Always handle storage failures gracefully:

```typescript
class ResilientTokenStore implements TokenStore {
  private primary: TokenStore;
  private fallback: TokenStore;

  constructor(primary: TokenStore, fallback: TokenStore) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async get(key: string): Promise<Tokens | null> {
    try {
      return await this.primary.get(key);
    } catch (error) {
      console.warn("Primary storage failed, using fallback:", error);
      return await this.fallback.get(key);
    }
  }

  async set(key: string, tokens: Tokens): Promise<void> {
    try {
      await this.primary.set(key, tokens);
      // Also update fallback for consistency
      await this.fallback.set(key, tokens).catch(() => {});
    } catch (error) {
      console.warn("Primary storage failed, using fallback:", error);
      await this.fallback.set(key, tokens);
    }
  }

  // ... other methods
}

// Usage: Redis with file fallback
const authProvider = browserAuth({
  store: new ResilientTokenStore(new RedisTokenStore(redis), fileStore()),
});
```

## Related APIs

- [`browserAuth`](/api/browser-auth) - OAuth provider using storage
- [`TokenStore` Types](/api/types#tokenstore) - TypeScript interfaces
- [`OAuthError`](/api/oauth-error) - Error handling
