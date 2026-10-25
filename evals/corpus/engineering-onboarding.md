# Engineering Onboarding Guide

Welcome to the Lumen Labs engineering team. This guide (sample data for the DocuMind demo) explains how we build and ship software.

## Your First Week

On day one you pair with your onboarding buddy, who is assigned by your engineering manager before you start. By the end of your first week you should have the firmware and cloud repositories building locally and have shipped one small change to production.

## Development Workflow

### Branches and Pull Requests

All work happens on short-lived branches that are merged into `main` through pull requests. Every pull request needs at least one approving review, and changes to firmware need two approvals because firmware updates are hard to roll back. Pull requests should stay under 400 changed lines where possible.

### Continuous Integration

CI runs the linter, unit tests and hardware-in-the-loop tests on every pull request. A pull request cannot be merged while CI is red.

## Deployments

### Cloud Services

The cloud backend is deployed to production automatically when a pull request is merged into `main`. Deploys are blocked on Fridays after 14:00 and during the last week of December.

### Firmware Releases

Firmware is released every two weeks. Each release is rolled out in stages: 5% of devices on day one, 25% on day three and all devices on day seven, as long as the crash rate stays below 0.1%.

## On-Call

Engineers join the on-call rotation after their third month. A rotation shift lasts one week, from Monday 10:00 to the following Monday 10:00. The on-call engineer must acknowledge a page within 15 minutes and receives a flat on-call allowance of 300 EUR per week.

## Tooling

We write cloud services in TypeScript and firmware in Rust. Infrastructure is managed with Terraform, and production metrics live in Grafana.
