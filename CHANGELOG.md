# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-02-05

### Added
- Domain mode with Caddy TLS, custom login, and forward_auth for external access.
- Agent roster table and API endpoints for agents.
- Automations foundation and bundled skill artifact for releases.
- Realtime SSE events with targeted UI cache invalidation.
- Install scripts, remote access docs, and agent-driven install flow.
- CODEOWNERS and Dependabot automation for repo hygiene.

### Changed
- Hardened API auth, CORS policy, and cookie handling.
- CI updated to Node 22 and required checks; dependency updates for GitHub Actions and UI libs.
- Improved documentation around licensing, security policy, and installation.

### Fixed
- Safer Caddy caching defaults and HSTS gating after HTTPS is verified.
- Chat/session integration via OpenResponses updates.

## [0.1.0] - 2026-02-04
