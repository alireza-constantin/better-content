# ADR-008: Encrypt Social Provider Credentials at the Application Layer

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead
- **Security significance:** High

## Context

Automatic analytics retrieval may require OAuth access and refresh tokens for creator social accounts.

These credentials are sensitive. A database compromise must not automatically expose plaintext provider tokens.

## Decision

Social provider access and refresh tokens will be encrypted before database persistence using authenticated encryption.

V1 recommended primitive:

**AES-256-GCM**

The encryption key is supplied through deployment secret management/environment configuration and is never stored in PostgreSQL.

Encrypted records retain metadata required for safe decryption and rotation, including a key version and nonce/IV as required by the implementation.

## Additional rules

- Provider tokens are server-only.
- Provider tokens are never written to browser storage.
- Provider tokens are never logged.
- OAuth state must be validated.
- Minimal required provider scopes should be requested.
- Revoked/expired credentials must be handled explicitly.
- Key rotation must be possible through `encryption_key_version`.

## Consequences

### Positive

- Reduces impact of database-only compromise.
- Provides explicit credential-handling discipline.
- Supports future key rotation.

### Negative

- Adds encryption/key-management code.
- Key loss would make existing encrypted credentials unusable.
- Key rotation must be operationally managed.

## Rejected alternatives

### Store plaintext tokens

Rejected as an unacceptable security posture.

### Store encryption key beside ciphertext in PostgreSQL

Rejected because it defeats the security boundary.
