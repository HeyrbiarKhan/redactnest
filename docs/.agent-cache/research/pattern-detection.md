# Pattern Detection Research Cache

**Date:** 2026-09-27

## Corrections from direct measurement (2026-09-27, spec 0005)

These replace the matching lines below, which came from a web check before the package was installed and tested.

- libphonenumber-js is at **1.13.14**. `package.json` says MIT; the package also ships `LICENSE.Apache` for Google's metadata.
- Metadata sizes before compression: `max` **157 KB**, `min` **84 KB**. The README confirms `isValid()` checks digits only with `max`; with `min` it checks length only, like `isPossible()`.
- `findPhoneNumbersInText` returns valid numbers only. `findNumbers(text, { defaultCountry, v2: true, leniency: "POSSIBLE" })` also returns possible ones; `leniency` accepts `POSSIBLE` and `VALID` and is not in the package's types.
- The OWASP ReDoS page's long standing address is https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS (the `community.owasp.org` form below was not used).
- The full measurements are in `docs/specs/0005-pattern-detection/rationale.md`.

## 1. libphonenumber-js (npm package by catamphetamine)

**GitHub:** https://github.com/catamphetamine/libphonenumber-js

**Version:** 1.11.17 (GitLab reference); 1.7.25 (npm registry reference visible). UNCONFIRMED: current latest version (npm registry access restricted).

**License:** MIT and Apache 2.0 (dual-licensed)

**API Methods:**
- `findPhoneNumbersInText(text)`: Returns array of matches with location data
- `searchPhoneNumbersInText(text)`: ES6 iterator version for async processing

**Result Object Properties:**
- `startsAt`: character position where number begins
- `endsAt`: character position where number ends
- `number`: PhoneNumber instance containing parsed details (includes country, countryCallingCode, E.164 format, nationalNumber, optional ext)

**Metadata Sets:**
- `min` (~80 KB): smallest bundle, length validation only
- `max` (~145 KB): complete metadata including phone type detection
- `mobile` (~95 KB): full features for mobile numbers only
- `core`: custom metadata for specific countries

**Validation Notes:**
- UNCONFIRMED: whether `isValid()` is accurate with `min` metadata or requires `max`
- `min` performs length validation only; type detection requires `max`

---

## 2. IBAN (International Bank Account Number)

**Official Registry:** https://www.swift.com/standards/data-standards/iban-international-bank-account-number

**Standard:** ISO 13616 (SWIFT acts as registration authority)

**IBAN Registry Details:**
- Available in PDF and .txt format from SWIFT
- UNCONFIRMED: Direct link to IBAN Registry PDF (access restricted at https://www.swift.com/sites/default/files/documents/iban_registry_0.pdf)
- Per-country IBAN lengths: 15 to 33 characters
- Example: Norway 15 chars (4-char header + 11-char BBAN), Russia 33 chars, Germany 22 chars

**Validation:** ISO 13616 mod 97 (ISO 7064 MOD 97-10): check digit calculation validates to mod 97 equal to 1

**Reference:** https://en.wikipedia.org/wiki/International_Bank_Account_Number (structure and country details)

---

## 3. UK National Insurance Number Format

**Reference:** gov.uk HMRC National Insurance Manual section NIM39115
**URL:** https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim39115
**Note:** Content withheld under Freedom of Information Act 2000

**Confirmed Rules (from HMRC guidance sources):**
- Format: 2 letters + 6 digits + 1 letter (QQ 12 34 56 A)
- Letters NEVER used as first prefix letter: D, F, I, Q, U, V
- Letters NEVER used as second prefix letter: D, F, I, O, Q, U, V
- Suffix letters: A, B, C, or D only
- UNCONFIRMED: Which specific two-letter prefixes are never allocated (NIM39115 content not accessible)

**Reference:** https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim39120 (related guidance, also checked)

---

## 4. US Social Security Number Format Rules

**Official Source:** https://www.ssa.gov/employer/randomizationfaqs.html

**Never-Issued Rules (permanent under randomization system since 2011-06-25):**
- Area 000: never assigned, always invalid
- Area 666: never assigned, never will be
- Areas 900–999: reserved, never assigned (ITINs start with 9 instead)
- Group 00 (middle two digits): never issued
- Serial 0000 (final four digits): never issued

**SSN Structure:** AAA-GG-SSSS (Area-Group-Serial)

---

## 5. Payment Card Issuer Prefixes and Luhn Algorithm

**Standard:** ISO/IEC 7812 (Identification of Issuers)

**IIN Prefix Ranges:**
- **Mastercard:** 2221–2720, 51–55 (16 digits)
- **Visa:** 4 (13, 16, or 19 digits)
- **American Express:** 34, 37 (15 digits)
- **Discover Card:** 6011, 644–649, 65 (16–19 digits)
- **JCB:** 3528–3589 (16–19 digits)
- **Diners Club International:** 30, 36, 38, 39 (14–19 digits)
- **China UnionPay:** 62 (16–19 digits)

**Card Length Range:** 13–19 digits (varies by issuer)

**Luhn Algorithm:** ISO/IEC 7812 check digit, applied to all card numbers

**Reference:** https://en.wikipedia.org/wiki/Payment_card_number

---

## 6. OWASP Regular Expression Denial of Service (ReDoS)

**Official OWASP Page:** https://community.owasp.org/attacks/Regular_expression_Denial_of_Service_-_ReDoS
**Legacy URL (redirects):** https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS

**Definition:**
ReDoS exploits vulnerabilities in regex implementations that use backtracking algorithms, causing exponential time complexity with crafted input.

**Evil Regex Patterns:**
- `(a+)+$`: nested quantifiers
- `([a-zA-Z]+)*$`: nested quantifiers with wildcard
- `(a|aa)+$`: alternation with overlapping characters

**Attack Mechanism:**
Malicious input (e.g., repeated characters followed by non-matching character) forces engine to test exponentially more paths during backtracking.

**OWASP Recommendations:**
- Audit regex patterns for evil characteristics before deployment
- Use efficient regex implementations (e.g., RE2 with linear time guarantees)
- Validate and limit user input before using in regex
- Implement timeout mechanisms for regex operations
- Use vetted patterns from OWASP Validation Regex Repository

**Reference:** https://community.owasp.org/attacks/Regular_expression_Denial_of_Service_-_ReDoS

---

## Summary of Unconfirmed Items

1. libphonenumber-js: exact current version (npm registry restricted)
2. libphonenumber-js: whether `isValid()` requires `max` metadata or works with `min`
3. IBAN: direct SWIFT Registry PDF link (access restricted)
4. IBAN: confirmed validation formula details (ISO 13616 mod 97 = 1)
5. UK NI: specific never-allocated two-letter prefix combinations (NIM39115 content withheld)
6. Payment cards/Luhn: reference to ISO 7064 MOD 97-10 for IBAN (not yet cross-checked)
