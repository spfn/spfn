# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial alpha release preparation

## [0.1.0-alpha.1] - 2025-01-09

### Added
- **@spfn/core**: Core framework with routing, database, and transaction management
- **@spfn/cli**: CLI tool for project initialization and development
- **@spfn/auth**: Client-key based authentication system
- **spfn**: Wrapper package for better DX

### Features
- File-based routing with contract validation
- Type-safe database operations with Drizzle ORM
- Repository pattern with pagination support
- AsyncLocalStorage-based transaction management
- Redis caching with master-replica support
- Auto-generated type-safe client
- CRUD generation command
- Development server with hot reload

### Documentation
- Complete README with quick start guide
- Module-specific documentation
- Contributing guidelines
- Release guide

---

**Note**: This is an alpha release. APIs may change without notice. Not recommended for production use.

[Unreleased]: https://github.com/spfn/spfn/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/spfn/spfn/releases/tag/v0.1.0-alpha.1