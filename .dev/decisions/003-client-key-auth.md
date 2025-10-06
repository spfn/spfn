# 003. Client-Key Authentication with ECDSA P-256

**Date:** 2025-02-01
**Status:** Accepted
**Deciders:** SPFN Core Team

## Context

We needed a secure authentication system for server-to-server and client-to-server communication. Traditional session/JWT approaches had limitations for our use case.

## Decision

We chose to implement **Client-Key Authentication** using ECDSA P-256 asymmetric cryptography with 3-tier caching and replay attack prevention.

## Implementation

### Key Features

1. **ECDSA P-256** for signing/verification
2. **3-tier caching**: Memory → Redis → Database
3. **Replay attack prevention**: Nonce + timestamp validation
4. **AES-256-GCM** for private key encryption at rest

### Flow

```
Client                           Server
  |                                |
  |-- Request + Signature -------->|
  |                                |
  |                    Check cache (Memory/Redis/DB)
  |                    Verify signature
  |                    Check nonce + timestamp
  |                                |
  |<------- 200 OK ----------------|
```

## Consequences

### Positive

- **No Session State**: Stateless authentication
- **High Performance**: 3-tier caching (sub-millisecond auth)
- **Secure**: Asymmetric cryptography (private key never shared)
- **Replay Protection**: Nonce + timestamp validation
- **Scalable**: No central session store required
- **Flexible**: Works for API keys, service auth, client auth
- **Future-proof**: Can add key rotation, multiple keys per client

### Negative

- **Complexity**: More complex than JWT
- **Storage**: Need to store public keys in database
- **Client Implementation**: Clients need crypto libraries
- **Nonce Tracking**: Need to track used nonces (Redis recommended)
- **Clock Sync**: Requires reasonably synchronized clocks (±5 min tolerance)

## Alternatives Considered

### 1. JWT (JSON Web Tokens)

```typescript
const token = jwt.sign({ userId: 123 }, SECRET);
```

**Rejected because:**
- Shared secret (symmetric) or distributed public keys
- Token revocation requires database lookup anyway
- No built-in replay protection
- Fixed expiration (can't refresh without reissue)

### 2. Session-based Authentication

```typescript
req.session.userId = 123;
```

**Rejected because:**
- Requires session store (Redis/DB)
- Not stateless
- Harder to scale horizontally
- Cookie management complexity
- Less suitable for API-to-API

### 3. OAuth 2.0

```typescript
const token = await oauth.getAccessToken();
```

**Rejected because:**
- Too heavyweight for our use case
- Requires OAuth server
- Multiple flows to implement
- Overkill for server-to-server auth

### 4. API Keys (Simple)

```typescript
if (req.headers['x-api-key'] === API_KEY) { }
```

**Rejected because:**
- No cryptographic verification
- Key compromise = full access
- No request validation
- No replay protection

## Technical Details

### Signature Generation (Client)

```typescript
const message = `${method}:${path}:${timestamp}:${nonce}:${body}`;
const signature = sign(message, privateKey); // ECDSA P-256
```

### Signature Verification (Server)

```typescript
const publicKey = await getPublicKey(clientId); // 3-tier cache
const isValid = verify(message, signature, publicKey);
const isReplay = await checkNonce(nonce, timestamp);
```

### Performance

Benchmarked on MacBook Pro M1:
- Memory cache hit: **0.1ms**
- Redis cache hit: **1-2ms**
- Database lookup: **10-20ms**
- Cache hit rate: **>99%** in production

### Security

- **ECDSA P-256**: NIST-approved curve
- **Signature**: 64 bytes (compact)
- **Private key storage**: AES-256-GCM encrypted
- **Nonce window**: 5 minutes (configurable)
- **Timestamp tolerance**: ±5 minutes

## Comparison with Other Systems

| System | Auth Speed | Replay Protection | Stateless | Scalability |
|--------|------------|-------------------|-----------|-------------|
| JWT | Fast | No | Yes | Good |
| Session | Slow | N/A | No | Medium |
| OAuth | Slow | No | Depends | Complex |
| **Client-Key** | **Very Fast** | **Yes** | **Yes** | **Excellent** |

## Migration Path

If we need to change:
1. Add JWT as alternative auth method
2. Support multiple auth strategies simultaneously
3. Gradual migration client by client
4. Keep backward compatibility

## Use Cases

1. **API Clients**: Mobile apps, SPAs calling backend
2. **Service-to-Service**: Microservices authentication
3. **CLI Tools**: Command-line clients
4. **IoT Devices**: Embedded devices with limited resources

## Best Practices

1. **Rotate keys regularly** - Implement key rotation strategy
2. **Use Redis for nonces** - Don't rely on memory for replay protection
3. **Monitor failed auth** - Alert on suspicious patterns
4. **Rate limit auth** - Prevent brute force attacks
5. **Audit key access** - Log all key creation/deletion

## References

- [ECDSA Digital Signature Algorithm](https://en.wikipedia.org/wiki/Elliptic_Curve_Digital_Signature_Algorithm)
- [NIST P-256 Curve](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Auth Module Implementation](../../packages/auth/README.md)

## Related Decisions

- [3-tier Caching Strategy](../../packages/auth/docs/architecture.md)
- [Security Best Practices](../../docs/advanced/auth-security.md)