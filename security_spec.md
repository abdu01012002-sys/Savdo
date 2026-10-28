# Security Specification

## Data Invariants
1. Transactions: A transaction cannot exist without a valid date.
2. DbState: Can only be modified by authorized admins.
3. Kontragentlar: Only modifiable by authorized users.

## The Dirty Dozen Payloads
(Simulated payloads for testing rules)

1. Poisoned ID: Transaction with ID ".." or "../../.."
2. Shadow Field: Transaction with a field "isAdmin: true"
3. Invalid Type: Transaction with "summa: 'not-a-number'"
4. Spoof Owner: Transaction with "kimdan: 'hacker-uid'"
5. Unverified Email: Access attempt with email_verified: false
6. PII Leak: Read request for Kontragentlar by non-owner.
7. Terminal State: Updating a "completed" transaction.
8. Orphaned Write: Creating a transaction without a valid project/user ID reference (if applicable).
9. Size Exhaustion: Creating a 2MB note in Izoh field.
10. System Field Injection: Updating "createdAt" to current time.
11. Privilege Escalation: Updating "role" in User profile.
12. Query Scraping: Listing all transactions as a regular user.
